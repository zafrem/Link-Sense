import test from "node:test";
import assert from "node:assert/strict";
import { planSync, ROOT_TITLE } from "../bookmark-tree.js";

const bm = (id, url, title = url) => ({ id, title, url });
const folder = (id, title, children = []) => ({ id, title, children });
const root = (children) => ({ id: "r", title: ROOT_TITLE, children });

test("ROOT_TITLE", () => assert.equal(ROOT_TITLE, "Link Sense"));

test("creates bookmarks when the root does not exist yet", () => {
  const ops = planSync({
    root: null,
    adds: [
      { url: "https://a.example/", title: "A", folder: "Work" },
      { url: "https://b.example/", title: "B", folder: "" },
    ],
    removes: [],
  });
  assert.deepEqual(ops, [
    { type: "create", folder: "Work", title: "A", url: "https://a.example/" },
    { type: "create", folder: "", title: "B", url: "https://b.example/" },
  ]);
});

test("falls back to the url when the title is empty", () => {
  const [op] = planSync({ root: null, adds: [{ url: "https://a.example/", title: "", folder: "" }], removes: [] });
  assert.equal(op.title, "https://a.example/");
});

test("skips a url that already exists in the same folder", () => {
  const tree = root([folder("f1", "Work", [bm("b1", "https://a.example/")])]);
  const ops = planSync({ root: tree, adds: [{ url: "https://a.example/", title: "A", folder: "Work" }], removes: [] });
  assert.deepEqual(ops, []);
});

test("creates the same url in a different folder", () => {
  const tree = root([folder("f1", "Work", [bm("b1", "https://a.example/")])]);
  const ops = planSync({ root: tree, adds: [{ url: "https://a.example/", title: "A", folder: "Home" }], removes: [] });
  assert.equal(ops.length, 1);
  assert.equal(ops[0].folder, "Home");
});

test("dedupes repeated adds of the same url and folder", () => {
  const add = { url: "https://a.example/", title: "A", folder: "" };
  assert.equal(planSync({ root: null, adds: [add, add], removes: [] }).length, 1);
});

test("removes every bookmark with the url, in any folder, inside the tree", () => {
  const tree = root([
    bm("b0", "https://a.example/"),
    folder("f1", "Work", [bm("b1", "https://a.example/"), bm("b2", "https://keep.example/")]),
  ]);
  const ops = planSync({ root: tree, adds: [], removes: ["https://a.example/"] });
  assert.deepEqual(ops, [
    { type: "remove", id: "b0", url: "https://a.example/" },
    { type: "remove", id: "b1", url: "https://a.example/" },
  ]);
});

test("removing a url that is not in the tree is a no-op", () => {
  assert.deepEqual(planSync({ root: root([]), adds: [], removes: ["https://x.example/"] }), []);
  assert.deepEqual(planSync({ root: null, adds: [], removes: ["https://x.example/"] }), []);
});

test("an add of a url that is also being removed from that folder is recreated", () => {
  const tree = root([bm("b0", "https://a.example/")]);
  const ops = planSync({
    root: tree,
    adds: [{ url: "https://a.example/", title: "A", folder: "" }],
    removes: ["https://a.example/"],
  });
  assert.deepEqual(ops.map((o) => o.type), ["remove", "create"]);
});

test("ignores nested folders deeper than one level", () => {
  const tree = root([folder("f1", "Work", [folder("f2", "Deep", [bm("b1", "https://a.example/")])])]);
  const ops = planSync({ root: tree, adds: [{ url: "https://a.example/", title: "A", folder: "Work" }], removes: [] });
  assert.equal(ops.length, 1);
});
