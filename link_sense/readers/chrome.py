import shutil
import sqlite3
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

from link_sense.readers import HistoryEntry

# Chrome timestamps are microseconds since 1601-01-01
_CHROME_EPOCH = datetime(1601, 1, 1, tzinfo=timezone.utc)


def _chrome_ts(microseconds: int) -> datetime:
    return _CHROME_EPOCH + timedelta(microseconds=microseconds)


def find_db() -> Path | None:
    candidates = [
        Path.home() / ".config/google-chrome/Default/History",
        Path.home() / ".config/chromium/Default/History",
        Path.home() / "Library/Application Support/Google/Chrome/Default/History",
    ]
    return next((p for p in candidates if p.exists()), None)


def read(limit: int = 2000) -> list[HistoryEntry]:
    db_path = find_db()
    if db_path is None:
        return []

    # Chrome locks the DB while running — copy first
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        shutil.copy2(db_path, tmp.name)
        tmp_path = Path(tmp.name)

    try:
        con = sqlite3.connect(f"file:{tmp_path}?mode=ro", uri=True)
        rows = con.execute(
            """
            SELECT url, title, visit_count, last_visit_time
            FROM urls
            WHERE visit_count > 0
            ORDER BY last_visit_time DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
        con.close()
    finally:
        tmp_path.unlink(missing_ok=True)

    entries = []
    for url, title, visit_count, last_visit_time in rows:
        entries.append(
            HistoryEntry(
                url=url,
                title=title or url,
                visit_count=visit_count,
                last_visit_time=_chrome_ts(last_visit_time),
            )
        )
    return entries
