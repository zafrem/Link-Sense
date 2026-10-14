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
