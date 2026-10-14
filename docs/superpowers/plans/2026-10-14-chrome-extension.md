# Link Sense Chrome Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user review ranked browser history and apply bookmark choices from a Chrome extension that talks to the Link Sense Python CLI over native messaging, updating both `bookmarks.json` and real Chrome bookmarks.

**Architecture:** A Python native-messaging host (`link-sense-host`) reuses the existing readers, scorer and store behind two JSON requests (`analyze`, `apply`). A Manifest V3 extension is the UI; its service worker owns the native port and mirrors successful applies into a `Link Sense` folder under "Other bookmarks". Pure logic (bookmark planning, UI grouping/payloads) lives in plain ES modules that Node tests cover.

**Tech Stack:** Python 3.10+, Typer, pytest; Chrome Manifest V3, vanilla ES modules, Node built-in test runner (`node --test`).

**Spec:** `docs/superpowers/specs/2026-10-14-chrome-extension-design.md`

## Global Constraints

- Chrome and Chromium only, Manifest V3. No Firefox host or extension.
- Host name is `com.linksense.host`; installer writes `com.linksense.host.json` to `~/.config/google-chrome/NativeMessagingHosts/` and `~/.config/chromium/NativeMessagingHosts/` (Linux only), creating directories if missing.
- Extension permissions are exactly `nativeMessaging`, `bookmarks`, `storage`.
- Native messages: 4-byte little-endian length prefix, then UTF-8 JSON. Host-to-browser messages must stay under 1 MB.
- `analyze` defaults: `limit` 2000 (per-browser history read), `max_results` 500. Responses are trimmed from the low-score end until the serialized JSON is at most 900 KB, and then carry `"truncated": true`.
- Request/response types are `analyze`, `apply`, `error`; every response echoes the request `id` when one was sent.
- Chrome bookmarks live in a `Link Sense` folder under "Other bookmarks", one subfolder per folder name; URLs with no folder go in the `Link Sense` root. Removals only touch the `Link Sense` tree. Existing URLs in the target folder are not duplicated.
- Chrome bookmark changes happen only for URLs the host reported as `added` / `removed`.
- The extension's `manifest.json` carries a pinned public `key`; only the public key is committed.
- The host must never write anything except protocol frames to the real stdout.
- No scoring logic is reimplemented in JavaScript.

## Review Focus

The spec's silence on these inputs is not permission to break. Each line has a test in the named task.

1. **Stray prints corrupt the stream** — any `print` in imported code during a request must not reach the protocol stdout (Task 3, `test_run_keeps_stray_prints_off_the_protocol_stream`).
2. **Non-ASCII titles** (Korean, emoji) — the length prefix counts bytes, not characters, and round-trips intact (Task 2, `test_round_trip_non_ascii`).
3. **Malformed `apply` payloads** — one bad item (missing `url`, non-list `adds`) must reject the whole request and leave the store untouched, not apply half (Task 3, `test_apply_rejects_bad_payload_without_partial_writes`).
4. **Huge titles / no history** — very large titles still fit the 900 KB budget with the highest scores kept, and an empty history gives a readable error, not a crash (Task 3, `test_analyze_truncates_*`, `test_analyze_without_history_is_an_error`).
5. **HTML in titles and URLs** — page titles come from untrusted pages and must render as text, never markup (Task 8, `ui-safety.test.mjs` plus the manual check in Task 9).

## File Structure

| File | Responsibility |
|---|---|
| `link_sense/history.py` (new) | Silent history reading: `read_by_browser`, `read_all` |
| `link_sense/analysis.py` (new) | `split(scored, saved)` into candidates and saved entries (extracted from `cli.analyze`) |
| `link_sense/native.py` (new) | Native-messaging framing |
| `link_sense/host.py` (new) | Request handlers, truncation, `main`, `run` |
| `link_sense/extension_id.py` (new) | `EXTENSION_ID` constant |
| `link_sense/installer.py` (new) | Host manifest content and installation |
| `link_sense/cli.py` (modify) | Use `history` / `analysis`; add `install-host` |
| `pyproject.toml` (modify) | `link-sense-host` script, `dev` extra with pytest |
| `extension/manifest.json` | MV3 manifest with pinned `key` |
| `extension/package.json` | `{"type":"module"}` and `npm test` |
| `extension/bookmark-tree.js` | Pure planner: `planSync`, `ROOT_TITLE` |
| `extension/service-worker.js` | Native port, request routing, bookmark execution |
| `extension/ui-model.js` | Pure UI logic: grouping, filtering, apply payload |
| `extension/ui.html`, `ui.css`, `ui.js` | The UI page |
| `tests/` | pytest suite |
| `extension/test/` | Node tests |

## Spec clarifications decided in this plan

- Saved entries in the `analyze` response carry an extra `folder` field (from the store), because the UI shows it and Retry sync needs it. Task 3 amends the spec line accordingly.
- In the UI, folder assignment applies to candidates being added. Saved bookmarks support Remove only (changing the folder of a saved bookmark is out of scope for this version).
- The service worker's `resync` request is the "Retry sync" button's backend: it calls `analyze` with `limit: 1, max_results: 0` and re-plans from `saved`.

---

### Task 1: Extract silent history reading and the candidate/saved split

**Files:**
- Create: `link_sense/history.py`, `link_sense/analysis.py`
- Create: `tests/conftest.py`, `tests/test_history.py`, `tests/test_analysis.py`, `tests/test_cli_analyze.py`
- Modify: `link_sense/cli.py` (the `_read_history` function and the candidate-splitting block in `analyze`)
- Modify: `pyproject.toml` (add `dev` extra)

**Interfaces:**
- Produces: `history.read_by_browser(browser: str, limit: int) -> dict[str, list[HistoryEntry]]` (keys `"chrome"` / `"firefox"`, only those selected by `browser` in `"chrome" | "firefox" | "auto"`); `history.read_all(browser: str, limit: int) -> list[HistoryEntry]`; `analysis.split(scored: list[ScoredEntry], saved: dict[str, dict]) -> tuple[list[ScoredEntry], list[ScoredEntry]]` returning `(candidates, saved_scored)`.
- Produces (test fixtures): `temp_store` (redirects `store._DATA_DIR` / `store._STORE` into `tmp_path`, returns the `store` module), `make_entry(url, visits=1, days=0.0, title=None) -> HistoryEntry`.

- [ ] **Step 1: Add the dev extra and shared fixtures**

In `pyproject.toml`, add below the `dependencies` list:

```toml
[project.optional-dependencies]
dev = ["pytest>=8"]
```

Create `tests/conftest.py`:

```python
from datetime import datetime, timedelta, timezone

import pytest

from link_sense import store
from link_sense.readers import HistoryEntry


@pytest.fixture
def temp_store(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "_DATA_DIR", tmp_path)
    monkeypatch.setattr(store, "_STORE", tmp_path / "bookmarks.json")
    return store


@pytest.fixture
def make_entry():
    def _make(url, visits=1, days=0.0, title=None):
        return HistoryEntry(
            url=url,
            title=title if title is not None else url,
            visit_count=visits,
            last_visit_time=datetime.now(timezone.utc) - timedelta(days=days),
        )

    return _make
```

Run: `pip install -e '.[dev]'`
Expected: installs pytest.

- [ ] **Step 2: Write a characterization test that passes on the current code**

Create `tests/test_cli_analyze.py`:

```python
from typer.testing import CliRunner

from link_sense import cli
from link_sense.readers import chrome, firefox


def test_analyze_writes_report(tmp_path, temp_store, make_entry, monkeypatch):
    monkeypatch.setattr(chrome, "read", lambda limit: [make_entry("https://a.example/page", visits=3)])
    monkeypatch.setattr(firefox, "read", lambda limit: [])
    out = tmp_path / "report.html"

    result = CliRunner().invoke(cli.app, ["analyze", "--no-open", "--output", str(out)])

    assert result.exit_code == 0, result.output
    assert "a.example" in out.read_text()
    assert "Chrome:" in result.output


def test_analyze_exits_when_no_history(tmp_path, temp_store, monkeypatch):
    monkeypatch.setattr(chrome, "read", lambda limit: [])
    monkeypatch.setattr(firefox, "read", lambda limit: [])

    result = CliRunner().invoke(cli.app, ["analyze", "--no-open", "--output", str(tmp_path / "r.html")])

    assert result.exit_code == 1
```

Run: `pytest tests/test_cli_analyze.py -v`
Expected: PASS (2 passed). If `a.example` is not in the report because the reporter escapes it, change the assertion to a string that is present in `report.html` for that URL; the point is to pin current behavior before refactoring.

- [ ] **Step 3: Write failing tests for the new modules**

Create `tests/test_history.py`:

```python
from link_sense import history
from link_sense.readers import chrome, firefox


def test_read_by_browser_auto_reads_both(make_entry, monkeypatch):
    monkeypatch.setattr(chrome, "read", lambda limit: [make_entry("https://c.example/")])
    monkeypatch.setattr(firefox, "read", lambda limit: [make_entry("https://f.example/")])

    found = history.read_by_browser("auto", 10)

    assert set(found) == {"chrome", "firefox"}
    assert found["chrome"][0].url == "https://c.example/"


def test_read_by_browser_single_browser(make_entry, monkeypatch):
    monkeypatch.setattr(chrome, "read", lambda limit: [make_entry("https://c.example/")])
    def must_not_run(limit):
        raise AssertionError("firefox reader must not be called")

    monkeypatch.setattr(firefox, "read", must_not_run)

    assert set(history.read_by_browser("chrome", 10)) == {"chrome"}


def test_read_all_flattens(make_entry, monkeypatch):
    monkeypatch.setattr(chrome, "read", lambda limit: [make_entry("https://c.example/")])
    monkeypatch.setattr(firefox, "read", lambda limit: [make_entry("https://f.example/")])

    urls = [e.url for e in history.read_all("auto", 10)]

    assert urls == ["https://c.example/", "https://f.example/"]
```

Create `tests/test_analysis.py`:

```python
from link_sense import analysis, scorer


def test_split_separates_candidates_from_saved(make_entry):
    scored = scorer.score([make_entry("https://a.example/", visits=5), make_entry("https://b.example/", visits=2)])
    saved = {"https://a.example/": {"title": "A", "folder": "Work"}}

    candidates, saved_scored = analysis.split(scored, saved)

    assert [e.url for e in candidates] == ["https://b.example/"]
    assert [e.url for e in saved_scored] == ["https://a.example/"]


def test_split_includes_saved_without_history_at_zero_score(make_entry):
    scored = scorer.score([make_entry("https://b.example/")])
    saved = {"https://gone.example/": {"title": "Gone", "folder": ""}}

    candidates, saved_scored = analysis.split(scored, saved)

    assert [e.url for e in candidates] == ["https://b.example/"]
    assert saved_scored[0].url == "https://gone.example/"
    assert saved_scored[0].title == "Gone"
    assert saved_scored[0].score == 0.0
    assert saved_scored[0].visit_count == 0


def test_split_with_empty_inputs():
    assert analysis.split([], {}) == ([], [])
```

Run: `pytest tests/test_history.py tests/test_analysis.py -v`
Expected: FAIL with `ImportError` / `cannot import name 'history'`.

- [ ] **Step 4: Implement the new modules**

Create `link_sense/history.py`:

```python
from link_sense.readers import HistoryEntry, chrome, firefox


def read_by_browser(browser: str, limit: int) -> dict[str, list[HistoryEntry]]:
    """Read history from the selected browsers. Never prints."""
    found: dict[str, list[HistoryEntry]] = {}
    if browser in ("chrome", "auto"):
        found["chrome"] = chrome.read(limit)
    if browser in ("firefox", "auto"):
        found["firefox"] = firefox.read(limit)
    return found


def read_all(browser: str, limit: int) -> list[HistoryEntry]:
    return [e for entries in read_by_browser(browser, limit).values() for e in entries]
```

Create `link_sense/analysis.py`:

```python
from datetime import datetime, timezone

from link_sense.scorer import ScoredEntry


def split(
    scored: list[ScoredEntry], saved: dict[str, dict]
) -> tuple[list[ScoredEntry], list[ScoredEntry]]:
    """Return (candidates not yet saved, saved entries).

    Saved bookmarks with no recent history are included with a zero score.
    """
    candidates = [e for e in scored if e.url not in saved]
    saved_scored = [e for e in scored if e.url in saved]
    have = {e.url for e in saved_scored}
    now = datetime.now(timezone.utc)
    for url, meta in saved.items():
        if url not in have:
            saved_scored.append(
                ScoredEntry(
                    url=url,
                    title=meta.get("title", url),
                    visit_count=0,
                    last_visit_time=now,
                    days_since_visit=0,
                    score=0.0,
                )
            )
    return candidates, saved_scored
```

Run: `pytest tests/test_history.py tests/test_analysis.py -v`
Expected: PASS (6 passed).

- [ ] **Step 5: Rewire `cli.py`**

In `link_sense/cli.py`, change the import line `from link_sense import scorer, store` to:

```python
from link_sense import analysis, history, scorer, store
```

Replace the whole `_read_history` function with:

```python
def _read_history(browser: str, limit: int) -> list[HistoryEntry]:
    entries: list[HistoryEntry] = []
    for name, found in history.read_by_browser(browser, limit).items():
        if found:
            console.print(f"[green]{name.capitalize()}:[/green] {len(found)} entries")
            entries.extend(found)
        elif browser == name:
            console.print(f"[yellow]{name.capitalize()} history not found.[/yellow]")
    return entries
```

In `analyze`, replace everything from `saved = store.all_bookmarks()` through the end of the `for url, meta in saved.items():` loop (the block that builds `candidates` and `bookmarks_scored`, including the inline `from datetime import ...` / `from link_sense.scorer import ScoredEntry` lines) with:

```python
    saved = store.all_bookmarks()
    candidates, bookmarks_scored = analysis.split(scored, saved)
```

Leave the `console.print(f"Candidates to add: ...")` line and everything after it unchanged.

- [ ] **Step 6: Run the whole suite**

Run: `pytest -v`
Expected: PASS (8 passed), including the two characterization tests from Step 2.

- [ ] **Step 7: Commit**

```bash
git add pyproject.toml link_sense/history.py link_sense/analysis.py link_sense/cli.py tests/
git commit -m "refactor: extract silent history reading and candidate split"
```

---

### Task 2: Native-messaging framing

**Files:**
- Create: `link_sense/native.py`
- Test: `tests/test_native.py`

**Interfaces:**
- Produces: `native.FrameError(Exception)`; `native.MAX_TO_BROWSER: int` (1024 * 1024); `native.MAX_FROM_BROWSER: int` (8 * 1024 * 1024); `native.read_message(stream) -> object | None` (`None` on clean EOF; raises `FrameError` on a truncated header/body or a length above `MAX_FROM_BROWSER`; raises `ValueError` — including `json.JSONDecodeError` — on a complete frame with invalid UTF-8/JSON); `native.write_message(stream, obj) -> None` (raises `FrameError` if the encoded body exceeds `MAX_TO_BROWSER`; flushes).

- [ ] **Step 1: Write the failing tests**

Create `tests/test_native.py`:

```python
import io
import struct

import pytest

from link_sense import native


def _roundtrip(obj):
    buf = io.BytesIO()
    native.write_message(buf, obj)
    buf.seek(0)
    return native.read_message(buf)


def test_round_trip():
    assert _roundtrip({"type": "analyze", "id": 1}) == {"type": "analyze", "id": 1}


def test_round_trip_non_ascii():
    obj = {"title": "합계 — 북마크 🔖"}
    buf = io.BytesIO()
    native.write_message(buf, obj)
    raw = buf.getvalue()
    (length,) = struct.unpack("<I", raw[:4])
    assert length == len(raw) - 4  # prefix counts bytes, not characters
    buf.seek(0)
    assert native.read_message(buf) == obj


def test_clean_eof_returns_none():
    assert native.read_message(io.BytesIO(b"")) is None


def test_truncated_header_raises():
    with pytest.raises(native.FrameError):
        native.read_message(io.BytesIO(b"\x05\x00"))


def test_truncated_body_raises():
    with pytest.raises(native.FrameError):
        native.read_message(io.BytesIO(struct.pack("<I", 10) + b"{}"))


def test_oversized_incoming_frame_raises():
    with pytest.raises(native.FrameError):
        native.read_message(io.BytesIO(struct.pack("<I", native.MAX_FROM_BROWSER + 1)))


def test_invalid_json_is_value_error():
    body = b"not json"
    with pytest.raises(ValueError):
        native.read_message(io.BytesIO(struct.pack("<I", len(body)) + body))


def test_oversized_outgoing_message_raises():
    with pytest.raises(native.FrameError):
        native.write_message(io.BytesIO(), {"blob": "x" * native.MAX_TO_BROWSER})


def test_two_messages_back_to_back():
    buf = io.BytesIO()
    native.write_message(buf, {"n": 1})
    native.write_message(buf, {"n": 2})
    buf.seek(0)
    assert native.read_message(buf) == {"n": 1}
    assert native.read_message(buf) == {"n": 2}
    assert native.read_message(buf) is None
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest tests/test_native.py -v`
Expected: FAIL with `ImportError` (no `native` module).

- [ ] **Step 3: Implement**

Create `link_sense/native.py`:

```python
import json
import struct

MAX_TO_BROWSER = 1024 * 1024  # Chrome rejects host-to-browser messages above 1 MB
MAX_FROM_BROWSER = 8 * 1024 * 1024  # our own cap so a bad length cannot exhaust memory


class FrameError(Exception):
    """The byte stream is not a valid native-messaging frame."""


def read_message(stream):
    header = stream.read(4)
    if not header:
        return None
    if len(header) < 4:
        raise FrameError("truncated length header")
    (length,) = struct.unpack("<I", header)
    if length > MAX_FROM_BROWSER:
        raise FrameError(f"incoming message too large ({length} bytes)")
    body = stream.read(length)
    if len(body) < length:
        raise FrameError("truncated message body")
    return json.loads(body.decode("utf-8"))


def write_message(stream, obj) -> None:
    body = json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if len(body) > MAX_TO_BROWSER:
        raise FrameError(f"outgoing message too large ({len(body)} bytes)")
    stream.write(struct.pack("<I", len(body)))
    stream.write(body)
    stream.flush()
```

- [ ] **Step 4: Run to verify pass**

Run: `pytest tests/test_native.py -v`
Expected: PASS (9 passed).

- [ ] **Step 5: Commit**

```bash
git add link_sense/native.py tests/test_native.py
git commit -m "feat: add native-messaging framing"
```

---

### Task 3: Native host handlers and entry point

**Files:**
- Create: `link_sense/host.py`
- Test: `tests/test_host.py`
- Modify: `pyproject.toml` (add script)
- Modify: `docs/superpowers/specs/2026-10-14-chrome-extension-design.md` (messages table note)

**Interfaces:**
- Consumes: `history.read_all`, `analysis.split`, `scorer.score` / `ScoredEntry`, `store.add/remove/all_bookmarks`, `native.read_message/write_message/FrameError`, fixtures `temp_store`, `make_entry`.
- Produces: `host.DEFAULT_LIMIT = 2000`, `host.DEFAULT_MAX_RESULTS = 500`, `host.RESPONSE_BUDGET = 900 * 1024`; `host.HANDLERS: dict[str, Callable[[dict], dict]]`; `host.handle(req: object) -> dict` (always returns a dict; errors become `{"type":"error","message":str}`; echoes `id` when `req` has one); `host.main(stdin, stdout) -> None` (binary streams); `host.run() -> None` (console-script entry point).
- Response shapes: `analyze` → `{"type":"analyze","candidates":[entry],"saved":[entry+folder],"truncated":bool}` where `entry = {url,title,visit_count,last_visit_time(ISO str),days_since_visit,score}`; `apply` → `{"type":"apply","added":[url],"removed":[url],"missing":[url]}`.

- [ ] **Step 1: Write the failing tests**

Create `tests/test_host.py`:

```python
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
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest tests/test_host.py -v`
Expected: FAIL with `ImportError` (no `host` module).

- [ ] **Step 3: Implement**

Create `link_sense/host.py`:

```python
import json
import sys
from dataclasses import asdict

from link_sense import analysis, history, native, scorer, store

DEFAULT_LIMIT = 2000
DEFAULT_MAX_RESULTS = 500
RESPONSE_BUDGET = 900 * 1024  # stay well under Chrome's 1 MB host-to-browser limit


def _serialize(entry: scorer.ScoredEntry) -> dict:
    d = asdict(entry)
    d["last_visit_time"] = entry.last_visit_time.isoformat()
    return d


def _fits(resp: dict) -> bool:
    return len(json.dumps(resp, ensure_ascii=False, separators=(",", ":")).encode("utf-8")) <= RESPONSE_BUDGET


def handle_analyze(req: dict) -> dict:
    limit = int(req.get("limit", DEFAULT_LIMIT))
    max_results = int(req.get("max_results", DEFAULT_MAX_RESULTS))
    entries = history.read_all(req.get("browser", "auto"), limit)
    if not entries:
        raise ValueError("No history found. Check that Chrome or Firefox is installed.")

    saved_meta = store.all_bookmarks()
    candidates, saved = analysis.split(scorer.score(entries), saved_meta)

    saved_out = []
    for e in saved:
        d = _serialize(e)
        d["folder"] = saved_meta.get(e.url, {}).get("folder", "")
        saved_out.append(d)

    cands = [_serialize(e) for e in candidates[:max_results]]
    truncated = len(candidates) > len(cands)
    while True:
        resp = {"type": "analyze", "candidates": cands, "saved": saved_out, "truncated": truncated}
        if _fits(resp) or not cands:
            return resp
        cands = cands[: int(len(cands) * 0.8)]
        truncated = True


def _validate_apply(req: dict) -> tuple[list[dict], list[str]]:
    adds, removes = req.get("adds", []), req.get("removes", [])
    if not isinstance(adds, list) or not isinstance(removes, list):
        raise ValueError("adds and removes must be lists")
    for item in adds:
        if not isinstance(item, dict) or not isinstance(item.get("url"), str) or not item["url"]:
            raise ValueError("every add needs a non-empty string url")
    if not all(isinstance(u, str) and u for u in removes):
        raise ValueError("every remove must be a non-empty string url")
    return adds, removes


def handle_apply(req: dict) -> dict:
    adds, removes = _validate_apply(req)  # validate everything before touching the store
    added, removed, missing = [], [], []
    for item in adds:
        store.add(
            item["url"],
            title=str(item.get("title", "")),
            score=float(item.get("score", 0.0)),
            folder=str(item.get("folder", "")),
        )
        added.append(item["url"])
    for url in removes:
        (removed if store.remove(url) else missing).append(url)
    return {"type": "apply", "added": added, "removed": removed, "missing": missing}


HANDLERS = {"analyze": handle_analyze, "apply": handle_apply}


def handle(req) -> dict:
    if not isinstance(req, dict):
        return {"type": "error", "message": "request must be a JSON object"}
    try:
        kind = req.get("type")
        handler = HANDLERS.get(kind)
        if handler is None:
            raise ValueError(f"unknown request type: {kind!r}")
        resp = handler(req)
    except Exception as exc:  # report every failure to the UI instead of dying
        resp = {"type": "error", "message": str(exc)}
    if "id" in req:
        resp["id"] = req["id"]
    return resp


def _send(stdout, resp: dict) -> None:
    try:
        native.write_message(stdout, resp)
    except native.FrameError as exc:
        err = {"type": "error", "message": str(exc)}
        if "id" in resp:
            err["id"] = resp["id"]
        native.write_message(stdout, err)


def main(stdin, stdout) -> None:
    while True:
        try:
            req = native.read_message(stdin)
        except native.FrameError as exc:
            _send(stdout, {"type": "error", "message": str(exc)})
            return  # the stream is out of sync; stop
        except ValueError as exc:
            _send(stdout, {"type": "error", "message": f"invalid message: {exc}"})
            continue
        if req is None:
            return
        _send(stdout, handle(req))


def run() -> None:
    stdin, stdout = sys.stdin.buffer, sys.stdout.buffer
    real_stdout = sys.stdout
    sys.stdout = sys.stderr  # stray prints must never reach the protocol stream
    try:
        main(stdin, stdout)
    finally:
        sys.stdout = real_stdout
```

In `pyproject.toml`, extend `[project.scripts]`:

```toml
[project.scripts]
link-sense = "link_sense.cli:app"
link-sense-host = "link_sense.host:run"
```

- [ ] **Step 4: Run to verify pass**

Run: `pytest tests/test_host.py -v`
Expected: PASS (all tests, including the four parametrized apply cases).

- [ ] **Step 5: Reinstall and smoke-test the entry point**

Run: `pip install -e . -q && which link-sense-host`
Expected: prints a path (the console script exists).

Run: `python - <<'EOF'
import json, struct, subprocess
req = json.dumps({"type": "apply", "id": 1, "adds": [], "removes": []}).encode()
p = subprocess.run(["link-sense-host"], input=struct.pack("<I", len(req)) + req, capture_output=True)
n = struct.unpack("<I", p.stdout[:4])[0]
print(json.loads(p.stdout[4:4 + n]))
EOF`
Expected: `{'type': 'apply', 'added': [], 'removed': [], 'missing': [], 'id': 1}`

- [ ] **Step 6: Amend the spec**

In `docs/superpowers/specs/2026-10-14-chrome-extension-design.md`, after the sentence that begins "`ScoredEntry` mirrors the dataclass in `scorer.py`", append: " Entries in `saved` carry one extra field, `folder` (from the store), which the UI shows and Retry sync uses."

- [ ] **Step 7: Commit**

```bash
git add link_sense/host.py tests/test_host.py pyproject.toml docs/superpowers/specs/2026-10-14-chrome-extension-design.md
git commit -m "feat: add native-messaging host with analyze and apply"
```

---

### Task 4: Extension manifest, pinned key and extension ID

**Files:**
- Create: `extension/manifest.json`, `extension/package.json`, `link_sense/extension_id.py`
- Test: `tests/test_extension_manifest.py`

**Interfaces:**
- Produces: `extension_id.EXTENSION_ID: str` (32 chars, letters a–p); `extension/manifest.json` with `key`, permissions and `background.service_worker = "service-worker.js"` (module).

- [ ] **Step 1: Write the failing test**

Create `tests/test_extension_manifest.py`:

```python
import base64
import hashlib
import json
from pathlib import Path

from link_sense.extension_id import EXTENSION_ID

MANIFEST = Path(__file__).parents[1] / "extension" / "manifest.json"


def derive_extension_id(key_b64: str) -> str:
    digest = hashlib.sha256(base64.b64decode(key_b64)).hexdigest()[:32]
    return digest.translate(str.maketrans("0123456789abcdef", "abcdefghijklmnop"))


def test_manifest_is_mv3_with_expected_permissions():
    manifest = json.loads(MANIFEST.read_text())
    assert manifest["manifest_version"] == 3
    assert sorted(manifest["permissions"]) == ["bookmarks", "nativeMessaging", "storage"]
    assert manifest["background"] == {"service_worker": "service-worker.js", "type": "module"}


def test_extension_id_matches_pinned_key():
    manifest = json.loads(MANIFEST.read_text())
    assert EXTENSION_ID == derive_extension_id(manifest["key"])
    assert len(EXTENSION_ID) == 32
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest tests/test_extension_manifest.py -v`
Expected: FAIL with `ModuleNotFoundError: link_sense.extension_id`.

- [ ] **Step 3: Generate the key pair (private key stays out of the repo)**

Run: `mkdir -p ~/.config/link-sense && openssl genrsa -out ~/.config/link-sense/extension-key.pem 2048`
Expected: creates the PEM file. Do not copy it into the repo.

Run: `openssl rsa -in ~/.config/link-sense/extension-key.pem -pubout -outform DER 2>/dev/null | base64 -w0`
Expected: one long base64 line. Call it `<PUBLIC_KEY_B64>`.

- [ ] **Step 4: Write the manifest and package.json**

Create `extension/manifest.json` (substitute `<PUBLIC_KEY_B64>` with the output of Step 3):

```json
{
  "manifest_version": 3,
  "name": "Link Sense",
  "version": "0.1.0",
  "description": "Review ranked browser history and bookmark the pages you actually use.",
  "key": "<PUBLIC_KEY_B64>",
  "permissions": ["nativeMessaging", "bookmarks", "storage"],
  "background": { "service_worker": "service-worker.js", "type": "module" },
  "action": { "default_title": "Link Sense" }
}
```

Create `extension/package.json`:

```json
{
  "name": "link-sense-extension",
  "private": true,
  "type": "module",
  "scripts": { "test": "node --test test/" }
}
```

- [ ] **Step 5: Compute the ID and write the constant**

Run: `python - <<'EOF'
import base64, hashlib, json
key = json.load(open("extension/manifest.json"))["key"]
d = hashlib.sha256(base64.b64decode(key)).hexdigest()[:32]
print(d.translate(str.maketrans("0123456789abcdef", "abcdefghijklmnop")))
EOF`
Expected: a 32-character string of letters a–p. Call it `<ID>`.

Create `link_sense/extension_id.py`:

```python
# Derived from the public key pinned in extension/manifest.json (see tests/test_extension_manifest.py).
EXTENSION_ID = "<ID>"
```

- [ ] **Step 6: Run to verify pass**

Run: `pytest tests/test_extension_manifest.py -v`
Expected: PASS (2 passed).

- [ ] **Step 7: Commit**

```bash
git add extension/manifest.json extension/package.json link_sense/extension_id.py tests/test_extension_manifest.py
git commit -m "feat: add extension manifest with pinned key"
```

---

### Task 5: Host installer and `install-host` command

**Files:**
- Create: `link_sense/installer.py`
- Modify: `link_sense/cli.py` (new command; add `import shutil`)
- Test: `tests/test_installer.py`

**Interfaces:**
- Consumes: `extension_id.EXTENSION_ID`.
- Produces: `installer.HOST_NAME = "com.linksense.host"`; `installer.manifest_dict(host_path: str) -> dict`; `installer.target_dirs(home: Path) -> list[Path]`; `installer.install(home: Path, host_path: str) -> list[Path]` (returns the manifest files written); CLI `link-sense install-host` (exit 1 with a message if `link-sense-host` is not on `PATH`).

- [ ] **Step 1: Write the failing tests**

Create `tests/test_installer.py`:

```python
import json
from pathlib import Path

from typer.testing import CliRunner

from link_sense import cli, installer
from link_sense.extension_id import EXTENSION_ID


def test_manifest_dict():
    m = installer.manifest_dict("/opt/bin/link-sense-host")
    assert m["name"] == "com.linksense.host"
    assert m["path"] == "/opt/bin/link-sense-host"
    assert m["type"] == "stdio"
    assert m["allowed_origins"] == [f"chrome-extension://{EXTENSION_ID}/"]


def test_install_writes_both_browser_dirs_creating_them(tmp_path):
    written = installer.install(tmp_path, "/opt/bin/link-sense-host")

    assert sorted(p.parent.parent.name for p in written) == ["chromium", "google-chrome"]
    for path in written:
        assert path.name == "com.linksense.host.json"
        assert json.loads(path.read_text())["path"] == "/opt/bin/link-sense-host"


def test_install_overwrites_stale_manifest(tmp_path):
    first = installer.install(tmp_path, "/old/path")
    installer.install(tmp_path, "/new/path")
    assert json.loads(first[0].read_text())["path"] == "/new/path"


def test_cli_install_host(tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setattr(cli.shutil, "which", lambda name: "/opt/bin/link-sense-host")

    result = CliRunner().invoke(cli.app, ["install-host"])

    assert result.exit_code == 0, result.output
    assert (tmp_path / ".config/google-chrome/NativeMessagingHosts/com.linksense.host.json").exists()


def test_cli_install_host_fails_without_host_on_path(tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setattr(cli.shutil, "which", lambda name: None)

    result = CliRunner().invoke(cli.app, ["install-host"])

    assert result.exit_code == 1
    assert "link-sense-host" in result.output
    assert not (tmp_path / ".config").exists()
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest tests/test_installer.py -v`
Expected: FAIL with `ImportError` (no `installer`).

- [ ] **Step 3: Implement**

Create `link_sense/installer.py`:

```python
import json
from pathlib import Path

from link_sense.extension_id import EXTENSION_ID

HOST_NAME = "com.linksense.host"


def manifest_dict(host_path: str) -> dict:
    return {
        "name": HOST_NAME,
        "description": "Link Sense native host",
        "path": host_path,
        "type": "stdio",
        "allowed_origins": [f"chrome-extension://{EXTENSION_ID}/"],
    }


def target_dirs(home: Path) -> list[Path]:
    return [
        home / ".config/google-chrome/NativeMessagingHosts",
        home / ".config/chromium/NativeMessagingHosts",
    ]


def install(home: Path, host_path: str) -> list[Path]:
    written = []
    for directory in target_dirs(home):
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / f"{HOST_NAME}.json"
        path.write_text(json.dumps(manifest_dict(host_path), indent=2))
        written.append(path)
    return written
```

In `link_sense/cli.py`, add `import shutil` with the other stdlib imports, change the import line to `from link_sense import analysis, history, installer, scorer, store`, and add at the end of the file:

```python
@app.command(name="install-host")
def install_host():
    """Register the native-messaging host so the Chrome extension can talk to Link Sense."""
    host_path = shutil.which("link-sense-host")
    if not host_path:
        console.print(
            "[red]link-sense-host not found on PATH.[/red] Run [bold]pip install -e .[/bold] "
            "and make sure your Python scripts directory is on PATH."
        )
        raise typer.Exit(1)
    for path in installer.install(Path.home(), host_path):
        console.print(f"[green]Wrote[/green] {path}")
    console.print("Reload the Link Sense extension page in Chrome.")
```

- [ ] **Step 4: Run to verify pass**

Run: `pytest tests/test_installer.py -v`
Expected: PASS (5 passed).

- [ ] **Step 5: Commit**

```bash
git add link_sense/installer.py link_sense/cli.py tests/test_installer.py
git commit -m "feat: add install-host command"
```

---

### Task 6: Bookmark sync planner (pure JS)

**Files:**
- Create: `extension/bookmark-tree.js`
- Test: `extension/test/bookmark-tree.test.mjs`

**Interfaces:**
- Produces: `ROOT_TITLE = "Link Sense"`; `planSync({ root, adds, removes }) -> Op[]` where `root` is the `Link Sense` node from `chrome.bookmarks.getSubTree` (`{id, title, children}`) or `null`; `adds` is `[{url, title, folder}]`; `removes` is `[url]`; `Op` is `{type:"remove", id, url}` or `{type:"create", folder, title, url}` (`folder` is a folder name, `""` for the root). Remove ops come first. Only direct children of `root` and children of its direct subfolders are considered.

- [ ] **Step 1: Write the failing tests**

Create `extension/test/bookmark-tree.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { planSync, ROOT_TITLE } from "../bookmark-tree.js";

const bm = (id, url, title = url) => ({ id, title, url });
const folder = (id, title, children = []) => ({ id, title, children });
const root = (children) => ({ id: "r", title: ROOT_TITLE, children });

test("ROOT_TITLE", () => assert.equal(ROOT_TITLE, "Link Sense"));

test("creates bookmarks when the root does not exist yet", () => {
  const ops = planSync({
    root: null,
    adds: [
      { url: "https://a.example/", title: "A", folder: "Work" },
      { url: "https://b.example/", title: "B", folder: "" },
    ],
    removes: [],
  });
  assert.deepEqual(ops, [
    { type: "create", folder: "Work", title: "A", url: "https://a.example/" },
    { type: "create", folder: "", title: "B", url: "https://b.example/" },
  ]);
});

test("falls back to the url when the title is empty", () => {
  const [op] = planSync({ root: null, adds: [{ url: "https://a.example/", title: "", folder: "" }], removes: [] });
  assert.equal(op.title, "https://a.example/");
});

test("skips a url that already exists in the same folder", () => {
  const tree = root([folder("f1", "Work", [bm("b1", "https://a.example/")])]);
  const ops = planSync({ root: tree, adds: [{ url: "https://a.example/", title: "A", folder: "Work" }], removes: [] });
  assert.deepEqual(ops, []);
});

test("creates the same url in a different folder", () => {
  const tree = root([folder("f1", "Work", [bm("b1", "https://a.example/")])]);
  const ops = planSync({ root: tree, adds: [{ url: "https://a.example/", title: "A", folder: "Home" }], removes: [] });
  assert.equal(ops.length, 1);
  assert.equal(ops[0].folder, "Home");
});

test("dedupes repeated adds of the same url and folder", () => {
  const add = { url: "https://a.example/", title: "A", folder: "" };
  assert.equal(planSync({ root: null, adds: [add, add], removes: [] }).length, 1);
});

test("removes every bookmark with the url, in any folder, inside the tree", () => {
  const tree = root([
    bm("b0", "https://a.example/"),
    folder("f1", "Work", [bm("b1", "https://a.example/"), bm("b2", "https://keep.example/")]),
  ]);
  const ops = planSync({ root: tree, adds: [], removes: ["https://a.example/"] });
  assert.deepEqual(ops, [
    { type: "remove", id: "b0", url: "https://a.example/" },
    { type: "remove", id: "b1", url: "https://a.example/" },
  ]);
});

test("removing a url that is not in the tree is a no-op", () => {
  assert.deepEqual(planSync({ root: root([]), adds: [], removes: ["https://x.example/"] }), []);
  assert.deepEqual(planSync({ root: null, adds: [], removes: ["https://x.example/"] }), []);
});

test("an add of a url that is also being removed from that folder is recreated", () => {
  const tree = root([bm("b0", "https://a.example/")]);
  const ops = planSync({
    root: tree,
    adds: [{ url: "https://a.example/", title: "A", folder: "" }],
    removes: ["https://a.example/"],
  });
  assert.deepEqual(ops.map((o) => o.type), ["remove", "create"]);
});

test("ignores nested folders deeper than one level", () => {
  const tree = root([folder("f1", "Work", [folder("f2", "Deep", [bm("b1", "https://a.example/")])])]);
  const ops = planSync({ root: tree, adds: [{ url: "https://a.example/", title: "A", folder: "Work" }], removes: [] });
  assert.equal(ops.length, 1);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd extension && npm test`
Expected: FAIL — cannot find module `../bookmark-tree.js`.

- [ ] **Step 3: Implement**

Create `extension/bookmark-tree.js`:

```js
export const ROOT_TITLE = "Link Sense";

// Map url -> [{ id, folder }] for the root's bookmarks ("" folder) and its direct subfolders.
function indexTree(root) {
  const index = new Map();
  const add = (node, folder) => {
    if (!node.url) return;
    if (!index.has(node.url)) index.set(node.url, []);
    index.get(node.url).push({ id: node.id, folder });
  };
  for (const child of root?.children ?? []) {
    if (child.url) add(child, "");
    else for (const grandchild of child.children ?? []) add(grandchild, child.title);
  }
  return index;
}

// root: the "Link Sense" node from chrome.bookmarks.getSubTree, or null.
// adds: [{ url, title, folder }]; removes: [url]. Returns remove ops first, then create ops.
export function planSync({ root, adds, removes }) {
  const index = indexTree(root);
  const ops = [];
  const removedIds = new Set();

  for (const url of removes) {
    for (const hit of index.get(url) ?? []) {
      removedIds.add(hit.id);
      ops.push({ type: "remove", id: hit.id, url });
    }
  }

  const seen = new Set();
  for (const add of adds) {
    const folder = add.folder ?? "";
    const key = `${folder}\n${add.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const exists = (index.get(add.url) ?? []).some((h) => h.folder === folder && !removedIds.has(h.id));
    if (!exists) ops.push({ type: "create", folder, title: add.title || add.url, url: add.url });
  }
  return ops;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd extension && npm test`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add extension/bookmark-tree.js extension/test/bookmark-tree.test.mjs
git commit -m "feat: add bookmark sync planner"
```

---

### Task 7: Service worker

**Files:**
- Create: `extension/service-worker.js`

**Interfaces:**
- Consumes: `planSync`, `ROOT_TITLE` from `./bookmark-tree.js`; host messages `analyze` / `apply` as in Task 3.
- Produces (runtime messages from the UI via `chrome.runtime.sendMessage`): `{type:"analyze", ...}` → the host's `analyze` response; `{type:"apply", adds, removes}` → host `apply` response plus `syncErrors: [{url|null, id|null, message}]`; `{type:"resync"}` → `{type:"resync", syncErrors}`; any failure → `{type:"error", message}`. Clicking the toolbar action opens `ui.html` in a new tab.

This file is thin glue over `chrome.*` APIs and is verified by the manual end-to-end run in Task 9; the logic worth unit-testing is already in `bookmark-tree.js`.

- [ ] **Step 1: Write the service worker**

Create `extension/service-worker.js`:

```js
import { planSync, ROOT_TITLE } from "./bookmark-tree.js";

const HOST = "com.linksense.host";

// ---- native port -----------------------------------------------------------

let port = null;
let nextId = 1;
const pending = new Map();

function getPort() {
  if (port) return port;
  const p = chrome.runtime.connectNative(HOST);
  p.onMessage.addListener((msg) => {
    const entry = pending.get(msg.id);
    if (!entry) return;
    pending.delete(msg.id);
    entry.resolve(msg);
  });
  p.onDisconnect.addListener(() => {
    const message = chrome.runtime.lastError?.message ?? "Native host disconnected";
    port = null;
    for (const entry of pending.values()) entry.reject(new Error(message));
    pending.clear();
  });
  port = p;
  return p;
}

function callHost(msg) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    try {
      getPort().postMessage({ ...msg, id });
    } catch (err) {
      pending.delete(id);
      reject(err);
    }
  });
}

// ---- Chrome bookmarks ------------------------------------------------------

async function otherBookmarksId() {
  const [tree] = await chrome.bookmarks.getTree();
  const other =
    tree.children.find((c) => c.folderType === "other") ?? tree.children.find((c) => c.id === "2");
  if (!other) throw new Error("Could not find the Other bookmarks folder");
  return other.id;
}

async function findRoot(parentId) {
  const kids = await chrome.bookmarks.getChildren(parentId);
  const hit = kids.find((k) => !k.url && k.title === ROOT_TITLE);
  if (!hit) return null;
  const [subtree] = await chrome.bookmarks.getSubTree(hit.id);
  return subtree;
}

async function runOps(parentId, root, ops) {
  const errors = [];
  let rootId = root?.id ?? null;
  const folderIds = new Map((root?.children ?? []).filter((c) => !c.url).map((c) => [c.title, c.id]));

  const ensureRoot = async () => {
    rootId ??= (await chrome.bookmarks.create({ parentId, title: ROOT_TITLE })).id;
    return rootId;
  };
  const ensureFolder = async (name) => {
    if (name === "") return ensureRoot();
    if (!folderIds.has(name)) {
      const created = await chrome.bookmarks.create({ parentId: await ensureRoot(), title: name });
      folderIds.set(name, created.id);
    }
    return folderIds.get(name);
  };

  for (const op of ops) {
    try {
      if (op.type === "remove") {
        await chrome.bookmarks.remove(op.id);
      } else {
        await chrome.bookmarks.create({ parentId: await ensureFolder(op.folder), title: op.title, url: op.url });
      }
    } catch (err) {
      errors.push({ url: op.url ?? null, id: op.id ?? null, message: String(err?.message ?? err) });
    }
  }
  return errors;
}

async function syncBookmarks(adds, removes) {
  const parentId = await otherBookmarksId();
  const root = await findRoot(parentId);
  return runOps(parentId, root, planSync({ root, adds, removes }));
}

// ---- request routing -------------------------------------------------------

async function handleRequest(req) {
  switch (req.type) {
    case "analyze":
      return callHost(req);

    case "apply": {
      const resp = await callHost(req);
      if (resp.type === "error") return resp;
      const added = new Set(resp.added);
      const adds = req.adds.filter((a) => added.has(a.url));
      const syncErrors = await syncBookmarks(adds, resp.removed);
      return { ...resp, syncErrors };
    }

    case "resync": {
      const resp = await callHost({ type: "analyze", limit: 1, max_results: 0 });
      if (resp.type === "error") return resp;
      const adds = resp.saved.map((s) => ({ url: s.url, title: s.title, folder: s.folder }));
      return { type: "resync", syncErrors: await syncBookmarks(adds, []) };
    }

    default:
      return { type: "error", message: `unknown request type: ${req.type}` };
  }
}

chrome.runtime.onMessage.addListener((req, _sender, sendResponse) => {
  handleRequest(req).then(sendResponse, (err) =>
    sendResponse({ type: "error", message: String(err?.message ?? err) }),
  );
  return true; // keep the channel open for the async reply
});

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("ui.html") });
});
```

- [ ] **Step 2: Syntax-check**

Run: `node --check extension/service-worker.js`
Expected: no output (exit 0).

- [ ] **Step 3: Commit**

```bash
git add extension/service-worker.js
git commit -m "feat: add extension service worker"
```

---

### Task 8: UI model and page

**Files:**
- Create: `extension/ui-model.js`, `extension/ui.html`, `extension/ui.css`, `extension/ui.js`
- Test: `extension/test/ui-model.test.mjs`, `extension/test/ui-safety.test.mjs`

**Interfaces:**
- Consumes: runtime messages from Task 7; entries shaped as in Task 3 (`url, title, visit_count, last_visit_time, days_since_visit, score`, plus `folder` on saved entries).
- Produces: `ui-model.js` exports `entryFolder(entry, choices) -> string`, `filterEntries(entries, query) -> entry[]`, `groupByFolder(entries, choices) -> [{folder, items}]` (folders alphabetical, unfiled `""` last, items by score descending), `buildApplyPayload(candidates, saved, choices) -> {adds, removes}`. `choices` is `{ [url]: { action: "add" | "remove" | null, folder: string } }`.

- [ ] **Step 1: Write the failing tests**

Create `extension/test/ui-model.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { buildApplyPayload, entryFolder, filterEntries, groupByFolder } from "../ui-model.js";

const e = (url, score, extra = {}) => ({ url, title: url, score, ...extra });

test("entryFolder prefers the user's choice, then the stored folder, then unfiled", () => {
  assert.equal(entryFolder(e("a", 1, { folder: "Old" }), { a: { folder: "New" } }), "New");
  assert.equal(entryFolder(e("a", 1, { folder: "Old" }), {}), "Old");
  assert.equal(entryFolder(e("a", 1), {}), "");
});

test("filterEntries matches title or url case-insensitively", () => {
  const items = [e("https://Foo.example/", 1, { title: "Hello" }), e("https://bar.example/", 1, { title: "World" })];
  assert.equal(filterEntries(items, "foo").length, 1);
  assert.equal(filterEntries(items, "WORLD").length, 1);
  assert.equal(filterEntries(items, "  ").length, 2);
  assert.equal(filterEntries(items, "zzz").length, 0);
});

test("groupByFolder sorts folders alphabetically with unfiled last and items by score", () => {
  const items = [e("a", 1), e("b", 9, { folder: "Zed" }), e("c", 5, { folder: "Alpha" }), e("d", 7, { folder: "Zed" })];
  const groups = groupByFolder(items, {});
  assert.deepEqual(groups.map((g) => g.folder), ["Alpha", "Zed", ""]);
  assert.deepEqual(groups[1].items.map((i) => i.url), ["b", "d"]);
});

test("buildApplyPayload only includes explicit choices", () => {
  const candidates = [e("a", 3, { title: "A" }), e("b", 2), e("c", 1)];
  const saved = [e("s1", 0), e("s2", 0)];
  const choices = {
    a: { action: "add", folder: "Work" },
    b: { action: null, folder: "Work" },
    s1: { action: "remove", folder: "" },
    c: { action: "remove", folder: "" }, // a candidate cannot be removed: it is not in the store
  };
  assert.deepEqual(buildApplyPayload(candidates, saved, choices), {
    adds: [{ url: "a", title: "A", score: 3, folder: "Work" }],
    removes: ["s1"],
  });
});

test("buildApplyPayload with no choices is empty", () => {
  assert.deepEqual(buildApplyPayload([e("a", 1)], [e("s", 0)], {}), { adds: [], removes: [] });
});
```

Create `extension/test/ui-safety.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Page titles and URLs come from untrusted pages: the UI must render them as text.
test("ui.js never builds markup from strings", () => {
  const src = readFileSync(new URL("../ui.js", import.meta.url), "utf8");
  for (const banned of ["innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "eval("]) {
    assert.equal(src.includes(banned), false, `ui.js must not use ${banned}`);
  }
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd extension && npm test`
Expected: FAIL — `ui-model.js` and `ui.js` are missing.

- [ ] **Step 3: Implement the model**

Create `extension/ui-model.js`:

```js
export function entryFolder(entry, choices) {
  return choices[entry.url]?.folder ?? entry.folder ?? "";
}

export function filterEntries(entries, query) {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter((e) => e.title.toLowerCase().includes(q) || e.url.toLowerCase().includes(q));
}

export function groupByFolder(entries, choices) {
  const groups = new Map();
  for (const entry of entries) {
    const folder = entryFolder(entry, choices);
    if (!groups.has(folder)) groups.set(folder, []);
    groups.get(folder).push(entry);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)))
    .map(([folder, items]) => ({ folder, items: items.sort((x, y) => y.score - x.score) }));
}

export function buildApplyPayload(candidates, saved, choices) {
  const adds = candidates
    .filter((c) => choices[c.url]?.action === "add")
    .map((c) => ({ url: c.url, title: c.title, score: c.score, folder: choices[c.url].folder ?? "" }));
  const removes = saved.filter((s) => choices[s.url]?.action === "remove").map((s) => s.url);
  return { adds, removes };
}
```

- [ ] **Step 4: Write the page**

Create `extension/ui.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Link Sense</title>
  <link rel="stylesheet" href="ui.css">
</head>
<body>
  <header>
    <h1>Link Sense</h1>
    <input id="search" type="search" placeholder="Search title or URL" aria-label="Search">
    <button id="reload" type="button">Reload</button>
    <button id="apply" type="button" class="primary" disabled>Apply</button>
  </header>
  <div id="banner" role="status" hidden></div>
  <main>
    <nav id="list" aria-label="Pages"></nav>
    <section id="detail"><p class="muted">Select a page to see details.</p></section>
  </main>
  <script type="module" src="ui.js"></script>
</body>
</html>
```

Create `extension/ui.css`:

```css
:root {
  --bg: #fff; --fg: #1d1d1f; --muted: #6b6b70; --line: #e2e2e6; --accent: #1a5fd0; --add: #1e7a3c; --remove: #b3261e;
}
@media (prefers-color-scheme: dark) {
  :root { --bg: #17171a; --fg: #ececf0; --muted: #9a9aa3; --line: #2c2c33; --accent: #6ea0ff; --add: #5fcf80; --remove: #ff8a80; }
}
* { box-sizing: border-box; }
body { margin: 0; font: 14px/1.4 system-ui, sans-serif; background: var(--bg); color: var(--fg); height: 100vh; display: flex; flex-direction: column; }
header { display: flex; gap: 8px; align-items: center; padding: 8px 16px; border-bottom: 1px solid var(--line); }
header h1 { font-size: 16px; margin: 0 8px 0 0; }
header input { flex: 1; padding: 6px 8px; }
button { padding: 6px 12px; cursor: pointer; }
button.primary { background: var(--accent); color: #fff; border: 0; border-radius: 4px; }
button:disabled { opacity: .5; cursor: default; }
#banner { padding: 8px 16px; border-bottom: 1px solid var(--line); }
#banner.error { color: var(--remove); }
main { flex: 1; display: grid; grid-template-columns: minmax(280px, 380px) 1fr; min-height: 0; }
#list { overflow-y: auto; border-right: 1px solid var(--line); }
#list h2 { font-size: 12px; text-transform: uppercase; color: var(--muted); margin: 0; padding: 8px 16px 4px; }
.item { display: block; width: 100%; text-align: left; border: 0; border-bottom: 1px solid var(--line); background: none; color: inherit; padding: 8px 16px; }
.item[aria-current="true"] { background: color-mix(in srgb, var(--accent) 12%, transparent); }
.item .title, .item .url { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.item .url { color: var(--muted); font-size: 12px; }
.item.add { border-left: 3px solid var(--add); }
.item.remove { border-left: 3px solid var(--remove); }
#detail { padding: 16px; overflow-y: auto; }
#detail dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 12px; }
#detail dt { color: var(--muted); }
#detail .row { display: flex; gap: 8px; margin-top: 12px; align-items: center; }
.muted { color: var(--muted); }
@media (max-width: 700px) { main { grid-template-columns: 1fr; } #list { max-height: 40vh; border-right: 0; } }
```

Create `extension/ui.js`:

```js
import { buildApplyPayload, entryFolder, filterEntries, groupByFolder } from "./ui-model.js";

const $ = (id) => document.getElementById(id);
const state = { candidates: [], saved: [], choices: {}, selected: null, query: "", truncated: false, syncErrors: [] };

// ---- messaging -------------------------------------------------------------

async function send(msg) {
  const resp = await chrome.runtime.sendMessage(msg);
  if (!resp) throw new Error("No response from the extension service worker");
  if (resp.type === "error") throw new Error(resp.message);
  return resp;
}

function showBanner(text, isError = false, retry = null) {
  const banner = $("banner");
  banner.replaceChildren(document.createTextNode(text));
  if (retry) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Retry sync";
    button.addEventListener("click", retry);
    banner.append(" ", button);
  }
  banner.className = isError ? "error" : "";
  banner.hidden = !text;
}

function describeError(err) {
  const message = String(err?.message ?? err);
  if (/native messaging host/i.test(message)) {
    return "Native host not found. Run `link-sense install-host`, then reload this page.";
  }
  return message;
}

// ---- persistence of pending choices ----------------------------------------

async function loadChoices() {
  const stored = await chrome.storage.local.get("choices");
  state.choices = stored.choices ?? {};
}

function saveChoices() {
  chrome.storage.local.set({ choices: state.choices });
}

function setChoice(url, patch) {
  state.choices[url] = { action: null, folder: "", ...state.choices[url], ...patch };
  saveChoices();
  render();
}

// ---- rendering (text only: titles and URLs are untrusted) ------------------

function allEntries() {
  return [...state.candidates, ...state.saved];
}

function isSaved(entry) {
  return state.saved.some((s) => s.url === entry.url);
}

function renderList() {
  const list = $("list");
  list.replaceChildren();
  const entries = filterEntries(allEntries(), state.query);
  for (const group of groupByFolder(entries, state.choices)) {
    const heading = document.createElement("h2");
    heading.textContent = group.folder || "Unfiled";
    list.append(heading);
    for (const entry of group.items) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = `item ${state.choices[entry.url]?.action ?? ""}`;
      if (entry.url === state.selected) item.setAttribute("aria-current", "true");
      const title = document.createElement("span");
      title.className = "title";
      title.textContent = entry.title || entry.url;
      const url = document.createElement("span");
      url.className = "url";
      url.textContent = entry.url;
      item.append(title, url);
      item.addEventListener("click", () => {
        state.selected = entry.url;
        render();
      });
      list.append(item);
    }
  }
}

function detailRow(dl, label, value) {
  const dt = document.createElement("dt");
  dt.textContent = label;
  const dd = document.createElement("dd");
  dd.textContent = value;
  dl.append(dt, dd);
}

function knownFolders() {
  const names = new Set(allEntries().map((e) => entryFolder(e, state.choices)));
  names.delete("");
  return [...names].sort((a, b) => a.localeCompare(b));
}

function renderDetail() {
  const panel = $("detail");
  const entry = allEntries().find((e) => e.url === state.selected);
  if (!entry) {
    panel.replaceChildren(Object.assign(document.createElement("p"), { className: "muted", textContent: "Select a page to see details." }));
    return;
  }
  const saved = isSaved(entry);
  const choice = state.choices[entry.url] ?? { action: null, folder: "" };

  const heading = document.createElement("h2");
  heading.textContent = entry.title || entry.url;
  const dl = document.createElement("dl");
  detailRow(dl, "URL", entry.url);
  detailRow(dl, "Score", String(entry.score));
  detailRow(dl, "Visits", String(entry.visit_count));
  detailRow(dl, "Last visit", entry.visit_count ? new Date(entry.last_visit_time).toLocaleString() : "—");
  detailRow(dl, "Status", saved ? "Bookmarked" : "Not bookmarked");

  const nodes = [heading, dl];

  if (saved) {
    detailRow(dl, "Folder", entry.folder || "Unfiled");
    const row = document.createElement("div");
    row.className = "row";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.textContent = choice.action === "remove" ? "Keep" : "Remove";
    toggle.addEventListener("click", () => setChoice(entry.url, { action: choice.action === "remove" ? null : "remove" }));
    row.append(toggle);
    nodes.push(row);
  } else {
    const folderRow = document.createElement("div");
    folderRow.className = "row";
    const select = document.createElement("select");
    select.setAttribute("aria-label", "Folder");
    for (const name of ["", ...knownFolders()]) {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name || "Unfiled";
      option.selected = name === choice.folder;
      select.append(option);
    }
    select.addEventListener("change", () => setChoice(entry.url, { folder: select.value }));
    const newFolder = document.createElement("input");
    newFolder.placeholder = "New folder";
    newFolder.maxLength = 80;
    const create = document.createElement("button");
    create.type = "button";
    create.textContent = "Create";
    create.addEventListener("click", () => {
      const name = newFolder.value.trim();
      if (name) setChoice(entry.url, { folder: name });
    });
    folderRow.append(select, newFolder, create);

    const actionRow = document.createElement("div");
    actionRow.className = "row";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.textContent = choice.action === "add" ? "Clear" : "Add";
    toggle.addEventListener("click", () => setChoice(entry.url, { action: choice.action === "add" ? null : "add" }));
    actionRow.append(toggle);
    nodes.push(folderRow, actionRow);
  }
  panel.replaceChildren(...nodes);
}

function render() {
  renderList();
  renderDetail();
  const { adds, removes } = buildApplyPayload(state.candidates, state.saved, state.choices);
  $("apply").disabled = adds.length + removes.length === 0;
  $("apply").textContent = adds.length + removes.length ? `Apply (${adds.length + removes.length})` : "Apply";
}

// ---- actions ---------------------------------------------------------------

async function load() {
  showBanner("Reading history…");
  try {
    const resp = await send({ type: "analyze" });
    state.candidates = resp.candidates;
    state.saved = resp.saved;
    state.truncated = resp.truncated;
    showBanner(resp.truncated ? `Showing the top ${resp.candidates.length} candidates by score.` : "");
  } catch (err) {
    state.candidates = [];
    state.saved = [];
    showBanner(describeError(err), true);
  }
  render();
}

async function retrySync() {
  try {
    const resp = await send({ type: "resync" });
    showBanner(resp.syncErrors.length ? `${resp.syncErrors.length} bookmarks could not be synced.` : "Synced.", resp.syncErrors.length > 0, resp.syncErrors.length ? retrySync : null);
  } catch (err) {
    showBanner(describeError(err), true, retrySync);
  }
}

async function apply() {
  const payload = buildApplyPayload(state.candidates, state.saved, state.choices);
  $("apply").disabled = true;
  try {
    const resp = await send({ type: "apply", ...payload });
    for (const url of [...resp.added, ...resp.removed, ...resp.missing]) delete state.choices[url];
    saveChoices();
    await load();
    if (resp.syncErrors.length) {
      showBanner(`Saved, but ${resp.syncErrors.length} Chrome bookmarks failed to sync.`, true, retrySync);
    } else {
      showBanner(`Applied: ${resp.added.length} added, ${resp.removed.length} removed.`);
    }
  } catch (err) {
    showBanner(describeError(err), true);
    render();
  }
}

$("search").addEventListener("input", (event) => {
  state.query = event.target.value;
  renderList();
});
$("reload").addEventListener("click", load);
$("apply").addEventListener("click", apply);

await loadChoices();
await load();
```

- [ ] **Step 5: Run to verify pass**

Run: `cd extension && npm test`
Expected: PASS (bookmark-tree, ui-model and ui-safety tests).

Run: `node --check extension/ui.js`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add extension/ui-model.js extension/ui.html extension/ui.css extension/ui.js extension/test/
git commit -m "feat: add extension UI"
```

---

### Task 9: Docs and end-to-end verification

**Files:**
- Modify: `README.md` (new "Chrome extension" section)

- [ ] **Step 1: Add the README section**

Insert before "## Data storage" in `README.md`:

```markdown
## Chrome extension (Linux, Chrome/Chromium)

Review and apply bookmarks without leaving the browser.

1. `pip install -e .` (installs `link-sense` and `link-sense-host`)
2. `link-sense install-host` registers the native-messaging host for Chrome and Chromium
3. In Chrome, open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the `extension/` folder
4. Click the Link Sense toolbar icon, pick pages to add (with folders) or bookmarks to remove, and click **Apply**

Apply updates `~/.local/share/link-sense/bookmarks.json` and creates the bookmarks in Chrome under **Other bookmarks → Link Sense**. If Chrome and the store ever disagree, **Retry sync** re-creates missing Chrome bookmarks from the store.

Run the tests with `pytest` and `cd extension && npm test`.
```

- [ ] **Step 2: Run both suites**

Run: `pytest -v && (cd extension && npm test)`
Expected: all Python and Node tests pass.

- [ ] **Step 3: Manual end-to-end check**

1. Run `link-sense install-host`; expect two "Wrote …" lines.
2. Load `extension/` unpacked at `chrome://extensions`. Confirm the extension ID shown equals `link_sense/extension_id.py`'s `EXTENSION_ID`.
3. Click the toolbar icon. Expect the ranked list; the sidebar groups by folder and search filters live.
4. Select two candidates, assign one to a new folder "Test", click **Add** on both, click **Apply**. Expect the banner "Applied: 2 added, 0 removed."; `link-sense list` shows both; the Chrome bookmarks manager shows **Other bookmarks → Link Sense** with a "Test" subfolder.
5. Mark one saved bookmark **Remove**, **Apply**. Expect it gone from `link-sense list` and from the Chrome tree.
6. Delete one Link Sense bookmark by hand in Chrome, reload the UI, and trigger **Retry sync** (use DevTools on the service worker: `chrome.runtime.sendMessage({type:"resync"})`, or force a sync failure by renaming the folder). Expect the missing bookmark to come back.
7. Rename `~/.config/google-chrome/NativeMessagingHosts/com.linksense.host.json`, reload the UI. Expect "Native host not found. Run `link-sense install-host`…". Rename it back.
8. HTML check: add a history entry whose title contains `<img src=x onerror=alert(1)>` (for example visit a local page with that `<title>`, or temporarily edit a candidate title through DevTools state), reload, and confirm the text appears literally and no alert fires.
9. Clean up the test bookmarks with the UI or `link-sense remove`.

Expected: every item behaves as described. If any step fails, stop and report the failing step and the output.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document the Chrome extension"
```
