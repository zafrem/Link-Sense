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
