# Link Sense

Analyzes your browser history, scores URLs by recency and visit frequency, and lets you curate bookmarks through an interactive HTML report.

## How it works

1. **Analyze** — reads Chrome/Firefox history, scores each URL, and generates `report.html`
2. **Review** — open the report in any browser, browse the ranked list, assign folders, mark items to add or remove
3. **Script** — click **Create Script** to generate `apply.sh`; copy or download it
4. **Apply** — run `bash apply.sh` to commit your choices

## Scoring

```
score = visit_count × e^(−0.1 × days_since_last_visit)
```

Frequently-visited and recently-visited pages rank highest. Old pages decay naturally.

## Install

```bash
pip install -e .
```

## Usage

```bash
# Generate the HTML report and open it in your browser
link-sense analyze

# Options
link-sense analyze --browser chrome   # chrome | firefox | auto (default)
link-sense analyze --output ~/report.html
link-sense analyze --no-open          # don't auto-open

# Manage bookmarks directly
link-sense add "https://example.com" --title "Example" --folder "Work"
link-sense remove "https://example.com"
link-sense list
link-sense list --sort folder
```

## Report features

- **Sidebar** — all URLs grouped by folder, sorted by score; search filters live
- **Detail panel** — click any item to see score, visit count, last visit date, and folder assignment
- **Folders** — create folders from the sidebar or detail panel; assign any URL to a folder
- **Add / Remove** — toggle each item's pending action; items are highlighted in the sidebar
- **Create Script** — generates a `bash` script grouped by folder; copy to clipboard or download as `apply.sh`

State (folder assignments, pending actions) is saved to `localStorage` so your work persists across page refreshes.

## Chrome extension (Linux, Chrome/Chromium)

Review and apply bookmarks without leaving the browser.

1. `pip install -e .` (installs `link-sense` and `link-sense-host`)
2. `link-sense install-host` registers the native-messaging host for Chrome and Chromium
3. In Chrome, open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the `extension/` folder
4. Click the Link Sense toolbar icon, pick pages to add (with folders) or bookmarks to remove, and click **Apply**

Apply updates `~/.local/share/link-sense/bookmarks.json` and creates the bookmarks in Chrome under **Other bookmarks → Link Sense**. If Chrome and the store ever disagree, **Retry sync** re-creates missing Chrome bookmarks from the store.

Run the tests with `pytest` and `cd extension && npm test`.

## Data storage

Bookmarks are stored in `~/.local/share/link-sense/bookmarks.json`.

Browser history databases are copied to a temp file before reading — the originals are never modified.
