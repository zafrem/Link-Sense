import math
from dataclasses import dataclass
from datetime import datetime, timezone
from urllib.parse import urlparse

from link_sense.readers import HistoryEntry

DECAY_LAMBDA = 0.1  # score halves roughly every 7 days

_SKIP_SCHEMES = {
    "chrome://", "chrome-extension://", "about:", "file://",
    "moz-extension://", "edge://", "data:",
}
_SKIP_HOSTS = {"localhost", "127.0.0.1", "0.0.0.0", "::1"}


@dataclass
class ScoredEntry:
    url: str
    title: str
    visit_count: int
    last_visit_time: datetime
    days_since_visit: float
    score: float


def _is_noise(url: str) -> bool:
    lower = url.lower()
    if any(lower.startswith(s) for s in _SKIP_SCHEMES):
        return True
    try:
        host = urlparse(url).hostname or ""
        return host in _SKIP_HOSTS or host.startswith("192.168.") or host.startswith("10.")
    except Exception:
        return True


def _merge(entries: list[HistoryEntry]) -> list[HistoryEntry]:
    """Deduplicate by URL, keeping max visit_count and most recent timestamp."""
    seen: dict[str, HistoryEntry] = {}
    for e in entries:
        if e.url in seen:
            existing = seen[e.url]
            seen[e.url] = HistoryEntry(
                url=e.url,
                title=e.title or existing.title,
                visit_count=max(e.visit_count, existing.visit_count),
                last_visit_time=max(e.last_visit_time, existing.last_visit_time),
            )
        else:
            seen[e.url] = e
    return list(seen.values())


def score(entries: list[HistoryEntry]) -> list[ScoredEntry]:
    now = datetime.now(timezone.utc)
    clean = _merge([e for e in entries if not _is_noise(e.url)])
    result = []
    for e in clean:
        days = (now - e.last_visit_time).total_seconds() / 86400
        s = e.visit_count * math.exp(-DECAY_LAMBDA * days)
        result.append(
            ScoredEntry(
                url=e.url,
                title=e.title,
                visit_count=e.visit_count,
                last_visit_time=e.last_visit_time,
                days_since_visit=round(days, 1),
                score=round(s, 3),
            )
        )
    result.sort(key=lambda x: x.score, reverse=True)
    return result
