import json
from pathlib import Path

from typer.testing import CliRunner

from link_sense import cli, installer
from link_sense.extension_id import EXTENSION_ID


def test_manifest_dict():
    m = installer.manifest_dict("/opt/bin/link-sense-host")
    assert m["name"] == "com.linksense.host"
    assert m["path"] == "/opt/bin/link-sense-host"
    assert m["type"] == "stdio"
    assert m["allowed_origins"] == [f"chrome-extension://{EXTENSION_ID}/"]


def test_install_writes_both_browser_dirs_creating_them(tmp_path):
    written = installer.install(tmp_path, "/opt/bin/link-sense-host")

    assert sorted(p.parent.parent.name for p in written) == ["chromium", "google-chrome"]
    for path in written:
        assert path.name == "com.linksense.host.json"
        assert json.loads(path.read_text())["path"] == "/opt/bin/link-sense-host"


def test_install_overwrites_stale_manifest(tmp_path):
    first = installer.install(tmp_path, "/old/path")
    installer.install(tmp_path, "/new/path")
    assert json.loads(first[0].read_text())["path"] == "/new/path"


def test_cli_install_host(tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setattr(cli.shutil, "which", lambda name: "/opt/bin/link-sense-host")

    result = CliRunner().invoke(cli.app, ["install-host"])

    assert result.exit_code == 0, result.output
    assert (tmp_path / ".config/google-chrome/NativeMessagingHosts/com.linksense.host.json").exists()


def test_cli_install_host_fails_without_host_on_path(tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setattr(cli.shutil, "which", lambda name: None)

    result = CliRunner().invoke(cli.app, ["install-host"])

    assert result.exit_code == 1
    assert "link-sense-host" in result.output
    assert not (tmp_path / ".config").exists()
