# Showcase Site Redesign ("Fading Ledger") — Design

Date: 2026-10-15
Status: Draft for review

## Goal

Replace the current look of `https://link-sense.codeforlife.dev`, which the owner called "not modern" (and which is the stock template: cream background, serif headings, teal accent, identical rounded cards, numbered circles), with a distinct design that opens on the product itself.

**Success criteria**
- Within the first screen a visitor sees a live ranked list of pages in which older pages are visibly fainter, and can move time forward to watch the list fade and re-rank.
- The page no longer uses the old look: no cream background, serif headings, teal accent, all-caps eyebrow label, numbered circles or row of identical rounded cards.
- Everything the site already guarantees keeps working: the demo, the install steps with copy buttons, the privacy statement with the badge disclosure, light and dark themes, phone layout, accessibility floor, no third-party fonts or scripts.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Direction | "Fading ledger": the hero is the live ranked list; age is shown by fading |
| Scope | `site/index.html`, `site/styles.css`, the DOM wiring and one new pure helper in `site/demo.js`, and the site tests. Badge, favicon, workflow, README and the Chrome extension are unchanged |
| Fonts | System fonts only (the no-third-party-fonts rule stays) |
| Delivery | Feature branch; merge and push only on the owner's instruction (a push redeploys the live site) |

This spec supersedes only the visual design and page structure in `2026-10-14-showcase-site-design.md`. Its functional requirements (demo behaviours, install steps, copy-button fallback, `<noscript>` notice, CNAME, deploy) and `2026-10-15-coffee-badge-design.md` still apply unless a section below changes them.

## Non-goals

- Web fonts, images (other than the existing badge and favicon files), icon fonts, gradients as decoration, or a framework.
- Restyling the Chrome extension's own UI.
- Screenshots or GIFs of the product.

## Design tokens

Light theme:

| Token | Value | Use |
|---|---|---|
| `--paper` | `#f6f7f9` | Page background |
| `--ink` | `#171a22` | Text, primary buttons, focus ring |
| `--rule` | `#d9dce3` | Hairline borders and dividers |
| `--muted` | `#5c6170` | Secondary text (at least 4.5:1 on `--paper`) |
| `--marker` | `#ffe566` | Highlighter fill for rows marked Add |

Dark theme (`prefers-color-scheme: dark`): `--paper #15171d`, `--ink #eceef2`, `--rule #2b2f3a`, `--muted #a0a5b3`, `--marker #ffe566` (marked rows always use dark ink text `#171a22` on the marker, in both themes).

Type (system stack, no downloads):
- One family, `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`, for everything except command blocks.
- Headline: weight 800, letter-spacing `-0.035em`, `clamp(2.4rem, 6vw, 4.2rem)`, line-height 1.02.
- Section headings: weight 700, 1.5rem. Body: 16px / 1.6, line length at most 70 characters.
- Scores and ages use `font-variant-numeric: tabular-nums` so columns align.
- Monospace (`ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`) only inside `<code>`/`<pre>`.

Shape: controls and the install strip use `border-radius: 6px`; the ledger container uses `10px`. No shadows, no gradients.

## Layout

Left-aligned throughout. Page width `max-width: 1120px`, 16px side gutters.

```
Header (sticky): Link Sense            Demo  How it works  Scoring  Install  GitHub  [coffee badge]
Hero, two columns from 900px, stacked below:
  left  (5/12): h1 "Your history, ranked by what you still use."
                one sentence · [Install the extension]  Read the code
  right (7/12): LEDGER (id="demo")
                search ........................... [Apply (N)] [Reset]
                title / url ........ 0.1d  118.8  ████████████
                ...
                Skip ahead [──●────────]  +0 days
                result tree (after Apply)
How it works: three ruled columns of plain text
Scoring: the formula set large, one sentence
Install: command strip with copy buttons, plain steps
Privacy, footer
```

Nav order: `Demo` (`#demo`), `How it works` (`#how`), `Scoring` (`#scoring`), `Install` (`#install`), `GitHub`, then the badge last (unchanged markup, see the badge spec).

## The ledger (hero)

- Rows are the sample entries, ranked by score. Each row shows title, URL (text), age (`0.1d`), score and a score bar, plus the existing folder input and Add toggle.
- **Fade.** A pure helper `strength(score)` returns `t` in `[0, 1]`: `clamp(log10(1 + score) / log10(1 + 120), 0, 1)` (120 is the highest sample visit count). `textOpacity(t)` returns `0.7 + 0.3 * t`. Row titles use that opacity (never below 0.7, which keeps them at 4.5:1 or better); URLs stay in the muted colour at full opacity; the score bar's length is `max(2, round(t * 100))%`, so decay is also shown by the bar and does not rely on opacity alone. Score numbers are always full ink.
- **Skip ahead.** A range slider (`id="skip-days"`, 0 to 60, step 1) with a text label (`id="skip-label"`, "+N days") adds N to every entry's age. The list re-scores and re-fades live: displayed age is `days + N`, score is `score(visits, days + N)`. Because every page ages by the same number of days, every score is multiplied by the same factor and the order never changes; only the scores, bars and fade do. Choices (Add toggles, folders) persist across skips because they are keyed by URL. The slider sits above the list so it is on the first screen.
- **Marked rows** get the marker fill and full-opacity dark ink text.
- **Folder box on marked rows only.** A row's folder input is hidden until the row is marked Add, which keeps rows compact (about 77px) so the whole decay is visible; the input stays in the DOM and keeps its value.
- **Heights.** From 900px the list shows all rows (no inner scroll) and the hero copy column is `position: sticky` so it stays in view beside the long ledger; below 900px the list is capped at 520px and scrolls inside the ledger.
- **Apply** and **Reset** behave as today (result tree "Other bookmarks › Link Sense"; Reset clears choices, search, result, and sets the slider to 0). Apply stays disabled with nothing marked; an empty search shows "No pages match".
- **No JavaScript:** the ledger container shows a `<noscript>` notice ("Enable JavaScript to try the demo.") and the rest of the page remains readable.

## Motion

One orchestrated moment: on first load the rows start at full ink and settle to their faded opacity one after another (about 45ms between rows, 0.9s each), so the decay plays once. It does not replay on search, Add, or slider input; those use a short opacity transition instead. Under `prefers-reduced-motion: reduce` there is no entrance animation and no transition.

## Sections

- **How it works:** three columns separated by a 1px top rule, each a bold word (Analyze, Review, Apply) and one sentence (existing copy). Order carries the sequence; there are no numbers, circles or cards. Stacks on phones.
- **Scoring:** the formula `score = visit_count × e^(−0.1 × days_since_last_visit)` in a large `<code>` block and one sentence pointing at the Skip-ahead slider above. The old standalone decay widget is removed.
- **Install:** the existing four steps with the same three commands and copy buttons, shown in a strip with the ink colour as background and paper-coloured text (a slightly lighter surface in dark mode). Copy-button behaviour and fallback are unchanged.
- **Privacy:** the current text including the img.shields.io disclosure.
- **Footer:** the repository link and the domain.

## Copy

- H1: "Your history, ranked by what you still use."
- Hero sentence: "Link Sense scores every page in your browser history by how often and how recently you visit it, so the bookmarks you keep are the ones you actually open."
- Primary button: "Install the extension" (links to `#install`). Secondary link: "Read the code" (links to `https://github.com/zafrem/Link-Sense`, satisfying the hero GitHub-link requirement).
- Sentence case everywhere; no ALL-CAPS labels, no middle-dot meta strings, no arrows appended to links.

## Accessibility and robustness floor

- Text contrast at least 4.5:1 in both themes, including faded rows and text on the marker.
- Visible keyboard focus: a 3px ink outline with 2px offset (paper-coloured in dark mode) on every interactive element.
- Slider and search have visible or screen-reader labels; each Add toggle keeps its stable accessible name `Add <title>`; the result region stays `aria-live="polite"`.
- No horizontal scroll at 300px; the header's phone behaviour and the `scroll-padding-top: 136px` clearance from the badge spec still hold.
- Untrusted-markup rule unchanged: the wiring builds DOM with `createElement`/`textContent` only.

## Tests

Written first, run with `cd site && npm test`.

- `demo.test.mjs` adds: `strength(0) = 0`, `strength(120) = 1`, strictly increasing between, clamped above 120 and below 0; `textOpacity(0) = 0.7`, `textOpacity(1) = 1`; `rank(entries, extraDays)` re-scores with `days + extraDays`, re-sorts, and `rank(entries)` equals `rank(entries, 0)`.
- `wiring.test.mjs` (its stand-in DOM gains `style.setProperty`) adds: moving the skip slider keeps the row order, re-scores rows and lowers a row's opacity variable; choices survive a skip; Reset puts the slider back to 0; the entrance animation flag is removed after the first interaction. Existing wiring tests keep passing.
- `site.test.mjs`: the id test requires `skip-days` and `skip-label` instead of `decay-*`; a test asserts the hero contains `h1`, the ledger (`id="demo"`) and a GitHub link; the old CSS test for `section.wrap` padding is replaced by tests that the tokens exist, the dark theme overrides them, the page declares no web fonts, and a `prefers-reduced-motion` block disables the animation. The badge, nav, privacy, favicon, noscript, allow-list and phone-clearance tests are kept.
- **Visual check (required):** serve `site/` over http (modules do not load from `file://`) and screenshot with the headless Chromium in `~/.cache/ms-playwright/` at 1280px and 390px, in light and dark; read the images and confirm no overflow, legible faded rows, the marker fill, and the header with the badge. Report anything that looks wrong; do not claim visual quality without these images.

## Risks

- System fonts differ by operating system, so the exact look varies; the layout does not depend on a specific font's metrics.
- The score bar and opacity encode the same value; if a future change makes them disagree the fade becomes misleading, which the `strength` tests guard.
