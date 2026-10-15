# Showcase Site Redesign ("Fading Ledger") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the showcase page so it opens on a live "fading ledger" (ranked pages that fade with age, plus a skip-ahead slider), replacing the stock cream/serif/teal/cards look, without losing any existing behaviour.

**Architecture:** `demo.js` gains small pure helpers (strength, textOpacity, formatAge, formatScore, `rank(entries, extraDays)`) that Node tests pin; its DOM wiring is rewritten around the new markup. `index.html` and `styles.css` are replaced wholesale. Tests are updated for the new ids and CSS, and a contrast test pins the accessibility claim from the colour tokens themselves.

**Tech Stack:** HTML, CSS, vanilla ES modules, Node built-in test runner, headless Chromium (already installed under `~/.cache/ms-playwright/`) for screenshots.

**Spec:** `docs/superpowers/specs/2026-10-15-site-redesign-design.md` (see "Spec corrections" below: three statements in it are corrected by this plan)

## Spec corrections (decided while writing this plan; Task 2 amends the spec to match)

1. **Skip-ahead does not re-rank.** Adding the same N days to every page multiplies every score by `e^(-0.1 N)`, so the order never changes (verified numerically for N = 0, 30, 90). Only scores, bars and fade change. The spec's "re-ranks and re-fades live" becomes "re-scores and re-fades live; the order stays the same because every page ages equally". Choices still persist across skips.
2. **Slider range is 0 to 60 days**, not 90: by 90 days every score is effectively 0.
3. **The fade applies to the row title only.** The URL text stays in the muted colour at full opacity, because muted text at 70% opacity falls below 4.5:1. The score bar still carries the same value. Two helper functions, `formatAge` and `formatScore`, are added to `demo.js` for the age and score columns.

## Global Constraints

- Tokens, light: `--paper #f6f7f9`, `--ink #171a22`, `--rule #d9dce3`, `--muted #5c6170`, `--marker #ffe566`, `--marker-ink #171a22`, `--marker-muted #3b4050`, `--strip #171a22`, `--strip-fg #f6f7f9`.
- Tokens, dark (`prefers-color-scheme: dark`): `--paper #15171d`, `--ink #eceef2`, `--rule #2b2f3a`, `--muted #a0a5b3`, `--marker #ffe566`, `--marker-ink #171a22`, `--marker-muted #3b4050`, `--strip #1f232d`, `--strip-fg #eceef2`.
- System fonts only; no `@font-face`, `@import` or `url(` in the CSS; no third-party scripts, fonts or images. The only external URLs in `index.html` stay: GitHub repo links, `https://buymeacoffee.com/zafrem`, and the badge image.
- Faded row title opacity is `0.7 + 0.3 * strength`, never below 0.7. Contrast is at least 4.5:1 for: ink, muted and 70%-ink text on paper (both themes), marker-ink and marker-muted on marker, strip-fg on strip.
- `strength(score) = clamp(log10(1 + score) / log10(1 + 120), 0, 1)`; the score bar width is `max(2, round(strength * 100))%`.
- Skip slider: `id="skip-days"`, range 0 to 60, step 1; label `id="skip-label"` reads `+N days` (`+1 day` for one).
- Ledger container keeps `id="demo"`; list `id="demo-list"`; search `demo-search`; `demo-apply`, `demo-reset`, `demo-result`, `demo-folders`. Row DOM order is `[info, folder input, Add toggle]`, with the title as the first child of `info`; the Add toggle's accessible name is the constant `Add <title>`.
- Nav order: Demo, How it works, Scoring, Install, GitHub, then the badge last (markup unchanged: `<a class="coffee" href="https://buymeacoffee.com/zafrem" rel="noopener"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=for-the-badge&amp;logo=buy-me-a-coffee&amp;logoColor=black" alt="Buy Me A Coffee" width="162" height="28"></a>`). `nav` keeps `align-items: center`; `.coffee` and `.coffee img` keep their rules; `@media (max-width: 700px)` keeps `html { scroll-padding-top: 136px; }` as its first rule.
- The three favicon `<link>` tags stay in the head in the same order. `site/CNAME`, `.nojekyll`, the workflow and the README are not touched.
- Wiring builds DOM with `createElement`/`textContent` only; `demo.js` contains none of `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval(`.
- Copy: H1 `Your history, ranked by what you still use.`; primary button `Install the extension`; secondary link `Read the code`. Sentence case; no ALL-CAPS labels, no arrows appended to links.
- Work on a feature branch. Commit messages carry no attribution trailer of any kind. Nothing is pushed or merged by this plan.

## Review Focus

1. **Faded or marked text below 4.5:1** in either theme (Task 2, contrast test over the real CSS tokens, plus screenshots).
2. **The old template look creeping back** — cream, serif, teal, ALL-CAPS label, numbered circles (Task 2, "old look is gone" test).
3. **Skip-ahead state bugs** — choices lost on skip, label not reset, entrance animation replaying (Task 2, wiring tests).
4. **Layout overflow** — horizontal scroll at 300px, the ledger row cramped on phones (Task 2, screenshots at 300 and 390).
5. **Reduced motion ignored** — the entrance animation and transitions must stop (Task 2, CSS test).

## File Structure

| File | Change |
|---|---|
| `site/demo.js` | New pure helpers and `rank(entries, extraDays)`; DOM wiring rewritten (no decay widget) |
| `site/index.html` | Replaced |
| `site/styles.css` | Replaced |
| `site/test/demo.test.mjs` | New helper tests |
| `site/test/wiring.test.mjs` | Stand-in DOM gains `style.setProperty`; new skip/intro tests |
| `site/test/site.test.mjs` | Updated ids, hero marker and CSS tests; new contrast and old-look tests |
| `docs/superpowers/specs/2026-10-15-site-redesign-design.md` | Three corrections |

---

### Task 1: Fade, age and score helpers, and `rank(entries, extraDays)`

**Files:**
- Modify: `site/demo.js`
- Test: `site/test/demo.test.mjs`

**Interfaces:**
- Produces (named exports of `site/demo.js`): `STRENGTH_CEILING = 120`; `strength(score: number) -> number` in [0,1]; `textOpacity(t: number) -> number` in [0.7,1]; `formatAge(days: number) -> string` (`"0.1d"`, `"45d"`); `formatScore(score: number) -> string` (one decimal at 10 and above, two decimals below); `rank(entries, extraDays = 0)` which returns copies with `days` replaced by `days + extraDays` and `score` recomputed, sorted by score descending (stable).

- [ ] **Step 1: Write the failing tests**

In `site/test/demo.test.mjs`, change the import block to include the new names:

```js
import {
  MAX_FOLDER_LENGTH,
  SAMPLE,
  buildFolderTree,
  copyText,
  countAdds,
  filterEntries,
  formatAge,
  formatScore,
  normalizeFolder,
  rank,
  score,
  strength,
  textOpacity,
} from "../demo.js";
```

Append to the end of the file:

```js

test("strength maps scores to 0..1 on a log scale, clamped", () => {
  assert.equal(strength(0), 0);
  assert.equal(strength(120), 1);
  assert.equal(strength(1_000_000), 1);
  assert.equal(strength(-5), 0);
  const samples = [0, 0.1, 1, 10, 50, 120].map(strength);
  for (let i = 1; i < samples.length; i += 1) assert.ok(samples[i] > samples[i - 1], `strength must increase at index ${i}`);
});

test("textOpacity stays between 0.7 and 1 so faded text remains readable", () => {
  assert.equal(textOpacity(0), 0.7);
  assert.equal(textOpacity(1), 1);
  assert.ok(Math.abs(textOpacity(0.5) - 0.85) < 1e-9);
  assert.equal(textOpacity(-3), 0.7);
  assert.equal(textOpacity(9), 1);
});

test("formatAge shows whole days plainly and fractions to one decimal", () => {
  assert.equal(formatAge(0.1), "0.1d");
  assert.equal(formatAge(1), "1d");
  assert.equal(formatAge(45), "45d");
  assert.equal(formatAge(0.1 + 3), "3.1d");
  assert.equal(formatAge(12.0000000001), "12d");
});

test("formatScore keeps two decimals for small scores and one for large", () => {
  assert.equal(formatScore(118.806), "118.8");
  assert.equal(formatScore(10), "10.0");
  assert.equal(formatScore(5.915), "5.92");
  assert.equal(formatScore(0.0061), "0.01");
  assert.equal(formatScore(0), "0.00");
});

test("rank with extraDays ages every entry equally: scores shrink, order and inputs stay put", () => {
  const input = [
    { title: "a", url: "https://a.example/", visits: 100, days: 0 },
    { title: "b", url: "https://b.example/", visits: 50, days: 5 },
  ];
  const aged = rank(input, 10);
  assert.deepEqual(aged.map((e) => e.title), ["a", "b"]);
  assert.equal(aged[0].days, 10);
  assert.equal(aged[0].score, score(100, 10));
  assert.equal(aged[1].days, 15);
  assert.equal(input[0].days, 0, "input is not mutated");
  assert.deepEqual(rank(input), rank(input, 0));
});

test("skipping ahead never reorders the sample list", () => {
  const order = (n) => rank(SAMPLE, n).map((e) => e.url);
  assert.deepEqual(order(30), order(0));
  assert.deepEqual(order(60), order(0));
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd site && npm test`
Expected: FAIL in `demo.test.mjs` — the file fails to load with a `SyntaxError` for the missing named exports (`strength`, `textOpacity`, `formatAge`, `formatScore`). The other test files still pass.

- [ ] **Step 3: Implement**

In `site/demo.js`, replace the existing `rank` function with:

```js
export function rank(entries, extraDays = 0) {
  return entries
    .map((e) => {
      const days = e.days + extraDays;
      return { ...e, days, score: score(e.visits, days) };
    })
    .sort((a, b) => b.score - a.score);
}
```

and add directly after the `score` function:

```js

export const STRENGTH_CEILING = 120; // the highest visit count in SAMPLE

// 0..1 measure of how strong a score is, on a log scale so a few hot pages do not flatten the rest.
export function strength(scoreValue) {
  const t = Math.log10(1 + Math.max(0, scoreValue)) / Math.log10(1 + STRENGTH_CEILING);
  return Math.min(1, Math.max(0, t));
}

// Row titles never drop below 0.7 opacity, which keeps them at 4.5:1 contrast or better.
export function textOpacity(t) {
  return 0.7 + 0.3 * Math.min(1, Math.max(0, t));
}

export function formatAge(days) {
  const rounded = Math.round(days * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}d` : `${rounded.toFixed(1)}d`;
}

export function formatScore(scoreValue) {
  return scoreValue >= 10 ? scoreValue.toFixed(1) : scoreValue.toFixed(2);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd site && npm test`
Expected: PASS (all tests, 0 failures). The existing wiring tests still pass because the wiring is not touched yet and calls `rank(SAMPLE)`.

- [ ] **Step 5: Commit**

```bash
git add site/demo.js site/test/demo.test.mjs
git commit -m "feat(site): add fade, age and score helpers and rank with extra days"
```

---

### Task 2: Rebuild the page, styles and wiring

**Files:**
- Replace: `site/index.html`, `site/styles.css`
- Modify: `site/demo.js` (replace the DOM wiring section), `site/test/wiring.test.mjs`, `site/test/site.test.mjs`
- Modify (docs): `docs/superpowers/specs/2026-10-15-site-redesign-design.md`

**Interfaces:**
- Consumes: every export from Task 1, plus the existing `SAMPLE`, `filterEntries`, `normalizeFolder`, `countAdds`, `buildFolderTree`, `copyText`, `MAX_FOLDER_LENGTH`, `score`.
- Produces: the markup, CSS tokens and wiring described in Global Constraints.

- [ ] **Step 1: Update the stand-in DOM and add wiring tests (RED part 1)**

In `site/test/wiring.test.mjs`, replace the `FakeNode` class constructor so each node gets its own style object:

```js
class FakeNode {
  constructor(tag) {
    Object.assign(this, { tagName: tag, children: [], attrs: {}, listeners: {}, _text: "", className: "", dataset: {}, disabled: false, value: "" });
    this.style = {
      props: {},
      setProperty(name, value) { this.props[name] = String(value); },
      getPropertyValue(name) { return this.props[name] ?? ""; },
    };
  }
```

(keep the rest of the class: `setAttribute`, `addEventListener`, `fire`, `append`, `replaceChildren`, `textContent` setter and getter, unchanged).

Replace the id list in the stand-in registry:

```js
for (const id of ["demo-list", "demo-search", "demo-apply", "demo-reset", "demo-result", "skip-days", "skip-label", "cmd-install"]) {
  ids[id] = new FakeNode("div");
}
ids["skip-days"].value = "0";
```

(and delete the old line `ids["decay-days"].value = "0";`).

Do NOT add a static `import ... from "../demo.js"` to this file: static imports run before the stand-in DOM exists, so the wiring would never start. Instead change the existing line `await import("../demo.js");` to take the helpers from the dynamic import:

```js
const { formatScore, score } = await import("../demo.js");
```

Insert this as the FIRST test after `const runTimers = ...` / `const resetDemo = ...` and the `await import("../demo.js");` line (so no other test has touched the list yet):

```js
test("the entrance animation flag is set on load and removed by the first interaction", async () => {
  assert.equal(ids["demo-list"].dataset.intro, "1");
  ids["demo-search"].value = "";
  await ids["demo-search"].fire("input");
  assert.equal(ids["demo-list"].dataset.intro, undefined);
});
```

Append these tests at the end of the file:

```js

const titles = () => ids["demo-list"].children.map((row) => row.children[0].children[0].textContent);
const scoreText = (row) => row.children[0].children[2].children[0].textContent;
const opacityOf = (row) => Number(row.style.getPropertyValue("--o"));

test("skipping ahead re-scores and fades every row but keeps the order", async () => {
  await resetDemo();
  const before = titles();
  const firstBefore = opacityOf(ids["demo-list"].children[0]);
  ids["skip-days"].value = "30";
  await ids["skip-days"].fire("input");
  assert.deepEqual(titles(), before, "every page ages equally, so the order cannot change");
  const first = ids["demo-list"].children[0];
  assert.equal(scoreText(first), formatScore(score(120, 30.1)));
  assert.ok(opacityOf(first) < firstBefore, "the top row fades as time passes");
  assert.ok(opacityOf(first) >= 0.7, "faded rows stay readable");
  assert.equal(ids["skip-label"].textContent, "+30 days");
});

test("the skip label is singular for one day", async () => {
  ids["skip-days"].value = "1";
  await ids["skip-days"].fire("input");
  assert.equal(ids["skip-label"].textContent, "+1 day");
});

test("marked rows and folders survive a skip, and Reset returns the slider to zero", async () => {
  await resetDemo();
  const [, folderInput, toggle] = ids["demo-list"].children[0].children;
  folderInput.value = "Daily";
  await folderInput.fire("change");
  await toggle.fire("click");
  ids["skip-days"].value = "10";
  await ids["skip-days"].fire("input");
  const row = ids["demo-list"].children[0];
  assert.match(row.className, /marked/);
  assert.equal(row.children[2].attrs["aria-pressed"], "true");
  assert.equal(row.children[1].value, "Daily");
  await resetDemo();
  assert.equal(ids["skip-days"].value, "0");
  assert.equal(ids["skip-label"].textContent, "+0 days");
  assert.equal(opacityOf(ids["demo-list"].children[0]) > 0.99, true, "after Reset the top row is back at full strength");
});

test("each row carries its entrance order and a strength bar", () => {
  const rows = ids["demo-list"].children;
  assert.equal(rows[0].style.getPropertyValue("--i"), "0");
  assert.equal(rows[3].style.getPropertyValue("--i"), "3");
  const bar = rows[0].children[0].children[3];
  assert.equal(bar.children[0].style.width, "100%");
  const last = rows[rows.length - 1].children[0].children[3];
  assert.ok(Number.parseInt(last.children[0].style.width, 10) >= 2);
});
```

- [ ] **Step 2: Update the static tests (RED part 2)**

In `site/test/site.test.mjs`:

a) In the test `all element ids the demo wiring needs are present`, replace `"decay-days", "decay-score", "decay-bar", "decay-label",` with `"skip-days", "skip-label",`.

b) Replace every occurrence of `'class="hero wrap"'` with `'<section class="hero">'` (it appears in the test `the hero links to the GitHub repository`).

c) Delete the whole test named `content sections keep their vertical padding and anchors clear the sticky header` and append this block at the end of the file:

```js

const cssText = () => readFileSync(path.join(siteDir, "styles.css"), "utf8");

function hexLuminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrast(a, b) {
  const [hi, lo] = [hexLuminance(a), hexLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
function blend(fg, bg, alpha) {
  const mix = (i) => Math.round(alpha * parseInt(fg.slice(i, i + 2), 16) + (1 - alpha) * parseInt(bg.slice(i, i + 2), 16));
  return `#${[1, 3, 5].map((i) => mix(i).toString(16).padStart(2, "0")).join("")}`;
}
function tokensIn(block) {
  return Object.fromEntries([...block.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2].toLowerCase()]));
}
const lightTokens = () => tokensIn(cssText().match(/:root\s*\{([^}]*)\}/)[1]);
const darkTokens = () => tokensIn(cssText().match(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([^}]*)\}/)[1]);

test("the colour tokens exist in both themes", () => {
  for (const tokens of [lightTokens(), darkTokens()]) {
    for (const name of ["paper", "ink", "rule", "muted", "marker", "marker-ink", "marker-muted", "strip", "strip-fg"]) {
      assert.ok(tokens[name], `missing token --${name}`);
    }
  }
  assert.equal(lightTokens().paper, "#f6f7f9");
  assert.equal(darkTokens().paper, "#15171d");
});

test("every text and surface pair meets 4.5:1 in both themes, including 70% faded titles", () => {
  for (const [theme, t] of [["light", lightTokens()], ["dark", darkTokens()]]) {
    const pairs = [
      ["ink on paper", t.ink, t.paper],
      ["muted on paper", t.muted, t.paper],
      ["faded title (ink at 70%) on paper", blend(t.ink, t.paper, 0.7), t.paper],
      ["marker-ink on marker", t["marker-ink"], t.marker],
      ["marker-muted on marker", t["marker-muted"], t.marker],
      ["strip-fg on strip", t["strip-fg"], t.strip],
    ];
    for (const [name, fg, bg] of pairs) {
      assert.ok(contrast(fg, bg) >= 4.5, `${theme}: ${name} is ${contrast(fg, bg).toFixed(2)}:1`);
    }
  }
});

test("the old template look is gone", () => {
  const css = cssText();
  assert.equal(/text-transform:\s*uppercase/i.test(css), false, "no ALL-CAPS labels");
  assert.equal(/ui-serif|Georgia|Times New Roman/i.test(css), false, "no serif display face");
  assert.equal(/#0f766e|#fbfaf7|#d9efec/i.test(css), false, "no teal or cream tokens");
  assert.equal(/counter\(step\)|counter-reset/i.test(css), false, "no numbered circles");
  assert.equal(/class="eyebrow"/.test(html), false, "no eyebrow label");
});

test("no web fonts or remote CSS resources", () => {
  const css = cssText();
  assert.equal(/@font-face|@import|url\(/i.test(css), false);
});

test("reduced motion switches off the entrance animation and transitions", () => {
  const css = cssText();
  const block = css.match(/@media \(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(block, "a prefers-reduced-motion block must exist");
  assert.match(block[1], /animation:\s*none/);
  assert.match(block[1], /transition:\s*none/);
});

test("the hero holds the headline, the ledger and the GitHub link", () => {
  const start = html.indexOf('<section class="hero">');
  const hero = html.slice(start, html.indexOf("</section>", start));
  assert.equal((hero.match(/<h1[\s>]/g) ?? []).length, 1);
  assert.ok(hero.includes('id="demo"'), "the ledger lives in the hero");
  assert.match(hero, /Your history, ranked by what you still use\./);
  assert.match(hero, /Install the extension/);
  assert.match(hero, /Read the code/);
});

test("the nav order is Demo, How it works, Scoring, Install, GitHub, then the badge", () => {
  const start = html.indexOf('<nav aria-label="Sections">');
  const nav = html.slice(start, html.indexOf("</nav>", start));
  const hrefs = [...nav.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(hrefs, ["#demo", "#how", "#scoring", "#install", "https://github.com/zafrem/Link-Sense", "https://buymeacoffee.com/zafrem"]);
});
```

- [ ] **Step 3: Run to verify failure**

Run: `cd site && npm test`
Expected: FAIL — `wiring.test.mjs` fails to start or fails its new tests (the wiring still looks for the old ids and structure) and `site.test.mjs` fails on the new tests (tokens, old look, reduced motion, hero, nav order, ids). Note which tests fail; every failure must be one of the new or updated tests, not a syntax error in the test files themselves.

- [ ] **Step 4: Write the page**

Replace `site/index.html` with:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Link Sense — bookmark what you actually use</title>
  <meta name="description" content="Link Sense scores your browser history by recency and frequency, then helps you turn the pages you really use into organized bookmarks.">
  <meta name="color-scheme" content="light dark">
  <link rel="icon" href="favicon.svg" type="image/svg+xml">
  <link rel="icon" href="favicon.ico" sizes="48x48">
  <link rel="apple-touch-icon" href="apple-touch-icon.png">
  <link rel="stylesheet" href="styles.css">
  <script type="module" src="demo.js"></script>
</head>
<body>
  <header class="top">
    <div class="bar">
      <a class="brand" href="#top">Link Sense</a>
      <nav aria-label="Sections">
        <a href="#demo">Demo</a>
        <a href="#how">How it works</a>
        <a href="#scoring">Scoring</a>
        <a href="#install">Install</a>
        <a href="https://github.com/zafrem/Link-Sense">GitHub</a>
        <a class="coffee" href="https://buymeacoffee.com/zafrem" rel="noopener"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=for-the-badge&amp;logo=buy-me-a-coffee&amp;logoColor=black" alt="Buy Me A Coffee" width="162" height="28"></a>
      </nav>
    </div>
  </header>

  <main id="top">
    <section class="hero">
      <div class="hero-copy">
        <h1>Your history, ranked by what you still use.</h1>
        <p class="lead">Link Sense scores every page in your browser history by how often and how recently you visit it, so the bookmarks you keep are the ones you actually open.</p>
        <p class="actions">
          <a class="button" href="#install">Install the extension</a>
          <a class="text-link" href="https://github.com/zafrem/Link-Sense">Read the code</a>
        </p>
      </div>

      <div id="demo" class="ledger">
        <noscript><p class="notice">Enable JavaScript to try the demo.</p></noscript>
        <div class="toolbar">
          <label class="sr-only" for="demo-search">Search sample pages</label>
          <input id="demo-search" type="search" placeholder="Search your history" autocomplete="off">
          <button id="demo-apply" class="button" type="button" disabled>Apply</button>
          <button id="demo-reset" class="text-button" type="button">Reset</button>
        </div>
        <datalist id="demo-folders">
          <option value="Docs"></option>
          <option value="Reading"></option>
          <option value="Tools"></option>
        </datalist>
        <ul id="demo-list" class="items" aria-label="Sample pages, highest score first"></ul>
        <div class="skip">
          <label for="skip-days">Skip ahead without visiting anything</label>
          <input id="skip-days" type="range" min="0" max="60" step="1" value="0">
          <output id="skip-label" for="skip-days">+0 days</output>
        </div>
        <div id="demo-result" class="result" role="region" aria-live="polite" aria-label="Resulting bookmarks"></div>
        <p class="fine">Sample data only. Nothing here reads your real history or leaves this page.</p>
      </div>
    </section>

    <section id="how" class="band">
      <h2>How it works</h2>
      <ol class="steps">
        <li><h3>Analyze</h3><p>Reads your local history, copies the database first so the original is never touched, and scores every URL.</p></li>
        <li><h3>Review</h3><p>Browse the ranked list, search it, pick a folder for each page, and mark what to add or remove.</p></li>
        <li><h3>Apply</h3><p>One click writes your choices to Link Sense's store and to real Chrome bookmarks.</p></li>
      </ol>
      <p class="note">Use it as a <strong>Chrome extension</strong> (recommended) or as a <strong>CLI</strong> that writes an HTML report and an <code>apply.sh</code> script.</p>
    </section>

    <section id="scoring" class="band">
      <h2>Scoring</h2>
      <pre class="formula"><code>score = visit_count × e^(−0.1 × days_since_last_visit)</code></pre>
      <p>Pages you visit often and recently rank highest. Pages you stop visiting fade on their own: use the slider above to skip ahead and watch every score shrink.</p>
    </section>

    <section id="install" class="band">
      <h2>Install</h2>
      <p class="muted">Chrome extension, Linux with Chrome or Chromium (native installs; Snap and Flatpak builds are not supported).</p>
      <ol class="install">
        <li>
          <p>Install the package from the repository root:</p>
          <div class="cmd"><pre><code id="cmd-install">pip install -e .</code></pre><button class="copy" type="button" data-copy-target="cmd-install">Copy</button></div>
        </li>
        <li>
          <p>Register the native-messaging host:</p>
          <div class="cmd"><pre><code id="cmd-host">link-sense install-host</code></pre><button class="copy" type="button" data-copy-target="cmd-host">Copy</button></div>
        </li>
        <li>
          <p>Open the extensions page, switch on <strong>Developer mode</strong>, choose <strong>Load unpacked</strong> and select the <code>extension/</code> folder:</p>
          <div class="cmd"><pre><code id="cmd-url">chrome://extensions</code></pre><button class="copy" type="button" data-copy-target="cmd-url">Copy</button></div>
        </li>
        <li><p>Click the Link Sense toolbar icon, pick pages, and press <strong>Apply</strong>. Bookmarks appear under <strong>Other bookmarks → Link Sense</strong>.</p></li>
      </ol>
      <p>Prefer the command line? <code>link-sense analyze</code> writes an interactive HTML report. See the <a href="https://github.com/zafrem/Link-Sense#readme">README</a> for details.</p>
    </section>

    <section id="privacy" class="band">
      <h2>Privacy</h2>
      <p>Your history stays on your computer. Link Sense copies the browser's history database to a temporary file before reading it, never modifies the original, and sends nothing over the network. This site has no analytics, cookies or third-party scripts. The one outside request it makes is the Buy Me A Coffee badge in the header, an image served by img.shields.io.</p>
    </section>
  </main>

  <footer class="foot">
    <p><a href="https://github.com/zafrem/Link-Sense">Link Sense on GitHub</a> and link-sense.codeforlife.dev</p>
  </footer>
</body>
</html>
```

- [ ] **Step 5: Write the styles**

Replace `site/styles.css` with:

```css
:root {
  --paper: #f6f7f9;
  --ink: #171a22;
  --rule: #d9dce3;
  --muted: #5c6170;
  --marker: #ffe566;
  --marker-ink: #171a22;
  --marker-muted: #3b4050;
  --strip: #171a22;
  --strip-fg: #f6f7f9;
  --sans: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
@media (prefers-color-scheme: dark) {
  :root {
    --paper: #15171d;
    --ink: #eceef2;
    --rule: #2b2f3a;
    --muted: #a0a5b3;
    --marker: #ffe566;
    --marker-ink: #171a22;
    --marker-muted: #3b4050;
    --strip: #1f232d;
    --strip-fg: #eceef2;
  }
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; scroll-padding-top: 88px; }
body { margin: 0; background: var(--paper); color: var(--ink); font: 16px/1.6 var(--sans); }
a { color: var(--ink); text-underline-offset: 3px; }
h1, h2, h3 { margin: 0; }
h2 { font-size: 1.5rem; font-weight: 700; letter-spacing: -.01em; margin-bottom: 16px; }
h3 { font-size: 1.05rem; font-weight: 700; margin-bottom: 6px; }
p { max-width: 68ch; }
code, pre { font-family: var(--mono); font-size: .92em; }
.muted { color: var(--muted); }
:focus-visible { outline: 3px solid var(--ink); outline-offset: 2px; }

.bar, .hero, .band, .foot { width: 100%; max-width: 1120px; margin-inline: auto; }

.top { position: sticky; top: 0; z-index: 5; background: color-mix(in srgb, var(--paper) 92%, transparent); backdrop-filter: blur(8px); border-bottom: 1px solid var(--rule); }
.bar { display: flex; align-items: center; justify-content: space-between; gap: 8px 24px; padding: 10px 16px; flex-wrap: wrap; }
.brand { font-weight: 800; font-size: 1.1rem; letter-spacing: -.02em; text-decoration: none; }
nav { display: flex; align-items: center; gap: 4px 20px; flex-wrap: wrap; font-size: .95rem; }
nav a { text-decoration: none; color: var(--muted); }
nav a:hover { color: var(--ink); text-decoration: underline; }
.coffee { display: inline-flex; align-items: center; }
.coffee img { display: block; height: 28px; width: auto; }

.hero { display: grid; grid-template-columns: minmax(0, 1fr); gap: 40px; padding: 56px 16px 48px; }
.hero-copy h1 { font-size: clamp(2.4rem, 6vw, 4.2rem); font-weight: 800; letter-spacing: -.035em; line-height: 1.02; }
.lead { margin: 20px 0 0; font-size: 1.15rem; color: var(--muted); }
.actions { display: flex; align-items: center; gap: 12px 20px; flex-wrap: wrap; margin: 28px 0 0; }

.button { display: inline-block; padding: 10px 18px; border-radius: 6px; border: 1px solid var(--ink); background: var(--ink); color: var(--paper); font: 600 .95rem var(--sans); text-decoration: none; cursor: pointer; }
.button:disabled { opacity: .4; cursor: default; }
.text-link, .text-button { background: none; border: 0; padding: 10px 4px; color: var(--ink); font: 600 .95rem var(--sans); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }

.ledger { border: 1px solid var(--rule); border-radius: 10px; padding: 14px 0 0; min-width: 0; }
.toolbar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; padding: 0 14px 12px; }
.toolbar input[type="search"] { flex: 1 1 180px; min-width: 0; padding: 9px 12px; border: 1px solid var(--rule); border-radius: 6px; background: var(--paper); color: var(--ink); font: inherit; }
.items { list-style: none; margin: 0; padding: 0; max-height: 460px; overflow-y: auto; }
.item { display: grid; grid-template-columns: minmax(0, 1fr) 120px auto; gap: 8px 12px; align-items: center; padding: 10px 14px; border-top: 1px solid var(--rule); transition: background-color .2s; }
.item.marked { background: var(--marker); color: var(--marker-ink); }
.info { display: grid; grid-template-columns: minmax(0, 1fr) auto; column-gap: 12px; row-gap: 2px; min-width: 0; }
.title { grid-column: 1; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: var(--o, 1); transition: opacity .25s; }
.url { grid-column: 1; font-size: .8rem; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.figures { grid-column: 2; grid-row: 1 / span 2; display: flex; flex-direction: column; align-items: flex-end; font-variant-numeric: tabular-nums; }
.score { font-weight: 700; }
.age { font-size: .8rem; color: var(--muted); }
.bar-track { grid-column: 1 / -1; height: 3px; margin-top: 6px; border-radius: 3px; background: var(--rule); overflow: hidden; }
.bar-fill { display: block; height: 100%; border-radius: inherit; background: var(--ink); transition: width .25s; }
.item.marked .title { opacity: 1; }
.item.marked .url, .item.marked .age { color: var(--marker-muted); }
.item.marked .bar-track { background: rgba(23, 26, 34, .18); }
.item.marked .bar-fill { background: var(--marker-ink); }
.item input { width: 100%; padding: 7px 9px; border: 1px solid var(--rule); border-radius: 6px; background: var(--paper); color: var(--ink); font: inherit; font-size: .9rem; }
.item.marked input { background: #ffffff; color: var(--marker-ink); border-color: var(--marker-muted); }
.toggle { min-width: 72px; padding: 7px 12px; border: 1px solid var(--ink); border-radius: 6px; background: transparent; color: var(--ink); font: 600 .9rem var(--sans); cursor: pointer; }
.item.marked .toggle { color: var(--marker-ink); border-color: var(--marker-ink); }
.empty { padding: 20px 14px; color: var(--muted); border-top: 1px solid var(--rule); }
.skip { display: grid; grid-template-columns: 1fr auto; gap: 4px 12px; align-items: center; padding: 14px; border-top: 1px solid var(--rule); }
.skip label { grid-column: 1 / -1; font-weight: 600; font-size: .95rem; }
.skip input[type="range"] { width: 100%; accent-color: var(--ink); }
.skip output { font-variant-numeric: tabular-nums; font-weight: 700; min-width: 6.5ch; text-align: right; }
.result { padding: 0 14px; }
.result:not(:empty) { padding-bottom: 8px; border-top: 1px solid var(--rule); padding-top: 12px; }
.result ul { list-style: none; margin: 0; padding-left: 20px; }
.result .tree { padding: 0; }
.result li { padding: 2px 0; }
.result .folder { font-weight: 700; }
.fine { margin: 0; padding: 12px 14px; font-size: .82rem; color: var(--muted); border-top: 1px solid var(--rule); }
.notice { margin: 0 14px 12px; padding: 10px 12px; border: 1px dashed var(--rule); border-radius: 6px; }

.band { padding: 56px 16px; border-top: 1px solid var(--rule); }
.steps { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 24px; }
.steps li { border-top: 2px solid var(--ink); padding-top: 12px; }
.steps p { margin: 0; color: var(--muted); }
.note { color: var(--muted); margin: 24px 0 0; }
.formula { margin: 0 0 16px; padding: 0; overflow-x: auto; }
.formula code { font-size: clamp(1.05rem, 2.6vw, 1.7rem); font-weight: 600; }
.install { padding-left: 20px; margin: 16px 0; }
.install li { margin-bottom: 16px; }
.install p { margin: 0 0 8px; }
.cmd { display: flex; gap: 8px; align-items: stretch; background: var(--strip); color: var(--strip-fg); border-radius: 6px; max-width: 640px; }
.cmd pre { flex: 1; margin: 0; padding: 10px 14px; overflow-x: auto; }
.copy { margin: 6px; padding: 4px 12px; border: 1px solid var(--strip-fg); border-radius: 6px; background: transparent; color: var(--strip-fg); font: 600 .85rem var(--sans); cursor: pointer; }
.cmd :focus-visible { outline-color: var(--strip-fg); }
.foot { padding: 24px 16px 56px; color: var(--muted); border-top: 1px solid var(--rule); }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

[data-intro] .item .title { animation: settle .9s ease both; animation-delay: calc(var(--i, 0) * 45ms); }
@keyframes settle { from { opacity: 1; } to { opacity: var(--o, 1); } }

@media (min-width: 900px) {
  .hero { grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); gap: 56px; align-items: start; }
}
@media (max-width: 700px) {
  html { scroll-padding-top: 136px; }
  .hero { padding-top: 32px; }
  .steps { grid-template-columns: minmax(0, 1fr); }
  .item { grid-template-columns: minmax(0, 1fr) auto; }
  .item .folder-input { grid-column: 1 / -1; grid-row: 2; }
  .band { padding-top: 40px; padding-bottom: 40px; }
}
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  * { animation: none !important; transition: none !important; }
}
```

Note: the `prefers-reduced-motion` block must be the last block in the file, and its text must contain both `animation: none` and `transition: none` (the test reads them).

- [ ] **Step 6: Rewrite the DOM wiring in `demo.js`**

In `site/demo.js`, delete everything from the line `// ---- DOM wiring (runs only in a browser; Node imports the helpers above) ---...` to the end of the file, and append:

```js
// ---- DOM wiring (runs only in a browser; Node imports the helpers above) -------------------

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "text") node.textContent = value;
    else if (key === "class") node.className = value;
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
  const slider = document.getElementById("skip-days");
  const skipLabel = document.getElementById("skip-label");
  const choices = new Map();
  let skip = 0;
  list.dataset.intro = "1"; // the entrance animation plays once, until the first interaction

  const choiceFor = (url) => choices.get(url) ?? { add: false, folder: "" };
  const current = () => rank(SAMPLE, skip);
  const endIntro = () => { delete list.dataset.intro; };

  function updateSkipLabel() {
    skipLabel.textContent = `+${skip} ${skip === 1 ? "day" : "days"}`;
  }

  function refresh() {
    const n = countAdds(choices);
    applyButton.disabled = n === 0;
    applyButton.textContent = n > 0 ? `Apply (${n})` : "Apply";
  }

  function renderList() {
    list.replaceChildren();
    const shown = filterEntries(current(), search.value);
    if (shown.length === 0) {
      list.append(el("li", { class: "empty", text: "No pages match" }));
      return;
    }
    shown.forEach((entry, index) => {
      const t = strength(entry.score);
      const chosen = choiceFor(entry.url);
      const row = el("li", { class: chosen.add ? "item marked" : "item" });
      row.style.setProperty("--i", String(index));
      row.style.setProperty("--o", String(textOpacity(t)));

      const fill = el("span", { class: "bar-fill" });
      fill.style.width = `${Math.max(2, Math.round(t * 100))}%`;
      const info = el(
        "div",
        { class: "info" },
        el("span", { class: "title", text: entry.title }),
        el("span", { class: "url", text: entry.url }),
        el(
          "span",
          { class: "figures" },
          el("span", { class: "score", text: formatScore(entry.score) }),
          el("span", { class: "age", text: formatAge(entry.days) }),
        ),
        el("span", { class: "bar-track" }, fill),
      );

      const folderInput = el("input", {
        class: "folder-input",
        type: "text",
        list: "demo-folders",
        placeholder: "Folder",
        maxlength: String(MAX_FOLDER_LENGTH),
        "aria-label": `Folder for ${entry.title}`,
        value: chosen.folder,
      });
      folderInput.addEventListener("change", () => {
        folderInput.value = normalizeFolder(folderInput.value);
        choices.set(entry.url, { ...choiceFor(entry.url), folder: folderInput.value });
      });

      const toggle = el("button", {
        class: "toggle",
        type: "button",
        "aria-pressed": String(chosen.add),
        "aria-label": `Add ${entry.title}`,
        text: chosen.add ? "Added" : "Add",
      });
      toggle.addEventListener("click", () => {
        endIntro();
        const next = { ...choiceFor(entry.url), add: !choiceFor(entry.url).add };
        choices.set(entry.url, next);
        toggle.textContent = next.add ? "Added" : "Add";
        toggle.setAttribute("aria-pressed", String(next.add));
        row.className = next.add ? "item marked" : "item";
        refresh();
      });

      row.append(info, folderInput, toggle);
      list.append(row);
    });
  }

  search.addEventListener("input", () => {
    endIntro();
    renderList();
  });
  slider.addEventListener("input", () => {
    skip = Number(slider.value);
    endIntro();
    updateSkipLabel();
    renderList();
  });
  applyButton.addEventListener("click", () => {
    const items = current()
      .filter((e) => choiceFor(e.url).add)
      .map((e) => ({ title: e.title, url: e.url, folder: normalizeFolder(choiceFor(e.url).folder) }));
    renderTree(result, buildFolderTree(items));
  });
  resetButton.addEventListener("click", () => {
    choices.clear();
    search.value = "";
    skip = 0;
    slider.value = "0";
    updateSkipLabel();
    result.replaceChildren();
    endIntro();
    renderList();
    refresh();
  });

  updateSkipLabel();
  renderList();
  refresh();
}

function initCopy() {
  for (const button of document.querySelectorAll("[data-copy-target]")) {
    const label = button.textContent;
    let timer;
    button.addEventListener("click", async () => {
      const target = document.getElementById(button.dataset.copyTarget);
      if (!target) return;
      const ok = await copyText(target.textContent, navigator.clipboard);
      if (!ok) window.getSelection()?.selectAllChildren(target);
      button.textContent = ok ? "Copied" : "Press Ctrl+C";
      clearTimeout(timer);
      timer = setTimeout(() => {
        button.textContent = label;
      }, 1500);
    });
  }
}

if (typeof document !== "undefined") {
  initDemo();
  initCopy();
}
```

- [ ] **Step 7: Run to verify pass**

Run: `cd site && npm test`
Expected: PASS (all tests, 0 failures). If a test fails, decide whether the code or the test is wrong; do not weaken a test to make it pass.

Run: `pytest -q && (cd extension && npm test)`
Expected: both pass (nothing outside `site/` changed).

- [ ] **Step 8: Look at it (required)**

Serve over http (ES modules do not load from `file://`) and screenshot with the headless Chromium. Use the session scratchpad for the images, never the repo. In one shell command:

```bash
SP=<scratchpad>; CH=$HOME/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell
python3 -m http.server -d site 8766 >/dev/null 2>&1 & SRV=$!; sleep 1
for w in 1280 390 300; do $CH --no-sandbox --hide-scrollbars --virtual-time-budget=4000 --window-size=$w,2600 --screenshot=$SP/redesign-light-$w.png http://localhost:8766/; done
for w in 1280 390; do $CH --no-sandbox --hide-scrollbars --virtual-time-budget=4000 --blink-settings=preferredColorScheme=1 --window-size=$w,2600 --screenshot=$SP/redesign-dark-$w.png http://localhost:8766/; done
kill $SRV
```

Read each image with the Read tool. Check and report on: the ledger visible in the first screen on desktop; faded titles still readable; the score bars shrink down the list; the header with the badge at 390px and 300px; no horizontal overflow at 300px; the Install strip legible in both themes; no leftover look of the old design. If the dark flag does not switch the theme (the dark screenshot looks light), say so rather than claiming dark was checked. Fix real visual problems in `styles.css` (keeping every test passing) and re-run Step 7 and this step. If you changed anything, list what and why in the report.

- [ ] **Step 9: Correct the spec**

In `docs/superpowers/specs/2026-10-15-site-redesign-design.md`:

- Replace the sentence in "The ledger (hero)" that begins `**Skip ahead.**` through its end with: `**Skip ahead.** A range slider (\`id="skip-days"\`, 0 to 60, step 1) with a text label (\`id="skip-label"\`, "+N days") adds N to every entry's age. The list re-scores and re-fades live: displayed age is \`days + N\`, score is \`score(visits, days + N)\`. Because every page ages by the same number of days, every score is multiplied by the same factor and the order never changes; only the scores, bars and fade do. Choices (Add toggles, folders) persist across skips because they are keyed by URL.`
- In the **Fade** bullet, replace `Row text uses that opacity (never below 0.7, which keeps text at 4.5:1 or better)` with `Row titles use that opacity (never below 0.7, which keeps them at 4.5:1 or better); URLs stay in the muted colour at full opacity`.
- In the Tests section, replace `moving the skip slider re-ranks rows and lowers a row's opacity variable` with `moving the skip slider keeps the row order, re-scores rows and lowers a row's opacity variable`.

- [ ] **Step 10: Commit**

```bash
git add site/index.html site/styles.css site/demo.js site/test/wiring.test.mjs site/test/site.test.mjs docs/superpowers/specs/2026-10-15-site-redesign-design.md
git commit -m "feat(site): redesign the page around a fading ledger"
```
