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

const COFFEE_HREF = "https://buymeacoffee.com/zafrem";
const COFFEE_SENTENCE = `If Link Sense saves you time, you can <a href="${COFFEE_HREF}" rel="noopener">buy me a coffee</a>.`;

test("external links go only to the repository and the coffee link, and nothing loads from another site", () => {
  const external = [...html.matchAll(/\b(?:href|src)="(https?:[^"]+)"/g)].map((m) => m[1]);
  for (const url of external) {
    const allowed = url.startsWith("https://github.com/zafrem/Link-Sense") || url === COFFEE_HREF;
    assert.ok(allowed, `unexpected external reference: ${url}`);
  }
  assert.ok(external.includes(COFFEE_HREF), "the coffee link must be present");
  assert.equal(/\ssrc="(?:https?:)?\/\//.test(html), false, "no resource may load from another site");
  assert.equal(/<img[^>]+src="https?:/.test(html), false, "no remote images");
});

test("no third-party scripts, fonts or inline handlers", () => {
  assert.equal(/<script[^>]+src="https?:/.test(html), false);
  assert.equal(/fonts\.(googleapis|gstatic)/.test(html), false);
  assert.equal(/\son[a-z]+="/.test(html), false);
});

test("all element ids the demo wiring needs are present", () => {
  for (const id of [
    "demo", "demo-search", "demo-list", "demo-folders", "demo-apply", "demo-reset", "demo-result",
    "skip-days", "skip-label",
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

test("the hero links to the GitHub repository", () => {
  const hero = html.slice(html.indexOf('<section class="hero">'), html.indexOf("</section>", html.indexOf('<section class="hero">')));
  assert.match(hero, /href="https:\/\/github\.com\/zafrem\/Link-Sense"/);
});

test("the README tells the owner to set the custom domain in Pages settings", () => {
  const readme = readFileSync(path.join(siteDir, "..", "README.md"), "utf8");
  assert.match(readme, /Custom domain/);
  assert.match(readme, /link-sense\.codeforlife\.dev/);
});

test("the head links the SVG icon, the ICO fallback and the touch icon, in that order", () => {
  const head = html.slice(html.indexOf("<head>"), html.indexOf("</head>"));
  const svg = head.indexOf('<link rel="icon" href="favicon.svg" type="image/svg+xml">');
  const ico = head.indexOf('<link rel="icon" href="favicon.ico" sizes="48x48">');
  const touch = head.indexOf('<link rel="apple-touch-icon" href="apple-touch-icon.png">');
  assert.ok(svg > -1 && ico > -1 && touch > -1, "all three icon links must be present");
  assert.ok(svg < ico && ico < touch, "SVG first so supporting browsers prefer it");
});

test("the coffee link is plain text in the footer, after the Privacy section, and not in the header", () => {
  const navStart = html.indexOf('<nav aria-label="Sections">');
  const nav = html.slice(navStart, html.indexOf("</nav>", navStart));
  assert.equal(nav.includes("buymeacoffee"), false, "the header nav must not carry the coffee link");
  assert.equal(/<img/.test(nav), false, "no image in the header");
  const footStart = html.indexOf('<footer class="foot">');
  const footer = html.slice(footStart, html.indexOf("</footer>", footStart));
  assert.ok(footer.includes(COFFEE_SENTENCE), "footer must hold the exact sentence and link");
  assert.equal(/<img/.test(footer), false, "plain text, not a badge");
  assert.ok(footStart > html.indexOf('id="privacy"'), "the footer comes after the Privacy section");
});

test("the Privacy section says nothing loads from other sites", () => {
  const start = html.indexOf('id="privacy"');
  const section = html.slice(start, html.indexOf("</section>", start));
  assert.match(section, /no analytics, cookies or third-party scripts/);
  assert.match(section, /loads nothing from other sites/);
  assert.equal(/shields/i.test(html), false, "no trace of the badge host remains");
});

test("no badge styles remain, and the footer link is styled like the other footer text", () => {
  const css = cssText();
  assert.equal(/\.coffee/.test(css), false);
  assert.match(css, /\.foot a\s*\{[^}]*color:\s*var\(--muted\)/);
});

test("narrow screens raise the anchor clearance to cover the taller, wrapped header", () => {
  const css = readFileSync(path.join(siteDir, "styles.css"), "utf8");
  const match = css.match(/@media \(max-width:\s*700px\)\s*\{[^@]*?html\s*\{[^}]*scroll-padding-top:\s*(\d+)px/);
  assert.ok(match, "a max-width: 700px rule must set scroll-padding-top");
  assert.ok(Number(match[1]) >= 136, "phone header measured 126px; clearance must exceed it");
});

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
  assert.equal(/@font-face|@import|url\(/i.test(cssText()), false);
});

test("reduced motion switches off the entrance animation and transitions", () => {
  const block = cssText().match(/@media \(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}/);
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

test("the nav order is Demo, How it works, Scoring, Install, GitHub", () => {
  const start = html.indexOf('<nav aria-label="Sections">');
  const nav = html.slice(start, html.indexOf("</nav>", start));
  const hrefs = [...nav.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(hrefs, ["#demo", "#how", "#scoring", "#install", "https://github.com/zafrem/Link-Sense"]);
});

test("the focus ring stays visible on marked rows in both themes", () => {
  assert.match(cssText(), /\.item\.marked :focus-visible\s*\{[^}]*outline-color:\s*var\(--marker-ink\)/);
  const t = darkTokens();
  assert.ok(contrast(t["marker-ink"], t.marker) >= 3, "marker-ink ring on the marker needs at least 3:1 non-text contrast");
});
