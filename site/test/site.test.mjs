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
