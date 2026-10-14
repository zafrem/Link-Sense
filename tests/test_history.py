from link_sense import history
from link_sense.readers import chrome, firefox


def test_read_by_browser_auto_reads_both(make_entry, monkeypatch):
    monkeypatch.setattr(chrome, "read", lambda limit: [make_entry("https://c.example/")])
    monkeypatch.setattr(firefox, "read", lambda limit: [make_entry("https://f.example/")])

    found = history.read_by_browser("auto", 10)

    assert set(found) == {"chrome", "firefox"}
    assert found["chrome"][0].url == "https://c.example/"


def test_read_by_browser_single_browser(make_entry, monkeypatch):
    monkeypatch.setattr(chrome, "read", lambda limit: [make_entry("https://c.example/")])
    def must_not_run(limit):
        raise AssertionError("firefox reader must not be called")

    monkeypatch.setattr(firefox, "read", must_not_run)

    assert set(history.read_by_browser("chrome", 10)) == {"chrome"}


def test_read_all_flattens(make_entry, monkeypatch):
    monkeypatch.setattr(chrome, "read", lambda limit: [make_entry("https://c.example/")])
    monkeypatch.setattr(firefox, "read", lambda limit: [make_entry("https://f.example/")])

    urls = [e.url for e in history.read_all("auto", 10)]

    assert urls == ["https://c.example/", "https://f.example/"]
