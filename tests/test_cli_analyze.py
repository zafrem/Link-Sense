from typer.testing import CliRunner

from link_sense import cli
from link_sense.readers import chrome, firefox


def test_analyze_writes_report(tmp_path, temp_store, make_entry, monkeypatch):
    monkeypatch.setattr(chrome, "read", lambda limit: [make_entry("https://a.example/page", visits=3)])
    monkeypatch.setattr(firefox, "read", lambda limit: [])
    out = tmp_path / "report.html"

    result = CliRunner().invoke(cli.app, ["analyze", "--no-open", "--output", str(out)])

    assert result.exit_code == 0, result.output
    assert "a.example" in out.read_text()
    assert "Chrome:" in result.output


def test_analyze_exits_when_no_history(tmp_path, temp_store, monkeypatch):
    monkeypatch.setattr(chrome, "read", lambda limit: [])
    monkeypatch.setattr(firefox, "read", lambda limit: [])

    result = CliRunner().invoke(cli.app, ["analyze", "--no-open", "--output", str(tmp_path / "r.html")])

    assert result.exit_code == 1
