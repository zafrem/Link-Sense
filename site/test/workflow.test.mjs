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
  assert.match(
    yml,
    /cp site\/index\.html site\/styles\.css site\/demo\.js site\/CNAME site\/\.nojekyll site\/favicon\.svg site\/favicon\.ico site\/apple-touch-icon\.png _site\//,
  );
  assert.match(yml, /path: _site/);
  assert.equal(/path: site\s*$/m.test(yml), false);
});
