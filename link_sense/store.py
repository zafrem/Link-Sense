import json
from datetime import datetime
from pathlib import Path

_DATA_DIR = Path.home() / ".local/share/link-sense"
_STORE = _DATA_DIR / "bookmarks.json"


def _load() -> dict[str, dict]:
    if not _STORE.exists():
        return {}
    return json.loads(_STORE.read_text())


def _save(data: dict[str, dict]) -> None:
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    _STORE.write_text(json.dumps(data, indent=2, default=str))


def add(url: str, title: str = "", score: float = 0.0, folder: str = "") -> None:
    data = _load()
    data[url] = {
        "title": title,
        "score": score,
        "folder": folder,
        "added_at": datetime.now().isoformat(),
    }
    _save(data)


def remove(url: str) -> bool:
    data = _load()
    if url not in data:
        return False
    del data[url]
    _save(data)
    return True


def all_bookmarks() -> dict[str, dict]:
    return _load()


def contains(url: str) -> bool:
    return url in _load()
