import webbrowser
from pathlib import Path
from typing import Annotated

import typer
from rich.console import Console
from rich.table import Table

from link_sense import analysis, history, scorer, store
from link_sense.readers import HistoryEntry
from link_sense.reporter import generate

app = typer.Typer(help="Link Sense — browser history bookmark manager.")
console = Console()


def _read_history(browser: str, limit: int) -> list[HistoryEntry]:
    entries: list[HistoryEntry] = []
    for name, found in history.read_by_browser(browser, limit).items():
        if found:
            console.print(f"[green]{name.capitalize()}:[/green] {len(found)} entries")
            entries.extend(found)
        elif browser == name:
            console.print(f"[yellow]{name.capitalize()} history not found.[/yellow]")
    return entries


@app.command()
def analyze(
    browser: Annotated[str, typer.Option(help="chrome | firefox | auto")] = "auto",
    limit: Annotated[int, typer.Option(help="Max entries to read per browser")] = 2000,
    output: Annotated[Path, typer.Option(help="Output HTML path")] = Path("report.html"),
    no_open: Annotated[bool, typer.Option("--no-open", help="Do not open browser")] = False,
):
    """Read browser history, score it, and generate an HTML report."""
    console.print("[bold]Reading history…[/bold]")
    entries = _read_history(browser, limit)
    if not entries:
        console.print("[red]No history found. Check that Chrome or Firefox is installed.[/red]")
        raise typer.Exit(1)

    console.print("[bold]Scoring…[/bold]")
    scored = scorer.score(entries)
    console.print(f"[green]{len(scored)} URLs after deduplication and filtering.[/green]")

    saved = store.all_bookmarks()
    candidates, bookmarks_scored = analysis.split(scored, saved)

    console.print(f"Candidates to add: [cyan]{len(candidates)}[/cyan]  |  Saved bookmarks: [cyan]{len(bookmarks_scored)}[/cyan]")
    console.print(f"[bold]Writing report → [cyan]{output}[/cyan][/bold]")
    generate(candidates, bookmarks_scored, saved, output)

    if not no_open:
        webbrowser.open(output.resolve().as_uri())
        console.print("Opened in browser. Check/uncheck items and click [bold]Generate apply.sh[/bold].")


@app.command()
def add(
    url: Annotated[str, typer.Argument(help="URL to bookmark")],
    title: Annotated[str, typer.Option(help="Optional title")] = "",
    score: Annotated[float, typer.Option(help="Score hint")] = 0.0,
    folder: Annotated[str, typer.Option(help="Folder name")] = "",
):
    """Add a URL to bookmarks."""
    store.add(url, title=title, score=score, folder=folder)
    label = f" → [dim]{folder}[/dim]" if folder else ""
    console.print(f"[green]Added:[/green] {url}{label}")


@app.command()
def remove(
    url: Annotated[str, typer.Argument(help="URL to remove")],
):
    """Remove a URL from bookmarks."""
    if store.remove(url):
        console.print(f"[red]Removed:[/red] {url}")
    else:
        console.print(f"[yellow]Not found:[/yellow] {url}")


@app.command(name="list")
def list_bookmarks(
    sort: Annotated[str, typer.Option(help="Sort by: score | added")] = "score",
):
    """List all saved bookmarks."""
    saved = store.all_bookmarks()
    if not saved:
        console.print("[dim]No bookmarks yet. Run [bold]link-sense analyze[/bold] to get started.[/dim]")
        return

    table = Table(show_header=True, header_style="bold")
    table.add_column("Score", style="cyan", width=8)
    table.add_column("Folder", style="dim", width=16)
    table.add_column("Title / URL")
    table.add_column("Added", width=19)

    items = list(saved.items())
    if sort == "score":
        items.sort(key=lambda x: x[1].get("score", 0), reverse=True)
    elif sort == "folder":
        items.sort(key=lambda x: (x[1].get("folder", ""), -x[1].get("score", 0)))
    else:
        items.sort(key=lambda x: x[1].get("added_at", ""), reverse=True)

    for url, meta in items:
        table.add_row(
            f"{meta.get('score', 0):.1f}",
            meta.get("folder", "") or "—",
            f"{meta.get('title', url)}\n[dim]{url}[/dim]",
            str(meta.get("added_at", ""))[:19],
        )
    console.print(table)
