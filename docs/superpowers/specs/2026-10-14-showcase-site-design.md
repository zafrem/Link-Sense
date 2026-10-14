# Link Sense Showcase Site and README Update — Design

Date: 2026-10-14
Status: Draft for review

## Goal

Publish a showcase website for Link Sense at `https://link-sense.codeforlife.dev`, deployed to GitHub Pages by a GitHub Action, and update the README so it leads with the Chrome extension and links to the site.

**Success criteria**
- A visitor can understand what Link Sense does, try an interactive demo on sample data, and find the install steps, all from one page.
- Pushing a change under `site/` to `main` redeploys the site with no manual step (after the one-time repository setup below).
- The README describes the extension as the main path, keeps the CLI report as the alternative, and tells a maintainer how the site is built and deployed.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Showcase style | Live HTML demo on sample data (no screenshots or GIFs) |
| Stack | Plain HTML, CSS and one JS file; no build step, no framework |
| Hosting | GitHub Pages, deployed by a GitHub Actions workflow |
| Publishing | Files and workflow are prepared and committed locally. Pushing to GitHub, enabling Pages and DNS are done by the repository owner. |

## Non-goals

- Analytics, cookies or any third-party scripts or fonts.
- A static-site generator, framework or bundler.
- Screenshots, GIFs or a custom 404 page.
- Reading any real browser history on the page. The demo uses sample data only.

## Files

| File | Responsibility |
|---|---|
| `site/index.html` | Page structure and copy |
| `site/styles.css` | Layout, light and dark themes, responsive rules |
| `site/demo.js` | Demo logic and sample data; exports pure functions for testing |
| `site/CNAME` | The single line `link-sense.codeforlife.dev` |
| `site/.nojekyll` | Empty file; tells Pages not to process the files |
| `.github/workflows/pages.yml` | Deploys `site/` to GitHub Pages |
| `site/test/demo.test.mjs` | Node tests for `demo.js` |
| `site/package.json` | `{"type":"module","scripts":{"test":"node --test"}}` |
| `README.md` | Updated as described below |

`site/` is used rather than `docs/` because `docs/` already holds specs and plans.

## Page content

One scrolling page. Light and dark themes follow `prefers-color-scheme`. The layout works at phone width with a 16px side gutter and no horizontal scroll. All text is real HTML text; no image is required to understand any section.

1. **Hero:** one-line pitch, a "Get started" button linking to the Install section, and a link to the GitHub repository.
2. **How it works:** three steps (analyze, review, apply), with a short note on the two ways to run it (Chrome extension, CLI report).
3. **Live demo:** about 15 sample pages shown as a ranked list with score, visit count and days since last visit. The visitor can:
   - search by title or URL;
   - assign a folder to a page (existing folder or a new name);
   - toggle Add on a page;
   - see an "Apply (N)" counter, and on Apply see the resulting `Link Sense` folder tree.
   Reset returns the demo to its starting state. The demo never persists anything.
4. **Scoring:** the formula `score = visit_count × e^(−0.1 × days_since_last_visit)` and a slider for "days since last visit" that shows how the score of a sample page decays.
5. **Install:** the steps from the README (pip install, `link-sense install-host`, load the unpacked extension, use the toolbar icon), each command with a copy button. The copy button falls back gracefully (the text stays selectable) when the Clipboard API is unavailable.
6. **Privacy:** history is read locally, copied to a temporary file before reading, and nothing leaves the machine.

## `demo.js`

Exports pure functions so Node can test them:

- `score(visitCount, daysSinceVisit) -> number`, rounded to 3 decimals, equal to `link_sense/scorer.py`: `visit_count * exp(-0.1 * days)`. The duplication is deliberate (the page cannot call Python); a comment names `link_sense/scorer.py` as the source of truth.
- `rank(entries) -> entries` sorted by score descending, each with a computed `score`.
- `filter(entries, query) -> entries`, case-insensitive match on title or URL; an empty query returns all.
- `buildFolderTree(choices) -> [{folder, items}]`, folders alphabetical, items with no folder under the root, matching how the extension names the `Link Sense` tree.

The DOM wiring in the same file builds all elements with `createElement` and `textContent`; it never assigns markup from strings (`innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`). Sample data is fixed in the file, so the rule is a consistency choice, and a test scans the source for those words.

## Deployment workflow

`.github/workflows/pages.yml`:

- Triggers: `push` to `main` with `paths: ["site/**", ".github/workflows/pages.yml"]`, and `workflow_dispatch`.
- Permissions: `contents: read`, `pages: write`, `id-token: write`.
- `concurrency: { group: pages, cancel-in-progress: false }`.
- Job `deploy` with `environment: github-pages`: `actions/checkout`, `actions/configure-pages`, `actions/upload-pages-artifact` with `path: site`, then `actions/deploy-pages`. Each action is pinned to an exact released version tag.
- A step before the upload runs `cd site && npm test`, so a failing demo test blocks the deploy. Node is set up with `actions/setup-node` (Node 22).

### One-time repository setup (done by the owner, not by this change)

1. Repository **Settings → Pages → Source: GitHub Actions**.
2. DNS: a `CNAME` record for `link-sense` on `codeforlife.dev` pointing to `zafrem.github.io`.
3. After the first successful deploy, **Settings → Pages → Enforce HTTPS** once the certificate is issued.

## README changes

- Lead with the Chrome extension as the main way to use Link Sense; keep the CLI `analyze` report flow as the alternative. Keep the existing scoring, usage and data-storage sections accurate.
- Add the site link near the top: `https://link-sense.codeforlife.dev`.
- Add a "Website" section: what `site/` is, how to preview locally (`python -m http.server -d site 8000`), `cd site && npm test`, how the workflow deploys, and the one-time setup above.

## Error handling and edge cases

- No JavaScript: the hero, how-it-works, scoring text, install steps and privacy sections remain readable; the demo area shows a one-line "Enable JavaScript to try the demo" notice (in a `<noscript>` element).
- Clipboard API unavailable or denied: copy buttons do nothing harmful and the command stays selectable text.
- Empty search result: the demo list shows "No pages match" instead of a blank area.
- Zero pages marked Add: the Apply control is disabled.
- A new folder name is trimmed and capped at 80 characters; an empty name is ignored.

## Testing

- **Node (`site/test/demo.test.mjs`):** `score` returns known values that match the Python scorer (for example `score(10, 0) = 10`, `score(3, 7) = 1.49` — computed with `link_sense.scorer`'s formula and written as fixed expectations); `rank` ordering; `filter` including empty and non-matching queries; `buildFolderTree` ordering and root items; and a source scan asserting `demo.js` contains none of the banned markup APIs.
- **Static checks (a Node test):** `index.html` references only files that exist in `site/`; `CNAME` equals `link-sense.codeforlife.dev`; `.nojekyll` exists; the page has exactly one `<h1>` and a `<title>`.
- **Workflow check:** `pages.yml` parses as YAML and contains the permissions, concurrency and action steps above (verified with a small script during implementation, since the workflow cannot run locally).
- **Manual:** preview with a local server and look at desktop and phone widths in both themes; the owner confirms the first deploy and the domain after pushing.

## Open risks

- The custom domain only works after the owner's DNS and Pages settings are done; until then the Pages default URL serves the site.
- The demo's scoring duplicates Python logic; the fixed-value test is what keeps them aligned.
