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
