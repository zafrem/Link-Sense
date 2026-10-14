# Link Sense Favicon — Design

Date: 2026-10-14
Status: Draft for review

## Goal

Give the showcase site (`https://link-sense.codeforlife.dev`) a favicon, so browser tabs, bookmarks and home-screen shortcuts show a Link Sense mark instead of a blank page icon.

**Success criteria**
- Modern browsers show an SVG icon that matches the site's light or dark theme.
- Browsers and platforms that ignore SVG icons fall back to an ICO or a PNG.
- The deployed site serves all three icon files; the deploy workflow does not leave any of them out.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Mark | A rounded square in the site's teal with a white bookmark ribbon |
| Theming | The SVG follows `prefers-color-scheme` (light and dark variants) |
| Fallbacks | `favicon.ico` (16, 32, 48) and `apple-touch-icon.png` (180×180), generated once with Pillow from the same geometry and committed |
| Build step | None. The generated files are committed; nothing new runs in CI |

## Non-goals

- Icons for the Chrome extension (it has none today; it can reuse this mark later).
- A web app manifest, maskable icons or social-share images.
- Animated or per-section icons.

## Files (all under `site/`)

| File | Purpose |
|---|---|
| `favicon.svg` | Primary icon, 64×64 `viewBox`, theme-aware via an internal `@media (prefers-color-scheme: dark)` rule |
| `favicon.ico` | Fallback containing 16×16, 32×32 and 48×48 images |
| `apple-touch-icon.png` | 180×180 fallback for iOS home screens |
| `index.html` | Three `<link>` tags in `<head>` |
| `../.github/workflows/pages.yml` | The staging `cp` line also copies the three icon files |
| `../scripts/make-favicons.py` | Pillow script that draws `favicon.ico` and `apple-touch-icon.png` from the shared geometry; run by hand, not by CI |

## Mark geometry

- Canvas 64×64. Background: rounded square covering the full canvas with a corner radius of 14.
- Ribbon: a bookmark shape centred horizontally, 24 wide and 36 tall, top edge at y=12, with a triangular notch at the bottom (the two bottom corners at y=48, the notch apex at y=40).
- Light colours: background `#0f766e`, ribbon `#ffffff`. Dark colours (SVG only): background `#5fd0c4`, ribbon `#06201d`. These are the site's `--accent` / `--accent-fg` tokens in each theme.
- The ICO and PNG use the light colours (they cannot switch themes). The PNG is an opaque full-bleed square with no rounded corners, because iOS applies its own rounding and paints transparent corners black; the ICO keeps the rounded corners with a transparent background.

## Head links

```html
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="icon" href="favicon.ico" sizes="48x48">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
```

The SVG is listed first so browsers that support it prefer it; the ICO is the fallback.

## Deployment

The workflow stages only named files into `_site/`. Its `cp` line gains `site/favicon.svg site/favicon.ico site/apple-touch-icon.png`. A deploy test already asserts the exact `cp` line, so that test is updated in the same change.

## Error handling and edge cases

- Browsers that request `/favicon.ico` by convention find the real file instead of a 404.
- The SVG contains no scripts, external references or fonts, so it is safe to serve as-is and renders identically offline.
- The generator script exits with a clear message if Pillow is not installed; the committed images mean nobody needs it unless the mark changes.

## Testing

Tests are written first and run with the site's existing `cd site && npm test`.

- `index.html` contains the three `<link>` tags above and each referenced file exists.
- `favicon.svg` is well-formed XML with a `viewBox="0 0 64 64"`, contains both colour variants, and has no `<script>`, `href` or `url(` to an external resource.
- `apple-touch-icon.png` has the PNG signature and a 180×180 size read from its header.
- `favicon.ico` has a valid ICONDIR header with exactly three images of sizes 16, 32 and 48.
- The workflow test's `cp` assertion lists the eight staged files, including the three icons.
- Manual: open the deployed site in a light and a dark browser theme and check the tab icon and a bookmark of the page.

## Open risks

- Some browsers cache favicons aggressively, so the new icon can take a while to appear for returning visitors.
- The ICO and PNG are raster approximations of the SVG; a very small size may look slightly different from it.
