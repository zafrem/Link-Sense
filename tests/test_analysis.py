from link_sense import analysis, scorer


def test_split_separates_candidates_from_saved(make_entry):
    scored = scorer.score([make_entry("https://a.example/", visits=5), make_entry("https://b.example/", visits=2)])
    saved = {"https://a.example/": {"title": "A", "folder": "Work"}}

    candidates, saved_scored = analysis.split(scored, saved)

    assert [e.url for e in candidates] == ["https://b.example/"]
    assert [e.url for e in saved_scored] == ["https://a.example/"]


def test_split_includes_saved_without_history_at_zero_score(make_entry):
    scored = scorer.score([make_entry("https://b.example/")])
    saved = {"https://gone.example/": {"title": "Gone", "folder": ""}}

    candidates, saved_scored = analysis.split(scored, saved)

    assert [e.url for e in candidates] == ["https://b.example/"]
    assert saved_scored[0].url == "https://gone.example/"
    assert saved_scored[0].title == "Gone"
    assert saved_scored[0].score == 0.0
    assert saved_scored[0].visit_count == 0


def test_split_with_empty_inputs():
    assert analysis.split([], {}) == ([], [])
