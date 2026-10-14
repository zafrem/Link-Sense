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
