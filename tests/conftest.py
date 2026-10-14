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
