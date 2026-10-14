import test from "node:test";
import assert from "node:assert/strict";
import { buildApplyPayload, entryFolder, filterEntries, groupByFolder } from "../ui-model.js";

const e = (url, score, extra = {}) => ({ url, title: url, score, ...extra });

test("entryFolder prefers the user's choice, then the stored folder, then unfiled", () => {
  assert.equal(entryFolder(e("a", 1, { folder: "Old" }), { a: { folder: "New" } }), "New");
  assert.equal(entryFolder(e("a", 1, { folder: "Old" }), {}), "Old");
  assert.equal(entryFolder(e("a", 1), {}), "");
});

test("a saved entry keeps its folder when the pending choice has an empty folder", () => {
  const saved = e("s", 2, { folder: "Work" });
  const choices = { s: { action: "remove", folder: "" } };
  assert.equal(entryFolder(saved, choices), "Work");
  const groups = groupByFolder([saved], choices);
  assert.deepEqual(groups.map((g) => g.folder), ["Work"]);
});

test("filterEntries matches title or url case-insensitively", () => {
  const items = [e("https://Foo.example/", 1, { title: "Hello" }), e("https://bar.example/", 1, { title: "World" })];
  assert.equal(filterEntries(items, "foo").length, 1);
  assert.equal(filterEntries(items, "WORLD").length, 1);
  assert.equal(filterEntries(items, "  ").length, 2);
  assert.equal(filterEntries(items, "zzz").length, 0);
});

test("groupByFolder sorts folders alphabetically with unfiled last and items by score", () => {
  const items = [e("a", 1), e("b", 9, { folder: "Zed" }), e("c", 5, { folder: "Alpha" }), e("d", 7, { folder: "Zed" })];
  const groups = groupByFolder(items, {});
  assert.deepEqual(groups.map((g) => g.folder), ["Alpha", "Zed", ""]);
  assert.deepEqual(groups[1].items.map((i) => i.url), ["b", "d"]);
});

test("buildApplyPayload only includes explicit choices", () => {
  const candidates = [e("a", 3, { title: "A" }), e("b", 2), e("c", 1)];
  const saved = [e("s1", 0), e("s2", 0)];
  const choices = {
    a: { action: "add", folder: "Work" },
    b: { action: null, folder: "Work" },
    s1: { action: "remove", folder: "" },
    c: { action: "remove", folder: "" }, // a candidate cannot be removed: it is not in the store
  };
  assert.deepEqual(buildApplyPayload(candidates, saved, choices), {
    adds: [{ url: "a", title: "A", score: 3, folder: "Work" }],
    removes: ["s1"],
  });
});

test("buildApplyPayload with no choices is empty", () => {
  assert.deepEqual(buildApplyPayload([e("a", 1)], [e("s", 0)], {}), { adds: [], removes: [] });
});
