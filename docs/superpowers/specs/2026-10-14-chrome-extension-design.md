# Link Sense Chrome Extension — Design

Date: 2026-10-14
Status: Draft for review

## Goal

Let a user review their ranked browser history and apply bookmark choices from inside Chrome, without generating `report.html`, copying `apply.sh`, or running it by hand.

The Python CLI stays the engine: it reads history, scores URLs and owns `~/.local/share/link-sense/bookmarks.json`. The extension is the UI. The two talk over Chrome native messaging.

**Success criteria**
- Clicking the toolbar icon shows the same ranked candidate and saved lists as `link-sense analyze`.
- Choosing add/remove and folders, then clicking Apply, updates both `bookmarks.json` and the real Chrome bookmarks.
- If the native host is missing, the UI says exactly how to install it.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Relationship to CLI | Extension + CLI via native messaging |
| Bookmark target | Both: `bookmarks.json` and `chrome.bookmarks` |
| Browsers | Chrome and Chromium first (Manifest V3); Firefox later |

## Non-goals

- Firefox host or extension.
- Two-way sync: bookmarks created by hand in Chrome are not imported.
- Chrome Web Store listing or packaging.
- Reimplementing scoring in JavaScript.

## Components

### 1. Native host — `link_sense/host.py`

A thin process that Chrome launches. It speaks the native messaging protocol on stdin/stdout (4-byte little-endian length prefix, then UTF-8 JSON) and calls existing modules directly: the history readers in `readers/`, `scorer.score`, and `store.add/remove/all_bookmarks`.

- Exposed as the `link-sense-host` script in `pyproject.toml`.
- History reading currently lives in `cli._read_history`, which prints with `rich`. Printing to stdout would corrupt the protocol stream. The reader loop is moved into a function that takes no console and returns entries (the CLI keeps its own printing wrapper). Nothing else in `cli.py` changes behavior.
- One request per message, one response per request. The host exits when stdin closes.
- Chrome limits a host-to-browser message to 1 MB. `analyze` therefore returns at most `max_results` candidates (default 500, highest score first) plus all saved bookmarks. If the serialized response would still exceed 900 KB, candidates are trimmed from the low-score end until it fits, and the response carries `"truncated": true`.

### 2. Host installer — `link-sense install-host`

A new Typer command. It writes the host manifest `com.linksense.host.json`:

```json
{
  "name": "com.linksense.host",
  "description": "Link Sense native host",
  "path": "<absolute path to link-sense-host>",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://<EXTENSION_ID>/"]
}
```

to `~/.config/google-chrome/NativeMessagingHosts/` and `~/.config/chromium/NativeMessagingHosts/` (Linux; directories are created if missing). The path is resolved with `shutil.which("link-sense-host")` and the command fails with a clear message if it is not found. Other operating systems are out of scope for the first version.

`EXTENSION_ID` is a constant in the package. The extension's `manifest.json` carries a pinned public `key` so the ID is stable across machines. The key pair is generated once with `openssl`; only the public key is committed.

### 3. Extension — `extension/`

Manifest V3. Permissions: `nativeMessaging`, `bookmarks`, `storage`.

- `service-worker.js` owns the native port (`chrome.runtime.connectNative("com.linksense.host")`), forwards requests from the UI, and performs the `chrome.bookmarks` mirroring after a successful apply.
- `ui.html` / `ui.js` / `ui.css` open in a tab from the toolbar icon. Behavior mirrors the current report: sidebar of URLs grouped by folder and sorted by score, live search, detail panel (score, visits, last visit, folder), folder creation, per-item add/remove toggle, and an Apply button replacing "Create Script". Pending choices persist in `chrome.storage.local`.
- `bookmark-tree.js` is pure logic with no `chrome.*` calls: given an `apply` result and the existing bookmark tree, it returns the list of create/remove operations. This is the unit-tested part.

## Messages

All messages are JSON objects with a `type` and an optional `id` echoed in the response.

| Request | Response |
|---|---|
| `{type:"analyze", limit?:int, max_results?:int}` | `{type:"analyze", candidates:[ScoredEntry], saved:[ScoredEntry], truncated:bool}` |
| `{type:"apply", adds:[{url,title,score,folder}], removes:[url]}` | `{type:"apply", added:[url], removed:[url], missing:[url]}` |
| any | `{type:"error", message:string}` on failure |

`ScoredEntry` mirrors the dataclass in `scorer.py` (`url`, `title`, `visit_count`, `last_visit_time` as ISO string, `days_since_visit`, `score`). Entries in `saved` carry one extra field, `folder` (from the store), which the UI shows and Retry sync uses. `limit` is the per-browser history read limit (default 2000, as in the CLI). `missing` lists removals whose URL was not in the store.

## Data flow

1. User clicks the toolbar icon; the UI sends `analyze` via the service worker.
2. Host reads history, scores, splits candidates (not in store) from saved bookmarks, and replies.
3. User toggles items and assigns folders; choices are kept in `chrome.storage.local`.
4. User clicks Apply; the UI sends `apply`.
5. Host calls `store.add` / `store.remove` and replies with what was applied.
6. Only for URLs listed in `added` / `removed`, the service worker mirrors the change in Chrome: a `Link Sense` folder under "Other bookmarks" with one subfolder per folder name (URLs with no folder go in the root `Link Sense` folder). Removals delete bookmarks with that URL inside the `Link Sense` tree only.

## Error handling

- **Host not installed / manifest stale:** `connectNative` fails; the UI shows "Native host not found. Run `link-sense install-host`, then reload this page."
- **Host-side failure** (for example no history found): host replies `error`; the UI shows it inline and applies nothing.
- **Chrome bookmark failure for an item:** reported per item. `bookmarks.json` is then ahead of Chrome, so the UI offers "Retry sync", which re-runs `analyze`, then creates a Chrome bookmark for every entry in `saved` that is missing from the `Link Sense` tree.
- **Host crash or disconnect mid-session:** the service worker reconnects on the next request; in-flight requests reject with an error shown in the UI.
- **Truncated results:** the UI shows a notice with the number shown.

## Testing

- **Python (pytest):** framing (encode/decode round trip, oversized message), `analyze` and `apply` handlers against a temp store with fake history entries, truncation behavior, and `install-host` writing the manifest to a temp home directory.
- **JavaScript (Node built-in test runner):** `bookmark-tree.js` operation planning, including folder creation, root-level URLs and removals scoped to the `Link Sense` tree.
- **Manual end to end:** load `extension/` unpacked in Chrome, run `link-sense install-host`, apply a mix of adds and removes, confirm `link-sense list` and the Chrome bookmarks manager agree.

## Open risks

- Chrome profile paths differ per OS and per Chrome channel (Beta, Dev, Flatpak/Snap). The first version covers the two Linux paths above.
- `chrome.bookmarks` deduplication by URL is not automatic; the planner skips creating a bookmark whose URL already exists in the target folder.
