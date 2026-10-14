import io
import json
import sys

import pytest

from link_sense import host, native


@pytest.fixture
def fake_history(monkeypatch):
    def _set(entries):
        monkeypatch.setattr(host.history, "read_all", lambda browser, limit: entries)

    return _set


def _analyze(**kw):
    return host.handle({"type": "analyze", "id": 7, **kw})


def test_analyze_splits_candidates_and_saved(temp_store, make_entry, fake_history):
    temp_store.add("https://saved.example/", title="Saved", folder="Work")
    fake_history([make_entry("https://saved.example/", visits=4), make_entry("https://new.example/", visits=2)])

    resp = _analyze()

    assert resp["type"] == "analyze"
    assert resp["id"] == 7
    assert [c["url"] for c in resp["candidates"]] == ["https://new.example/"]
    assert resp["saved"][0]["url"] == "https://saved.example/"
    assert resp["saved"][0]["folder"] == "Work"
    assert resp["truncated"] is False
    assert isinstance(resp["candidates"][0]["last_visit_time"], str)


def test_analyze_includes_saved_without_history(temp_store, make_entry, fake_history):
    temp_store.add("https://gone.example/", title="Gone", folder="Misc")
    fake_history([make_entry("https://new.example/")])

    saved = _analyze()["saved"]

    assert saved[0]["url"] == "https://gone.example/"
    assert saved[0]["score"] == 0.0
    assert saved[0]["folder"] == "Misc"


def test_analyze_respects_max_results(temp_store, make_entry, fake_history):
    fake_history([make_entry(f"https://s{i}.example/", visits=i + 1) for i in range(10)])

    resp = _analyze(max_results=3)

    assert len(resp["candidates"]) == 3
    assert resp["truncated"] is True
    assert resp["candidates"][0]["url"] == "https://s9.example/"  # highest score kept


def test_analyze_truncates_to_fit_budget_keeping_top_scores(temp_store, make_entry, fake_history):
    big = "x" * 5000
    fake_history([make_entry(f"https://s{i}.example/", visits=i + 1, title=big) for i in range(400)])

    resp = _analyze()

    assert resp["truncated"] is True
    assert len(json.dumps(resp, ensure_ascii=False).encode()) <= host.RESPONSE_BUDGET
    assert resp["candidates"][0]["url"] == "https://s399.example/"


def test_analyze_without_history_is_an_error(temp_store, fake_history):
    fake_history([])

    resp = _analyze()

    assert resp["type"] == "error"
    assert "No history" in resp["message"]
    assert resp["id"] == 7


def test_apply_adds_and_removes(temp_store):
    temp_store.add("https://old.example/", title="Old")

    resp = host.handle(
        {
            "type": "apply",
            "id": 1,
            "adds": [{"url": "https://new.example/", "title": "New", "score": 2.5, "folder": "Work"}],
            "removes": ["https://old.example/", "https://never.example/"],
        }
    )

    assert resp["added"] == ["https://new.example/"]
    assert resp["removed"] == ["https://old.example/"]
    assert resp["missing"] == ["https://never.example/"]
    stored = temp_store.all_bookmarks()
    assert stored["https://new.example/"]["folder"] == "Work"
    assert "https://old.example/" not in stored


@pytest.mark.parametrize(
    "payload",
    [
        {"adds": [{"url": "https://ok.example/"}, {"title": "no url"}], "removes": []},
        {"adds": "not a list", "removes": []},
        {"adds": [], "removes": "not a list"},
        {"adds": [], "removes": [123]},
    ],
)
def test_apply_rejects_bad_payload_without_partial_writes(temp_store, payload):
    resp = host.handle({"type": "apply", **payload})

    assert resp["type"] == "error"
    assert temp_store.all_bookmarks() == {}


def test_unknown_type_is_an_error():
    resp = host.handle({"type": "nope", "id": 3})
    assert resp == {"type": "error", "message": "unknown request type: 'nope'", "id": 3}


def test_non_object_request_is_an_error():
    assert host.handle([1, 2])["type"] == "error"


def _frames(*objs):
    buf = io.BytesIO()
    for o in objs:
        native.write_message(buf, o)
    return buf.getvalue()


def _read_all(data):
    stream = io.BytesIO(data)
    out = []
    while (msg := native.read_message(stream)) is not None:
        out.append(msg)
    return out


def test_main_answers_each_request_then_exits_on_eof(temp_store):
    stdin = io.BytesIO(_frames({"type": "apply", "id": 1, "adds": [], "removes": []}, {"type": "x", "id": 2}))
    stdout = io.BytesIO()

    host.main(stdin, stdout)

    replies = _read_all(stdout.getvalue())
    assert [r["id"] for r in replies] == [1, 2]
    assert replies[0]["type"] == "apply" and replies[1]["type"] == "error"


def test_main_survives_invalid_json_frame(temp_store):
    bad = b"not json"
    data = len(bad).to_bytes(4, "little") + bad + _frames({"type": "apply", "id": 2, "adds": [], "removes": []})
    stdout = io.BytesIO()

    host.main(io.BytesIO(data), stdout)

    replies = _read_all(stdout.getvalue())
    assert replies[0]["type"] == "error"
    assert replies[1]["type"] == "apply"


def test_main_stops_after_frame_error(temp_store):
    stdout = io.BytesIO()

    host.main(io.BytesIO(b"\x05\x00"), stdout)

    assert _read_all(stdout.getvalue())[0]["type"] == "error"


def test_oversized_response_becomes_an_error_with_id(temp_store, monkeypatch):
    monkeypatch.setitem(host.HANDLERS, "analyze", lambda req: {"type": "analyze", "blob": "x" * native.MAX_TO_BROWSER})
    stdout = io.BytesIO()

    host.main(io.BytesIO(_frames({"type": "analyze", "id": 9})), stdout)

    reply = _read_all(stdout.getvalue())[0]
    assert reply["type"] == "error" and reply["id"] == 9


class _FakeStd:
    def __init__(self, data=b""):
        self.buffer = io.BytesIO(data)


def test_run_keeps_stray_prints_off_the_protocol_stream(temp_store, monkeypatch, capsys):
    def noisy(req):
        print("stray output from a library")
        return {"type": "analyze", "candidates": [], "saved": [], "truncated": False}

    monkeypatch.setitem(host.HANDLERS, "analyze", noisy)
    fake_in = _FakeStd(_frames({"type": "analyze", "id": 1}))
    fake_out = _FakeStd()
    monkeypatch.setattr(sys, "stdin", fake_in)
    monkeypatch.setattr(sys, "stdout", fake_out)

    host.run()

    replies = _read_all(fake_out.buffer.getvalue())  # raises if any stray bytes precede/follow the frames
    assert len(replies) == 1 and replies[0]["id"] == 1
    assert "stray output" in capsys.readouterr().err
    assert sys.stdout is fake_out  # restored
