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
