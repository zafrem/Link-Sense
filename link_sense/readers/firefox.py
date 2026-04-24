import shutil
import sqlite3
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from link_sense.readers import HistoryEntry


def find_db() -> Path | None:
    candidates = [
        Path.home() / ".mozilla/firefox",
        Path.home() / "Library/Application Support/Firefox/Profiles",
        Path.home() / "snap/firefox/common/.mozilla/firefox",
    ]
    for base in candidates:
        if not base.exists():
            continue
        for profile in base.iterdir():
            db = profile / "places.sqlite"
            if db.exists():
                return db
    return None


def read(limit: int = 2000) -> list[HistoryEntry]:
    db_path = find_db()
    if db_path is None:
        return []

    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        shutil.copy2(db_path, tmp.name)
        tmp_path = Path(tmp.name)

    try:
        con = sqlite3.connect(f"file:{tmp_path}?mode=ro", uri=True)
        rows = con.execute(
            """
            SELECT url, title, visit_count, last_visit_date
            FROM moz_places
            WHERE visit_count > 0
            ORDER BY last_visit_date DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
        con.close()
    finally:
        tmp_path.unlink(missing_ok=True)

    entries = []
    for url, title, visit_count, last_visit_date in rows:
        if last_visit_date:
            # Firefox stores microseconds since Unix epoch
            ts = datetime.fromtimestamp(last_visit_date / 1_000_000, tz=timezone.utc)
        else:
            ts = datetime.now(timezone.utc)
        entries.append(
            HistoryEntry(
                url=url,
                title=title or url,
                visit_count=visit_count,
                last_visit_time=ts,
            )
        )
    return entries
