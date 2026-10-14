# Buy Me A Coffee Badge on the Showcase Site — Design

Date: 2026-10-15
Status: Draft for review

## Goal

Add the owner's Buy Me A Coffee badge to the header bar of the showcase site (`https://link-sense.codeforlife.dev`), so visitors who like the project can support it.

**Success criteria**
- The header bar shows the badge as its last item, linking to `https://buymeacoffee.com/zafrem`.
- The page stays honest about the one third-party request the badge introduces.
- The existing tests still guard against any other third-party reference.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Image source | The shields.io URL exactly as supplied by the owner; no self-hosted copy |
| Placement | Last item in the header `<nav>`, after the GitHub link |
| Privacy wording | The Privacy section names `img.shields.io` as the host of the badge image |

## Non-goals

- Self-hosting or restyling the badge.
- Any other donation, sponsor or analytics element.
- Changing the README (the badge belongs to the site only).

## The badge

Markup, inside the header `<nav aria-label="Sections">`, after the GitHub link:

```html
<a class="coffee" href="https://buymeacoffee.com/zafrem" rel="noopener"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=for-the-badge&amp;logo=buy-me-a-coffee&amp;logoColor=black" alt="Buy Me A Coffee" height="28"></a>
```

- The image URL is the owner's, with `&` written as `&amp;` in the HTML attribute.
- `alt="Buy Me A Coffee"` and a fixed `height="28"` (the badge's native height) so the header does not jump while the image loads.
- The link opens in the same tab. It has `rel="noopener"` as a precaution.

## Styling (`site/styles.css`)

- `.coffee { display: inline-flex; align-items: center; }` and `.coffee img { display: block; height: 28px; width: auto; }` so the badge sits vertically centred with the text links and leaves no stray baseline gap.
- The header already wraps (`flex-wrap`), so on narrow screens the badge wraps with the other links; no new media query.
- The badge keeps its own yellow colours in both light and dark themes; the dark theme needs no variant.

## Privacy wording

The Privacy section's last sentence changes from

> This site has no analytics, cookies or third-party scripts.

to

> This site has no analytics, cookies or third-party scripts. The one outside request it makes is the Buy Me A Coffee badge in the header, an image served by img.shields.io.

## Tests (`site/test/site.test.mjs`)

Written first; run with `cd site && npm test`.

- The header `<nav>` contains the exact badge link and image shown above (target URL, image URL, `alt`, `height`), and the badge is the last item in the nav.
- The existing test "external links go only to the project repository" is replaced by one that allows exactly these external URLs and nothing else: URLs that start with `https://github.com/zafrem/Link-Sense`, plus `https://buymeacoffee.com/zafrem` and the badge image URL.
- The existing test "no third-party scripts, fonts or inline handlers" is unchanged and still passes (an `<img>` is not a script).
- The Privacy section contains the text `img.shields.io`.

## Spec housekeeping

In `docs/superpowers/specs/2026-10-14-showcase-site-design.md`, the non-goal "Analytics, cookies or any third-party scripts or fonts." gains the sentence: "One exception: the Buy Me A Coffee badge image, loaded from img.shields.io (see `2026-10-15-coffee-badge-design.md`)." The plan's matching global constraint is not edited (the plan is a finished historical document).

## Delivery

Work on a feature branch, run all three suites (`pytest`, `cd extension && npm test`, `cd site && npm test`), and merge and push to `main` only on the owner's instruction, because a push redeploys the live site.

## Error handling and edge cases

- If shields.io is unreachable or blocked, the browser shows the `alt` text "Buy Me A Coffee" inside the link, which still works.
- Visitors using tracker blockers may not see the image; the link text from `alt` remains.
- The badge adds roughly 28px of height to the header bar; the sticky header still clears anchor targets because the existing `scroll-padding-top: 88px` is larger than the header.

## Open risks

- Loading the badge sends each visitor's IP address and browser details to img.shields.io. The Privacy wording discloses this.
- The badge image is controlled by shields.io; if its URL scheme changes, the image breaks while the link keeps working.
