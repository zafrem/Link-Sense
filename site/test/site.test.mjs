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

test("content sections keep their vertical padding and anchors clear the sticky header", () => {
  const css = readFileSync(path.join(siteDir, "styles.css"), "utf8");
  assert.match(css, /section\.wrap\s*\{[^}]*padding:\s*48px 16px/);
  assert.match(css, /scroll-padding-top:\s*\d+px/);
});

test("the hero links to the GitHub repository", () => {
  const hero = html.slice(html.indexOf('class="hero wrap"'), html.indexOf("</section>", html.indexOf('class="hero wrap"')));
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
