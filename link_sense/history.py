from link_sense.readers import HistoryEntry, chrome, firefox


def read_by_browser(browser: str, limit: int) -> dict[str, list[HistoryEntry]]:
    """Read history from the selected browsers. Never prints."""
    found: dict[str, list[HistoryEntry]] = {}
    if browser in ("chrome", "auto"):
        found["chrome"] = chrome.read(limit)
    if browser in ("firefox", "auto"):
        found["firefox"] = firefox.read(limit)
    return found


def read_all(browser: str, limit: int) -> list[HistoryEntry]:
    return [e for entries in read_by_browser(browser, limit).values() for e in entries]
