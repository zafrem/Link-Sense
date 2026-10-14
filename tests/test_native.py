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
