# Buy Me A Coffee Badge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the owner's Buy Me A Coffee badge as the last item of the showcase site's header nav, and keep the page's privacy statement and tests honest about the one third-party image it introduces.

**Architecture:** One markup addition in `site/index.html`, two small CSS rules, one reworded Privacy sentence, and updated static tests. No new files, no JavaScript.

**Tech Stack:** HTML, CSS, Node built-in test runner.

**Spec:** `docs/superpowers/specs/2026-10-15-coffee-badge-design.md`

## Global Constraints

- The badge link is exactly:
  `<a class="coffee" href="https://buymeacoffee.com/zafrem" rel="noopener"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=for-the-badge&amp;logo=buy-me-a-coffee&amp;logoColor=black" alt="Buy Me A Coffee" height="28"></a>`
- It is the last item inside `<nav aria-label="Sections">`, after the GitHub link.
- The only external URLs allowed in `index.html` are: URLs starting with `https://github.com/zafrem/Link-Sense`, `https://buymeacoffee.com/zafrem`, and the badge image URL above. Nothing else.
- No third-party scripts, fonts or inline handlers (existing test, unchanged).
- The Privacy section's last sentence becomes: `This site has no analytics, cookies or third-party scripts. The one outside request it makes is the Buy Me A Coffee badge in the header, an image served by img.shields.io.`
- CSS: `.coffee { display: inline-flex; align-items: center; }`, `.coffee img { display: block; height: 28px; width: auto; }`, and `nav` gets `align-items: center`. No new media query and no dark-theme variant.
- The README is not changed.
- Work on a feature branch. Nothing is pushed or merged to `main` by this plan; the owner decides, because a push redeploys the live site.

## Review Focus

1. **Badge URL mis-escaped** — a bare `&` or a changed query string breaks the image or the HTML (the exact-string test in Step 1).
2. **Allow-list too loose or vacuous** — the external-link test must fail on any other host and must also require the badge URLs to be present (Step 1).
3. **Privacy statement inaccurate** — the page must name `img.shields.io` as the outside request (Step 1).
4. **Header layout** — the 28px badge must not sit off-centre or blow up the header at phone width; the CSS rules are pinned by a test, the rendered result needs a human look after deploy (Step 1 CSS test; report in Step 6).
5. **Image blocked** — with shields.io unreachable or blocked, the `alt` text must keep the link usable (covered by the exact-string test including `alt`).

## File Structure

| File | Change |
|---|---|
| `site/index.html` | Badge link in the nav; reworded Privacy sentence |
| `site/styles.css` | `.coffee` rules; `align-items: center` on `nav` |
| `site/test/site.test.mjs` | New badge, privacy and CSS tests; external-link test replaced |
| `docs/superpowers/specs/2026-10-14-showcase-site-design.md` | One-line exception noted |
| `docs/superpowers/specs/2026-10-15-coffee-badge-design.md` | One clarification (`nav` alignment) |

---

### Task 1: Add the badge, privacy wording and tests

**Files:**
- Modify: `site/index.html`, `site/styles.css`, `site/test/site.test.mjs`
- Modify (docs): the two spec files above

- [ ] **Step 1: Write the failing tests**

In `site/test/site.test.mjs`, replace the whole test named `external links go only to the project repository` with:

```js
const BADGE_HREF = "https://buymeacoffee.com/zafrem";
const BADGE_SRC =
  "https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=for-the-badge&amp;logo=buy-me-a-coffee&amp;logoColor=black";
const BADGE_LINK =
  `<a class="coffee" href="${BADGE_HREF}" rel="noopener"><img src="${BADGE_SRC}" alt="Buy Me A Coffee" height="28"></a>`;

test("external links go only to the repository, the coffee link and the badge image", () => {
  const external = [...html.matchAll(/\b(?:href|src)="(https?:[^"]+)"/g)].map((m) => m[1]);
  for (const url of external) {
    const allowed = url.startsWith("https://github.com/zafrem/Link-Sense") || url === BADGE_HREF || url === BADGE_SRC;
    assert.ok(allowed, `unexpected external reference: ${url}`);
  }
  assert.ok(external.includes(BADGE_HREF), "the coffee link must be present");
  assert.ok(external.includes(BADGE_SRC), "the badge image must be present");
});
```

Append to the end of the file:

```js

test("the header nav ends with the exact Buy Me A Coffee badge link", () => {
  const start = html.indexOf('<nav aria-label="Sections">');
  const nav = html.slice(start, html.indexOf("</nav>", start));
  assert.ok(nav.includes(BADGE_LINK), "badge link markup must match exactly (URL, &amp; escaping, alt, height, rel)");
  const anchors = nav.split("<a ").slice(1);
  assert.ok(anchors.at(-1).startsWith('class="coffee"'), "the badge must be the last item in the nav");
  assert.ok(anchors.length >= 2, "the other nav links must still be there");
});

test("the Privacy section discloses the one outside request", () => {
  const start = html.indexOf('id="privacy"');
  const section = html.slice(start, html.indexOf("</section>", start));
  assert.match(section, /no analytics, cookies or third-party scripts/);
  assert.match(section, /img\.shields\.io/);
});

test("the badge is styled to sit centred in the header without a baseline gap", () => {
  const css = readFileSync(path.join(siteDir, "styles.css"), "utf8");
  assert.match(css, /\.coffee\s*\{[^}]*display:\s*inline-flex[^}]*align-items:\s*center/);
  assert.match(css, /\.coffee img\s*\{[^}]*display:\s*block[^}]*height:\s*28px/);
  assert.match(css, /\nnav\s*\{[^}]*align-items:\s*center/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd site && npm test`
Expected: FAIL — exactly four failures: `external links go only to the repository, the coffee link and the badge image`, `the header nav ends with the exact Buy Me A Coffee badge link`, `the Privacy section discloses the one outside request`, and `the badge is styled to sit centred...`. All other tests pass.

- [ ] **Step 3: Add the badge to the nav**

In `site/index.html`, directly after the line

```html
        <a href="https://github.com/zafrem/Link-Sense">GitHub</a>
```

(the one inside `<nav aria-label="Sections">`, not the hero or footer links) insert:

```html
        <a class="coffee" href="https://buymeacoffee.com/zafrem" rel="noopener"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=for-the-badge&amp;logo=buy-me-a-coffee&amp;logoColor=black" alt="Buy Me A Coffee" height="28"></a>
```

- [ ] **Step 4: Reword the Privacy sentence**

In `site/index.html`, in the Privacy section, replace `This site has no analytics, cookies or third-party scripts.</p>` with `This site has no analytics, cookies or third-party scripts. The one outside request it makes is the Buy Me A Coffee badge in the header, an image served by img.shields.io.</p>`.

- [ ] **Step 5: Add the CSS**

In `site/styles.css`, change the line

```css
nav { display: flex; gap: 16px; flex-wrap: wrap; font-size: .95rem; }
```

to

```css
nav { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; font-size: .95rem; }
```

and add directly after the `nav a:hover { color: var(--accent); }` line:

```css
.coffee { display: inline-flex; align-items: center; }
.coffee img { display: block; height: 28px; width: auto; }
```

- [ ] **Step 6: Run to verify pass, then all suites**

Run: `cd site && npm test`
Expected: PASS (all tests, 0 failures). The existing `every local href/src points at a file that exists` and `no third-party scripts, fonts or inline handlers` tests still pass.

Run: `pytest -q && (cd extension && npm test) && (cd site && npm test)`
Expected: all three suites pass.

No browser is installed on this machine, so the header layout (badge centred, nothing overflowing at phone width) cannot be viewed here. Say so in the report; the owner checks it after deploy.

- [ ] **Step 7: Update the two spec files**

In `docs/superpowers/specs/2026-10-14-showcase-site-design.md`, replace the line `- Analytics, cookies or any third-party scripts or fonts.` with:
`- Analytics, cookies or any third-party scripts or fonts. One exception: the Buy Me A Coffee badge image, loaded from img.shields.io (see \`2026-10-15-coffee-badge-design.md\`).`

In `docs/superpowers/specs/2026-10-15-coffee-badge-design.md`, in "Styling", replace the first bullet with:
`- \`.coffee { display: inline-flex; align-items: center; }\`, \`.coffee img { display: block; height: 28px; width: auto; }\`, and \`align-items: center\` added to the existing \`nav\` rule, so the badge sits vertically centred with the text links and leaves no stray baseline gap.`

- [ ] **Step 8: Commit**

```bash
git add site/index.html site/styles.css site/test/site.test.mjs docs/superpowers/specs/2026-10-14-showcase-site-design.md docs/superpowers/specs/2026-10-15-coffee-badge-design.md
git commit -m "feat(site): add the Buy Me A Coffee badge to the header"
```
