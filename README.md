# Link Sense

Analyzes your browser history, scores URLs by recency and visit frequency, and helps you turn the pages you really use into organized bookmarks.

**Website and live demo:** https://link-sense.codeforlife.dev

## Two ways to use it

### Chrome extension (recommended)

Review and apply bookmarks without leaving the browser. Supported on Linux with Chrome or Chromium.

Only Chrome and Chromium installed natively (config under `~/.config`) are supported. Snap and Flatpak builds of Chromium are not supported: their confinement blocks native-messaging hosts and they use different directories.

1. Run `pip install -e .` from the repository root (installs `link-sense` and `link-sense-host`)
2. `link-sense install-host` registers the native-messaging host for Chrome and Chromium
3. In Chrome, open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the `extension/` folder
4. Click the Link Sense toolbar icon, pick pages to add (with folders) or bookmarks to remove, and click **Apply**

Apply updates `~/.local/share/link-sense/bookmarks.json` and creates the bookmarks in Chrome under **Other bookmarks → Link Sense**. If Chrome and the store ever disagree, **Retry sync** re-creates missing Chrome bookmarks from the store.

Run the tests with `pytest` and `cd extension && npm test`.

### CLI report

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

## Website

The showcase site lives in `site/` (plain HTML, CSS and one JavaScript file; no build step) and is published at https://link-sense.codeforlife.dev.

```bash
# Preview locally
python -m http.server -d site 8000     # then open http://localhost:8000

# Run the site's tests
cd site && npm test
```

A GitHub Actions workflow (`.github/workflows/pages.yml`) runs the tests and deploys the site to GitHub Pages whenever `site/**` changes on `main`. It can also be started by hand from the Actions tab.

One-time setup for a new repository:

1. **Settings → Pages → Source:** choose **GitHub Actions**.
2. At your DNS provider, add a `CNAME` record for `link-sense` on `codeforlife.dev` pointing to `zafrem.github.io`.
3. After the first deploy, turn on **Enforce HTTPS** in **Settings → Pages** once the certificate is issued.

## Data storage

Bookmarks are stored in `~/.local/share/link-sense/bookmarks.json`.

Browser history databases are copied to a temp file before reading — the originals are never modified.
