# Link Sense Showcase Site and README Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dependency-free showcase site with a live demo for `link-sense.codeforlife.dev`, a GitHub Actions workflow that deploys it to GitHub Pages, and a README that leads with the Chrome extension and links to the site.

**Architecture:** A static page (`site/index.html`, `styles.css`, `demo.js`) with no build step. `demo.js` exports pure functions (scoring, ranking, filtering, folder tree, clipboard helper) that Node tests cover, and wires the DOM only when a `document` exists. A workflow tests the site, stages the publishable files into `_site/`, and deploys them with the official Pages actions.

**Tech Stack:** HTML, CSS, vanilla ES modules; Node built-in test runner; GitHub Actions (`actions/*` Pages actions).

**Spec:** `docs/superpowers/specs/2026-10-14-showcase-site-design.md`

## Global Constraints

- Domain is `link-sense.codeforlife.dev`; `site/CNAME` contains exactly that one line.
- Plain HTML, CSS and one JS file (`demo.js`); no build step, no framework, no bundler, no npm dependencies.
- No analytics, cookies, third-party scripts, third-party fonts or remote images. External links are only to the GitHub repository.
- The demo uses fixed sample data and never reads real browser history; it persists nothing.
- `demo.js` scoring equals `link_sense/scorer.py`: `visit_count * exp(-0.1 * days)`, rounded to 3 decimals. A comment in `demo.js` names `link_sense/scorer.py` as the source of truth.
- `demo.js` and all page scripts never assign markup from strings: none of `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval` may appear in `demo.js`, even in comments (a test scans the source).
- Light and dark themes follow `prefers-color-scheme`; the layout works at phone width with a 16px side gutter and no horizontal page scroll.
- With JavaScript disabled, every section except the demo stays readable; the demo area shows a `<noscript>` notice.
- New folder names are trimmed and capped at 80 characters; an empty name is ignored. The Apply control is disabled when nothing is marked Add.
- Workflow permissions are exactly `contents: read`, `pages: write`, `id-token: write`; `concurrency: { group: pages, cancel-in-progress: false }`; each action is pinned to an exact version tag; the site tests run before the artifact is uploaded.
- Nothing in this change pushes to GitHub, enables Pages or touches DNS. Those are the owner's one-time steps, documented in the README.

## Review Focus

Inputs the spec implies but no happy-path test exercises. Each has a test in the named task.

1. **Clipboard unavailable or denied** — the copy helper returns `false` instead of throwing, and the command stays selectable (Task 1, `copyText` tests; Task 2 wiring selects the text on failure).
2. **Odd folder names** — blank, whitespace-only, over 80 characters, and names containing HTML characters are normalized or rendered as plain text, never markup (Task 1, `normalizeFolder` tests and source scan).
3. **No search matches and zero marked pages** — an empty result is an empty list that the page labels "No pages match", and Apply is disabled with zero adds (Task 1, `filterEntries` and `countAdds` tests; Task 2 wiring).
4. **Deploy publishes the wrong files, or deploys a broken site** — tests and the `_site/` staging directory mean `site/test/` and `package.json` are not published, and a failing test blocks deploy (Task 3, `workflow.test.mjs`).
5. **Scoring drift from Python** — fixed expectations computed from `link_sense/scorer.py` pin the demo's formula (Task 1, `score` tests).

## File Structure

| File | Responsibility |
|---|---|
| `site/package.json` | `type: module` and the `npm test` script |
| `site/demo.js` | Sample data, pure helpers (Task 1), DOM wiring behind a `document` guard (Task 2) |
| `site/index.html` | Page structure and copy |
| `site/styles.css` | Layout, themes, responsive rules |
| `site/CNAME`, `site/.nojekyll` | Pages domain and no-Jekyll marker |
| `site/test/demo.test.mjs` | Tests for the pure helpers and the source scan |
| `site/test/site.test.mjs` | Static checks on `index.html` and the deploy files |
| `site/test/workflow.test.mjs` | Checks on `.github/workflows/pages.yml` |
| `.github/workflows/pages.yml` | Test, stage and deploy |
| `README.md` | Updated documentation |

---

### Task 1: Demo logic (pure functions) with tests

**Files:**
- Create: `site/package.json`, `site/demo.js`
- Test: `site/test/demo.test.mjs`

**Interfaces:**
- Produces (all named exports of `site/demo.js`):
  - `DECAY_LAMBDA = 0.1`, `MAX_FOLDER_LENGTH = 80`
  - `SAMPLE: {title, url, visits, days}[]` (15 entries)
  - `score(visitCount: number, daysSinceVisit: number) -> number` (3 decimals)
  - `rank(entries) -> entries` (each entry copied with a `score`, sorted descending, stable for ties)
  - `filterEntries(entries, query: string) -> entries` (case-insensitive match on `title` or `url`; blank query returns all)
  - `normalizeFolder(name: string) -> string`
  - `countAdds(choices: Map<string, {add: boolean, folder: string}>) -> number`
  - `buildFolderTree(items: {title, url, folder}[]) -> {folder: string, items}[]` (the `""` root group first if non-empty, then folders alphabetical by `localeCompare`; items keep input order; empty input gives `[]`)
  - `copyText(text: string, clipboard: {writeText}|undefined) -> Promise<boolean>`

- [ ] **Step 1: Create the package file**

Create `site/package.json`:

```json
{
  "name": "link-sense-site",
  "private": true,
  "type": "module",
  "scripts": { "test": "node --test" }
}
```

- [ ] **Step 2: Write the failing tests**

Create `site/test/demo.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MAX_FOLDER_LENGTH,
  SAMPLE,
  buildFolderTree,
  copyText,
  countAdds,
  filterEntries,
  normalizeFolder,
  rank,
  score,
} from "../demo.js";

// Expected values come from link_sense/scorer.py: round(visits * exp(-0.1 * days), 3).
test("score matches the Python scorer", () => {
  assert.equal(score(10, 0), 10);
  assert.equal(score(3, 7), 1.49);
  assert.equal(score(1, 0), 1);
  assert.equal(score(0, 5), 0);
  assert.equal(score(42, 0.5), 39.952);
  assert.equal(score(10, 30), 0.498);
});

test("sample data has 15 well-formed entries with unique urls", () => {
  assert.equal(SAMPLE.length, 15);
  assert.equal(new Set(SAMPLE.map((e) => e.url)).size, 15);
  for (const e of SAMPLE) {
    assert.equal(typeof e.title, "string");
    assert.match(e.url, /^https:\/\//);
    assert.ok(e.visits > 0 && e.days >= 0);
  }
});

test("rank sorts by score descending and does not mutate the input", () => {
  const input = [
    { title: "old", url: "https://a.example/", visits: 5, days: 40 },
    { title: "hot", url: "https://b.example/", visits: 5, days: 0 },
    { title: "mid", url: "https://c.example/", visits: 5, days: 5 },
  ];
  const ranked = rank(input);
  assert.deepEqual(ranked.map((e) => e.title), ["hot", "mid", "old"]);
  assert.equal(ranked[0].score, 5);
  assert.equal("score" in input[0], false);
});

test("rank keeps input order for equal scores", () => {
  const input = [
    { title: "first", url: "https://a.example/", visits: 2, days: 1 },
    { title: "second", url: "https://b.example/", visits: 2, days: 1 },
  ];
  assert.deepEqual(rank(input).map((e) => e.title), ["first", "second"]);
});

test("filterEntries matches title or url case-insensitively", () => {
  const items = [
    { title: "Python docs", url: "https://docs.python.org/" },
    { title: "Rust book", url: "https://doc.rust-lang.org/" },
  ];
  assert.equal(filterEntries(items, "PYTHON").length, 1);
  assert.equal(filterEntries(items, "rust-lang").length, 1);
  assert.equal(filterEntries(items, "   ").length, 2);
  assert.equal(filterEntries(items, "").length, 2);
  assert.deepEqual(filterEntries(items, "nothing matches"), []);
});

test("normalizeFolder trims, caps and ignores blanks", () => {
  assert.equal(normalizeFolder("  Work  "), "Work");
  assert.equal(normalizeFolder(""), "");
  assert.equal(normalizeFolder("   \t "), "");
  assert.equal(normalizeFolder("x".repeat(200)).length, MAX_FOLDER_LENGTH);
  assert.equal(normalizeFolder("<b>bold</b>"), "<b>bold</b>"); // kept as text; rendering uses textContent
});

test("normalizeFolder never leaves trailing whitespace after capping", () => {
  const name = `${"x".repeat(79)} yyyy`;
  const out = normalizeFolder(name);
  assert.equal(out, out.trim());
  assert.ok(out.length <= MAX_FOLDER_LENGTH);
});

test("countAdds counts only marked entries", () => {
  const choices = new Map([
    ["a", { add: true, folder: "" }],
    ["b", { add: false, folder: "Work" }],
    ["c", { add: true, folder: "Work" }],
  ]);
  assert.equal(countAdds(choices), 2);
  assert.equal(countAdds(new Map()), 0);
});

test("buildFolderTree puts root items first and folders alphabetically", () => {
  const items = [
    { title: "t1", url: "u1", folder: "Work" },
    { title: "t2", url: "u2", folder: "" },
    { title: "t3", url: "u3", folder: "Docs" },
    { title: "t4", url: "u4", folder: "Work" },
  ];
  const tree = buildFolderTree(items);
  assert.deepEqual(tree.map((g) => g.folder), ["", "Docs", "Work"]);
  assert.deepEqual(tree[2].items.map((i) => i.url), ["u1", "u4"]);
});

test("buildFolderTree omits the root group when nothing is unfiled, and handles empty input", () => {
  assert.deepEqual(buildFolderTree([]), []);
  const tree = buildFolderTree([{ title: "t", url: "u", folder: "A" }]);
  assert.deepEqual(tree.map((g) => g.folder), ["A"]);
});

test("copyText returns false when the clipboard is missing or rejects", async () => {
  assert.equal(await copyText("x", undefined), false);
  assert.equal(await copyText("x", {}), false);
  assert.equal(await copyText("x", { writeText: () => Promise.reject(new Error("denied")) }), false);
});

test("copyText writes the text and returns true on success", async () => {
  const written = [];
  const ok = await copyText("pip install -e .", { writeText: async (t) => written.push(t) });
  assert.equal(ok, true);
  assert.deepEqual(written, ["pip install -e ."]);
});

test("demo.js never builds markup from strings", () => {
  const src = readFileSync(new URL("../demo.js", import.meta.url), "utf8");
  for (const banned of ["innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "eval("]) {
    assert.equal(src.includes(banned), false, `demo.js must not contain ${banned}`);
  }
});
```

- [ ] **Step 3: Run to verify failure**

Run: `cd site && npm test`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `../demo.js`.

- [ ] **Step 4: Implement**

Create `site/demo.js`:

```js
// Scoring mirrors link_sense/scorer.py, which is the source of truth:
// score = visit_count * exp(-0.1 * days_since_last_visit), rounded to 3 decimals.
export const DECAY_LAMBDA = 0.1;
export const MAX_FOLDER_LENGTH = 80;

export const SAMPLE = [
  { title: "Hacker News", url: "https://news.ycombinator.com/", visits: 120, days: 0.1 },
  { title: "GitHub pull requests", url: "https://github.com/pulls", visits: 55, days: 0.2 },
  { title: "Python 3 documentation", url: "https://docs.python.org/3/", visits: 42, days: 0.5 },
  { title: "MDN Web Docs", url: "https://developer.mozilla.org/", visits: 38, days: 1 },
  { title: "Regex101", url: "https://regex101.com/", visits: 23, days: 1.5 },
  { title: "PostgreSQL documentation", url: "https://www.postgresql.org/docs/current/", visits: 21, days: 2 },
  { title: "Can I use", url: "https://caniuse.com/", visits: 17, days: 4 },
  { title: "Rust by Example", url: "https://doc.rust-lang.org/rust-by-example/", visits: 14, days: 6 },
  { title: "crontab.guru", url: "https://crontab.guru/", visits: 13, days: 8 },
  { title: "Linux kernel documentation", url: "https://docs.kernel.org/", visits: 8, days: 5 },
  { title: "Stack Overflow: undo a git rebase", url: "https://stackoverflow.com/questions/134882/undo-a-git-rebase", visits: 9, days: 3 },
  { title: "Exponential decay (Wikipedia)", url: "https://en.wikipedia.org/wiki/Exponential_decay", visits: 3, days: 9 },
  { title: "Sourdough bread recipe", url: "https://example.com/sourdough", visits: 6, days: 12 },
  { title: "Flight search", url: "https://example.com/flights", visits: 4, days: 20 },
  { title: "Old forum thread", url: "https://example.com/forum/old-thread", visits: 11, days: 45 },
];

export function score(visitCount, daysSinceVisit) {
  return Math.round(visitCount * Math.exp(-DECAY_LAMBDA * daysSinceVisit) * 1000) / 1000;
}

export function rank(entries) {
  return entries
    .map((e) => ({ ...e, score: score(e.visits, e.days) }))
    .sort((a, b) => b.score - a.score);
}

export function filterEntries(entries, query) {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter((e) => e.title.toLowerCase().includes(q) || e.url.toLowerCase().includes(q));
}

export function normalizeFolder(name) {
  return name.trim().slice(0, MAX_FOLDER_LENGTH).trim();
}

export function countAdds(choices) {
  let n = 0;
  for (const choice of choices.values()) if (choice.add) n += 1;
  return n;
}

// items: [{ title, url, folder }]. Root (unfiled) group first, then folders A-Z.
export function buildFolderTree(items) {
  const groups = new Map();
  for (const item of items) {
    const folder = item.folder ?? "";
    if (!groups.has(folder)) groups.set(folder, []);
    groups.get(folder).push(item);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b)))
    .map(([folder, groupItems]) => ({ folder, items: groupItems }));
}

export async function copyText(text, clipboard) {
  if (!clipboard || typeof clipboard.writeText !== "function") return false;
  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 5: Run to verify pass**

Run: `cd site && npm test`
Expected: PASS (all tests, 0 failures).

- [ ] **Step 6: Confirm the scorer expectations against Python**

Run: `python3 -c "import math; print([round(v*math.exp(-0.1*d),3) for v,d in [(10,0),(3,7),(1,0),(0,5),(42,0.5),(10,30)]])"`
Expected: `[10.0, 1.49, 1.0, 0.0, 39.952, 0.498]`, equal to the values asserted in the `score` test.

- [ ] **Step 7: Commit**

```bash
git add site/package.json site/demo.js site/test/demo.test.mjs
git commit -m "feat(site): add demo logic with tests"
```

---

### Task 2: Page, styles, DOM wiring and static checks

**Files:**
- Create: `site/index.html`, `site/styles.css`, `site/CNAME`, `site/.nojekyll`
- Modify: `site/demo.js` (append the DOM wiring)
- Test: `site/test/site.test.mjs`

**Interfaces:**
- Consumes: every export from Task 1.
- Produces: element ids the wiring depends on: `demo`, `demo-search`, `demo-list`, `demo-folders` (a `<datalist>`), `demo-apply`, `demo-reset`, `demo-result`, `decay-days`, `decay-score`, `decay-bar`, `decay-label`; copy buttons carry `data-copy-target="<id of the <code> element>"`.

- [ ] **Step 1: Write the failing static test**

Create `site/test/site.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const siteDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(path.join(siteDir, "index.html"), "utf8");

test("CNAME is exactly the custom domain", () => {
  assert.equal(readFileSync(path.join(siteDir, "CNAME"), "utf8").trim(), "link-sense.codeforlife.dev");
});

test(".nojekyll exists", () => {
  assert.ok(existsSync(path.join(siteDir, ".nojekyll")));
});

test("index.html has the basics: doctype, lang, viewport, title, one h1", () => {
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<meta name="viewport"/);
  assert.match(html, /<title>[^<]+<\/title>/);
  assert.equal((html.match(/<h1[\s>]/g) ?? []).length, 1);
});

test("every local href/src points at a file that exists", () => {
  const refs = [...html.matchAll(/\b(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
  const local = refs.filter((r) => !/^(https?:|mailto:|#)/.test(r));
  assert.ok(local.length >= 2, "expected at least styles.css and demo.js");
  for (const ref of local) {
    assert.ok(existsSync(path.join(siteDir, ref)), `missing local file: ${ref}`);
  }
});

test("every in-page anchor has a matching id", () => {
  const anchors = [...html.matchAll(/\bhref="#([^"]+)"/g)].map((m) => m[1]);
  for (const id of anchors) {
    assert.ok(html.includes(`id="${id}"`), `no element with id="${id}"`);
  }
});

test("external links go only to the project repository", () => {
  const external = [...html.matchAll(/\b(?:href|src)="(https?:[^"]+)"/g)].map((m) => m[1]);
  for (const url of external) {
    assert.ok(url.startsWith("https://github.com/zafrem/Link-Sense"), `unexpected external reference: ${url}`);
  }
});

test("no third-party scripts, fonts or inline handlers", () => {
  assert.equal(/<script[^>]+src="https?:/.test(html), false);
  assert.equal(/fonts\.(googleapis|gstatic)/.test(html), false);
  assert.equal(/\son[a-z]+="/.test(html), false);
});

test("all element ids the demo wiring needs are present", () => {
  for (const id of [
    "demo", "demo-search", "demo-list", "demo-folders", "demo-apply", "demo-reset", "demo-result",
    "decay-days", "decay-score", "decay-bar", "decay-label",
  ]) {
    assert.ok(html.includes(`id="${id}"`), `missing id="${id}"`);
  }
});

test("every copy button targets an existing element", () => {
  const targets = [...html.matchAll(/data-copy-target="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(targets.length >= 3);
  for (const id of targets) assert.ok(html.includes(`id="${id}"`), `copy target missing: ${id}`);
});

test("the demo has a noscript notice", () => {
  assert.match(html, /<noscript>[\s\S]*JavaScript[\s\S]*<\/noscript>/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd site && npm test`
Expected: FAIL for `site.test.mjs` (`ENOENT` for `CNAME`/`index.html`).

- [ ] **Step 3: Create the small deploy files**

Create `site/CNAME` containing the single line:

```
link-sense.codeforlife.dev
```

Create `site/.nojekyll` as an empty file (`: > site/.nojekyll`).

- [ ] **Step 4: Write the page**

Create `site/index.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Link Sense — bookmark what you actually use</title>
  <meta name="description" content="Link Sense scores your browser history by recency and frequency, then helps you turn the pages you really use into organized bookmarks.">
  <meta name="color-scheme" content="light dark">
  <link rel="stylesheet" href="styles.css">
  <script type="module" src="demo.js"></script>
</head>
<body>
  <header class="top">
    <div class="wrap bar">
      <a class="brand" href="#top">Link Sense</a>
      <nav aria-label="Sections">
        <a href="#how">How it works</a>
        <a href="#demo">Demo</a>
        <a href="#scoring">Scoring</a>
        <a href="#install">Install</a>
        <a href="https://github.com/zafrem/Link-Sense">GitHub</a>
      </nav>
    </div>
  </header>

  <main id="top">
    <section class="hero wrap">
      <p class="eyebrow">Browser history, put to work</p>
      <h1>Bookmark what you actually use.</h1>
      <p class="lead">Link Sense reads your Chrome or Firefox history, ranks every page by how often and how recently you visit it, and lets you turn the winners into tidy bookmark folders. Everything happens on your machine.</p>
      <p class="actions">
        <a class="button" href="#install">Get started</a>
        <a class="button ghost" href="#demo">Try the demo</a>
      </p>
    </section>

    <section id="how" class="wrap">
      <h2>How it works</h2>
      <ol class="steps">
        <li><h3>Analyze</h3><p>Reads your local history, copies the database first so the original is never touched, and scores every URL.</p></li>
        <li><h3>Review</h3><p>Browse the ranked list, search it, pick a folder for each page, and mark what to add or remove.</p></li>
        <li><h3>Apply</h3><p>One click writes your choices to Link Sense's store and to real Chrome bookmarks.</p></li>
      </ol>
      <p class="note">Use it as a <strong>Chrome extension</strong> (recommended) or as a <strong>CLI</strong> that writes an HTML report and an <code>apply.sh</code> script.</p>
    </section>

    <section id="demo" class="wrap">
      <h2>Try it</h2>
      <p class="muted">Sample data only. Nothing here reads your real history or leaves this page.</p>
      <noscript><p class="notice">Enable JavaScript to try the demo.</p></noscript>
      <div class="panel">
        <div class="toolbar">
          <label class="sr-only" for="demo-search">Search sample pages</label>
          <input id="demo-search" type="search" placeholder="Search title or URL" autocomplete="off">
          <button id="demo-apply" class="button" type="button" disabled>Apply</button>
          <button id="demo-reset" class="button ghost" type="button">Reset</button>
        </div>
        <datalist id="demo-folders">
          <option value="Docs"></option>
          <option value="Reading"></option>
          <option value="Tools"></option>
        </datalist>
        <ul id="demo-list" class="items" aria-label="Sample pages, highest score first"></ul>
        <div id="demo-result" class="result" role="region" aria-live="polite" aria-label="Resulting bookmarks"></div>
      </div>
    </section>

    <section id="scoring" class="wrap">
      <h2>Scoring</h2>
      <p>Each page gets one number:</p>
      <pre class="formula"><code>score = visit_count × e^(−0.1 × days_since_last_visit)</code></pre>
      <p>Pages you visit often and recently rank highest, and old pages fade on their own. Drag the slider to see a page with 10 visits decay.</p>
      <div class="decay">
        <label for="decay-days">Days since last visit</label>
        <input id="decay-days" type="range" min="0" max="60" step="1" value="0">
        <p id="decay-label" class="muted">0 days since last visit</p>
        <div class="meter" aria-hidden="true"><div id="decay-bar" class="meter-fill"></div></div>
        <p class="big">Score: <output id="decay-score" for="decay-days">10.00</output></p>
      </div>
    </section>

    <section id="install" class="wrap">
      <h2>Install</h2>
      <p class="muted">Chrome extension, Linux with Chrome or Chromium (native installs; Snap and Flatpak builds are not supported).</p>
      <ol class="install">
        <li>
          <p>Install the package from the repository root:</p>
          <div class="cmd"><pre><code id="cmd-install">pip install -e .</code></pre><button class="button ghost" type="button" data-copy-target="cmd-install">Copy</button></div>
        </li>
        <li>
          <p>Register the native-messaging host:</p>
          <div class="cmd"><pre><code id="cmd-host">link-sense install-host</code></pre><button class="button ghost" type="button" data-copy-target="cmd-host">Copy</button></div>
        </li>
        <li>
          <p>Open the extensions page, switch on <strong>Developer mode</strong>, choose <strong>Load unpacked</strong> and select the <code>extension/</code> folder:</p>
          <div class="cmd"><pre><code id="cmd-url">chrome://extensions</code></pre><button class="button ghost" type="button" data-copy-target="cmd-url">Copy</button></div>
        </li>
        <li><p>Click the Link Sense toolbar icon, pick pages, and press <strong>Apply</strong>. Bookmarks appear under <strong>Other bookmarks → Link Sense</strong>.</p></li>
      </ol>
      <p>Prefer the command line? <code>link-sense analyze</code> writes an interactive HTML report. See the <a href="https://github.com/zafrem/Link-Sense#readme">README</a> for details.</p>
    </section>

    <section id="privacy" class="wrap">
      <h2>Privacy</h2>
      <p>Your history stays on your computer. Link Sense copies the browser's history database to a temporary file before reading it, never modifies the original, and sends nothing over the network. This site has no analytics, cookies or third-party scripts.</p>
    </section>
  </main>

  <footer class="wrap foot">
    <p><a href="https://github.com/zafrem/Link-Sense">Link Sense on GitHub</a> · link-sense.codeforlife.dev</p>
  </footer>
</body>
</html>
```

- [ ] **Step 5: Write the styles**

Create `site/styles.css`:

```css
:root {
  --bg: #fbfaf7;
  --fg: #1c1b18;
  --muted: #6a675f;
  --line: #e4e0d6;
  --card: #ffffff;
  --accent: #0f766e;
  --accent-fg: #ffffff;
  --accent-soft: #d9efec;
  --serif: ui-serif, Georgia, "Times New Roman", serif;
  --sans: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #13130f;
    --fg: #ecebe4;
    --muted: #a19e92;
    --line: #2c2b25;
    --card: #1b1a15;
    --accent: #5fd0c4;
    --accent-fg: #06201d;
    --accent-soft: #17332f;
  }
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.6 var(--sans); }
.wrap { max-width: 960px; margin: 0 auto; padding: 0 16px; }
a { color: var(--accent); }
h1, h2, h3 { line-height: 1.2; margin: 0 0 .5em; }
h1 { font: 700 clamp(2.2rem, 6vw, 3.8rem)/1.05 var(--serif); letter-spacing: -.02em; }
h2 { font: 700 1.7rem/1.2 var(--serif); margin-top: 0; }
h3 { font-size: 1.05rem; }
section { padding: 48px 0; border-top: 1px solid var(--line); }
.hero { padding: 72px 16px 56px; border-top: 0; }
.eyebrow { text-transform: uppercase; letter-spacing: .12em; font-size: .78rem; color: var(--accent); font-weight: 700; margin: 0 0 12px; }
.lead { font-size: 1.2rem; max-width: 40em; color: var(--muted); }
.muted { color: var(--muted); }
.note { color: var(--muted); }
code, pre { font-family: var(--mono); font-size: .92em; }

.top { position: sticky; top: 0; z-index: 5; background: color-mix(in srgb, var(--bg) 90%, transparent); backdrop-filter: blur(8px); border-bottom: 1px solid var(--line); }
.bar { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding-top: 10px; padding-bottom: 10px; flex-wrap: wrap; }
.brand { font: 700 1.15rem var(--serif); text-decoration: none; color: var(--fg); }
nav { display: flex; gap: 16px; flex-wrap: wrap; font-size: .95rem; }
nav a { text-decoration: none; color: var(--muted); }
nav a:hover { color: var(--accent); }

.actions { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 24px; }
.button { display: inline-block; padding: 10px 18px; border-radius: 8px; border: 1px solid var(--accent); background: var(--accent); color: var(--accent-fg); font: 600 .95rem var(--sans); text-decoration: none; cursor: pointer; }
.button.ghost { background: transparent; color: var(--accent); }
.button:disabled { opacity: .45; cursor: default; }
.button:focus-visible, input:focus-visible, a:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }

.steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; padding: 0; margin: 24px 0; list-style: none; counter-reset: step; }
.steps li { counter-increment: step; background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 20px; }
.steps li::before { content: counter(step); display: inline-grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; background: var(--accent-soft); color: var(--accent); font-weight: 700; margin-bottom: 10px; }
.steps p { margin: 0; color: var(--muted); }

.panel { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 16px; margin-top: 16px; }
.toolbar { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
.toolbar input[type="search"] { flex: 1 1 220px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--bg); color: var(--fg); font: inherit; }
.items { list-style: none; margin: 0; padding: 0; max-height: 440px; overflow-y: auto; border-top: 1px solid var(--line); }
.item { display: grid; grid-template-columns: 1fr minmax(120px, 170px) auto; gap: 12px; align-items: center; padding: 10px 4px; border-bottom: 1px solid var(--line); }
.item.marked { background: var(--accent-soft); }
.item .info { min-width: 0; }
.item .title { display: block; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.item .url, .item .meta { display: block; font-size: .82rem; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.item input { width: 100%; padding: 7px 9px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--fg); font: inherit; font-size: .9rem; }
.item .toggle { min-width: 76px; }
.empty { padding: 20px 4px; color: var(--muted); }
.result { margin-top: 16px; }
.result ul { list-style: none; margin: 0; padding-left: 20px; }
.result .tree { padding: 0; }
.result li { padding: 2px 0; }
.result .folder { font-weight: 600; }
.notice { padding: 12px 16px; border: 1px dashed var(--line); border-radius: 8px; }

.formula { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 14px 16px; overflow-x: auto; }
.decay { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 16px; }
.decay input[type="range"] { width: 100%; accent-color: var(--accent); }
.meter { height: 12px; border-radius: 6px; background: var(--line); overflow: hidden; }
.meter-fill { height: 100%; width: 100%; background: var(--accent); transition: width .15s ease; }
.big { font: 700 1.4rem var(--serif); margin: 12px 0 0; }

.install { padding-left: 20px; }
.install li { margin-bottom: 16px; }
.cmd { display: flex; gap: 8px; align-items: stretch; }
.cmd pre { flex: 1; margin: 0; padding: 10px 14px; background: var(--card); border: 1px solid var(--line); border-radius: 8px; overflow-x: auto; }
.foot { padding-top: 24px; padding-bottom: 48px; color: var(--muted); border-top: 1px solid var(--line); }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

@media (max-width: 700px) {
  .steps { grid-template-columns: 1fr; }
  .item { grid-template-columns: 1fr auto; }
  .item .folder-input { grid-column: 1 / -1; grid-row: 2; }
  .hero { padding-top: 40px; }
}
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  .meter-fill { transition: none; }
}
```

- [ ] **Step 6: Append the DOM wiring to `site/demo.js`**

Append to the end of `site/demo.js`:

```js

// ---- DOM wiring (runs only in a browser; Node imports the helpers above) -------------------

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "text") node.textContent = value;
    else if (key === "class") node.className = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  node.append(...children);
  return node;
}

function renderTree(container, groups) {
  container.replaceChildren();
  if (groups.length === 0) return;
  const rootList = el("ul", { class: "tree" });
  const linkSense = el("li", {}, el("span", { class: "folder", text: "Other bookmarks › Link Sense" }));
  const inner = el("ul");
  for (const group of groups) {
    const items = group.items.map((i) => el("li", { text: i.title }));
    if (group.folder === "") {
      inner.append(...items);
    } else {
      inner.append(el("li", {}, el("span", { class: "folder", text: group.folder }), el("ul", {}, ...items)));
    }
  }
  linkSense.append(inner);
  rootList.append(linkSense);
  container.append(rootList);
}

function initDemo() {
  const list = document.getElementById("demo-list");
  if (!list) return;
  const search = document.getElementById("demo-search");
  const applyButton = document.getElementById("demo-apply");
  const resetButton = document.getElementById("demo-reset");
  const result = document.getElementById("demo-result");
  const ranked = rank(SAMPLE);
  const choices = new Map();

  const choiceFor = (url) => choices.get(url) ?? { add: false, folder: "" };

  function refresh() {
    const n = countAdds(choices);
    applyButton.disabled = n === 0;
    applyButton.textContent = n > 0 ? `Apply (${n})` : "Apply";
  }

  function renderList() {
    list.replaceChildren();
    const shown = filterEntries(ranked, search.value);
    if (shown.length === 0) {
      list.append(el("li", { class: "empty", text: "No pages match" }));
      return;
    }
    for (const entry of shown) {
      const current = choiceFor(entry.url);
      const row = el("li", { class: current.add ? "item marked" : "item" });
      const folderInput = el("input", {
        class: "folder-input",
        type: "text",
        list: "demo-folders",
        placeholder: "Folder",
        maxlength: String(MAX_FOLDER_LENGTH),
        "aria-label": `Folder for ${entry.title}`,
        value: current.folder,
      });
      folderInput.addEventListener("change", () => {
        folderInput.value = normalizeFolder(folderInput.value);
        choices.set(entry.url, { ...choiceFor(entry.url), folder: folderInput.value });
      });
      const toggle = el("button", {
        class: "button ghost toggle",
        type: "button",
        "aria-pressed": String(current.add),
        text: current.add ? "Added" : "Add",
      });
      toggle.addEventListener("click", () => {
        const next = { ...choiceFor(entry.url), add: !choiceFor(entry.url).add };
        choices.set(entry.url, next);
        toggle.textContent = next.add ? "Added" : "Add";
        toggle.setAttribute("aria-pressed", String(next.add));
        row.className = next.add ? "item marked" : "item";
        refresh();
      });
      row.append(
        el(
          "div",
          { class: "info" },
          el("span", { class: "title", text: entry.title }),
          el("span", { class: "url", text: entry.url }),
          el("span", { class: "meta", text: `Score ${entry.score} · ${entry.visits} visits · ${entry.days} days ago` }),
        ),
        folderInput,
        toggle,
      );
      list.append(row);
    }
  }

  search.addEventListener("input", renderList);
  applyButton.addEventListener("click", () => {
    const items = ranked
      .filter((e) => choiceFor(e.url).add)
      .map((e) => ({ title: e.title, url: e.url, folder: normalizeFolder(choiceFor(e.url).folder) }));
    renderTree(result, buildFolderTree(items));
  });
  resetButton.addEventListener("click", () => {
    choices.clear();
    search.value = "";
    result.replaceChildren();
    renderList();
    refresh();
  });

  renderList();
  refresh();
}

function initDecay() {
  const slider = document.getElementById("decay-days");
  if (!slider) return;
  const out = document.getElementById("decay-score");
  const bar = document.getElementById("decay-bar");
  const label = document.getElementById("decay-label");
  const VISITS = 10;
  const update = () => {
    const days = Number(slider.value);
    const s = score(VISITS, days);
    out.textContent = s.toFixed(2);
    bar.style.width = `${(s / VISITS) * 100}%`;
    label.textContent = `${days} day${days === 1 ? "" : "s"} since last visit`;
  };
  slider.addEventListener("input", update);
  update();
}

function initCopy() {
  for (const button of document.querySelectorAll("[data-copy-target]")) {
    button.addEventListener("click", async () => {
      const target = document.getElementById(button.dataset.copyTarget);
      if (!target) return;
      const original = button.textContent;
      const ok = await copyText(target.textContent, navigator.clipboard);
      if (!ok) window.getSelection()?.selectAllChildren(target);
      button.textContent = ok ? "Copied" : "Press Ctrl+C";
      setTimeout(() => {
        button.textContent = original;
      }, 1500);
    });
  }
}

if (typeof document !== "undefined") {
  initDemo();
  initDecay();
  initCopy();
}
```

- [ ] **Step 7: Run to verify pass**

Run: `cd site && npm test`
Expected: PASS for `demo.test.mjs` (including the banned-words scan, which now also covers the appended wiring) and `site.test.mjs`.

- [ ] **Step 8: Check the wiring in a browser, if one is available**

Run: `which google-chrome chromium chromium-browser`
If one prints a path, run (replace `BROWSER`):
`python3 -m http.server -d site 8765 >/dev/null 2>&1 & SRV=$!; sleep 1; BROWSER --headless --disable-gpu --dump-dom http://localhost:8765/ | grep -c 'class="item'; kill $SRV` (all in one shell command)
Expected: a count of 15 (the demo list was built by `demo.js`). Then take screenshots at desktop and phone widths and look at both: `BROWSER --headless --disable-gpu --window-size=1280,2400 --screenshot=<scratchpad>/desktop.png http://localhost:8765/` and the same with `--window-size=390,3200` to `phone.png`; read the images and check that nothing overflows horizontally and the demo list and install commands are legible. Use the session scratchpad directory for the images, not the repo.
If no browser is installed, skip this step and say so in the report; the owner does the visual check after deployment.

- [ ] **Step 9: Commit**

```bash
git add site/index.html site/styles.css site/CNAME site/.nojekyll site/demo.js site/test/site.test.mjs
git commit -m "feat(site): add showcase page and live demo"
```

---

### Task 3: Deploy workflow

**Files:**
- Create: `.github/workflows/pages.yml`
- Test: `site/test/workflow.test.mjs`
- Modify: `docs/superpowers/specs/2026-10-14-showcase-site-design.md` (one clarification)

**Interfaces:**
- Consumes: the files from Tasks 1–2 and the `site/package.json` test script.
- Produces: a workflow that runs on pushes to `main` touching `site/**` or the workflow itself, and on manual dispatch.

- [ ] **Step 1: Write the failing test**

Create `site/test/workflow.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const yml = readFileSync(new URL("../../.github/workflows/pages.yml", import.meta.url), "utf8");

test("triggers on main pushes under site/ and manual dispatch", () => {
  assert.match(yml, /push:\s*\n\s+branches: \[main\]/);
  assert.match(yml, /- "site\/\*\*"/);
  assert.match(yml, /- "\.github\/workflows\/pages\.yml"/);
  assert.match(yml, /workflow_dispatch:/);
});

test("permissions are exactly the three Pages needs", () => {
  const block = yml.match(/\npermissions:\n((?:  .+\n)+)/);
  assert.ok(block, "top-level permissions block not found");
  const lines = block[1].trim().split("\n").map((l) => l.trim()).sort();
  assert.deepEqual(lines, ["contents: read", "id-token: write", "pages: write"]);
});

test("concurrency group is pages and does not cancel in-progress deploys", () => {
  assert.match(yml, /concurrency:\s*\n\s+group: pages\s*\n\s+cancel-in-progress: false/);
});

test("deploys through the github-pages environment", () => {
  assert.match(yml, /environment:\s*\n\s+name: github-pages/);
});

test("every action is pinned to an exact version tag", () => {
  const uses = [...yml.matchAll(/uses:\s*(\S+)/g)].map((m) => m[1]);
  assert.ok(uses.length >= 5);
  for (const u of uses) {
    assert.match(u, /^actions\/[a-z-]+@v\d+\.\d+\.\d+$/, `not pinned to an exact tag: ${u}`);
  }
});

test("site tests run before the artifact is uploaded, and upload happens before deploy", () => {
  const test_ = yml.indexOf("npm test");
  const upload = yml.indexOf("actions/upload-pages-artifact");
  const deploy = yml.indexOf("actions/deploy-pages");
  assert.ok(test_ > -1 && upload > -1 && deploy > -1);
  assert.ok(test_ < upload && upload < deploy);
});

test("only publishable files are staged into _site and uploaded", () => {
  assert.match(yml, /cp site\/index\.html site\/styles\.css site\/demo\.js site\/CNAME site\/\.nojekyll _site\//);
  assert.match(yml, /path: _site/);
  assert.equal(/path: site\s*$/m.test(yml), false);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd site && npm test`
Expected: FAIL in `workflow.test.mjs` (`ENOENT` for `pages.yml`).

- [ ] **Step 3: Create the workflow**

Create `.github/workflows/pages.yml`:

```yaml
name: Deploy site to GitHub Pages

on:
  push:
    branches: [main]
    paths:
      - "site/**"
      - ".github/workflows/pages.yml"
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4.2.2

      - uses: actions/setup-node@v4.4.0
        with:
          node-version: 22

      - name: Test the site
        working-directory: site
        run: npm test

      - name: Stage publishable files
        run: |
          mkdir _site
          cp site/index.html site/styles.css site/demo.js site/CNAME site/.nojekyll _site/

      - uses: actions/configure-pages@v5.0.0

      - uses: actions/upload-pages-artifact@v3.0.1
        with:
          path: _site

      - id: deployment
        uses: actions/deploy-pages@v4.0.5
```

- [ ] **Step 4: Run to verify pass**

Run: `cd site && npm test`
Expected: PASS (all three test files).

- [ ] **Step 5: Validate the YAML syntax, if PyYAML is available**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/pages.yml')); print('yaml ok')"`
Expected: `yaml ok`. If it fails with `ModuleNotFoundError: No module named 'yaml'`, skip this step and note it in the report; the string-level tests above are the check.

- [ ] **Step 6: Dry-run the staging command locally**

Run (with `<scratchpad>` the session scratchpad directory, not `/tmp` and not the repo): `rm -rf <scratchpad>/stage && mkdir <scratchpad>/stage && cp site/index.html site/styles.css site/demo.js site/CNAME site/.nojekyll <scratchpad>/stage/ && ls -A <scratchpad>/stage && rm -rf <scratchpad>/stage`
Expected: lists `.nojekyll CNAME demo.js index.html styles.css` and nothing else (every file the workflow copies exists).

- [ ] **Step 7: Amend the spec to match the staging decision**

In `docs/superpowers/specs/2026-10-14-showcase-site-design.md`, in the "Deployment workflow" section, replace the sentence `Job \`deploy\` with \`environment: github-pages\`: \`actions/checkout\`, \`actions/configure-pages\`, \`actions/upload-pages-artifact\` with \`path: site\`, then \`actions/deploy-pages\`.` with: `Job \`deploy\` with \`environment: github-pages\`: \`actions/checkout\`, \`actions/setup-node\`, a test step, a step that copies only \`index.html\`, \`styles.css\`, \`demo.js\`, \`CNAME\` and \`.nojekyll\` into \`_site/\` (so tests and \`package.json\` are not published), \`actions/configure-pages\`, \`actions/upload-pages-artifact\` with \`path: _site\`, then \`actions/deploy-pages\`.` Leave the following sentence about pinning and the test step as is, but delete the now-duplicated trailing paragraph that starts "A step before the upload runs".

- [ ] **Step 8: Commit**

```bash
git add .github/workflows/pages.yml site/test/workflow.test.mjs docs/superpowers/specs/2026-10-14-showcase-site-design.md
git commit -m "ci: deploy the showcase site to GitHub Pages"
```

---

### Task 4: README update

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: the facts from the earlier tasks (site URL, `site/` layout, workflow, one-time setup).

Read the current `README.md` first. Preserve the wording of every section not mentioned below. The edits restructure the top, move the existing extension content up, and add one section.

- [ ] **Step 1: Replace the opening and the "How it works" heading**

Replace the title paragraph and everything up to (but not including) the `## Scoring` heading with this exact text, keeping the numbered CLI steps that were under "How it works" unchanged where marked:

```markdown
# Link Sense

Analyzes your browser history, scores URLs by recency and visit frequency, and helps you turn the pages you really use into organized bookmarks.

**Website and live demo:** https://link-sense.codeforlife.dev

## Two ways to use it

### Chrome extension (recommended)

<MOVE the numbered steps, the "Apply updates ..." paragraph, the Snap/Flatpak sentence and the "Run the tests ..." line from the existing "## Chrome extension (Linux, Chrome/Chromium)" section here, unchanged, and delete the old section heading.>

### CLI report

<MOVE the four numbered steps from the existing "## How it works" section here, unchanged, and delete that heading.>
```

(The two `<MOVE ...>` lines are instructions: replace each with the content they name. No `<MOVE` text may remain in the file.)

- [ ] **Step 2: Keep the remaining sections in order**

After the two "ways to use it" subsections, the file must continue with these existing sections, unchanged and in this order: `## Scoring`, `## Install`, `## Usage`, `## Report features`. Then add the new section from Step 3, then the existing `## Data storage` last.

- [ ] **Step 3: Add the Website section**

Insert before `## Data storage`:

```markdown
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
```

- [ ] **Step 4: Verify the README**

Run: `grep -n '^#' README.md`
Expected, in order: `# Link Sense`, `## Two ways to use it`, `### Chrome extension (recommended)`, `### CLI report`, `## Scoring`, `## Install`, `## Usage`, `## Report features`, `## Website`, `## Data storage`.

Run: `grep -c 'MOVE' README.md`
Expected: `0`.

Run: `grep -c 'link-sense.codeforlife.dev' README.md`
Expected: at least `1`.

Run: `grep -n 'install-host\|Snap\|Retry sync\|apply.sh' README.md`
Expected: each of those four phrases still appears at least once (nothing was lost in the move).

- [ ] **Step 5: Run the full checks and commit**

Run: `pytest -q && (cd extension && npm test) && (cd site && npm test)`
Expected: all three suites pass.

```bash
git add README.md
git commit -m "docs: lead with the extension and document the showcase site"
```
