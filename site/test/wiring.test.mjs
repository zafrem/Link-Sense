import test from "node:test";
import assert from "node:assert/strict";

// A tiny DOM stand-in, just enough to run the wiring in demo.js under Node.
class FakeNode {
  constructor(tag) {
    Object.assign(this, { tagName: tag, children: [], attrs: {}, listeners: {}, _text: "", className: "", style: {}, dataset: {}, disabled: false, value: "" });
  }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === "value") this.value = String(v); }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  async fire(type) { for (const fn of this.listeners[type] ?? []) await fn({}); }
  append(...kids) { for (const k of kids) this.children.push(typeof k === "string" ? Object.assign(new FakeNode("#text"), { _text: k }) : k); }
  replaceChildren(...kids) { this.children = []; this.append(...kids); }
  set textContent(v) { this.children = []; this._text = String(v); }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(""); }
}

const ids = {};
for (const id of ["demo-list", "demo-search", "demo-apply", "demo-reset", "demo-result", "decay-days", "decay-score", "decay-bar", "decay-label", "cmd-install"]) {
  ids[id] = new FakeNode("div");
}
ids["decay-days"].value = "0";
ids["cmd-install"].textContent = "pip install -e .";
const copyButton = new FakeNode("button");
copyButton.dataset.copyTarget = "cmd-install";
copyButton.textContent = "Copy";

let selected = null;
let nextTimer = 1;
const timers = new Map();
globalThis.document = {
  getElementById: (id) => ids[id] ?? null,
  createElement: (tag) => new FakeNode(tag),
  querySelectorAll: () => [copyButton],
};
globalThis.window = { getSelection: () => ({ selectAllChildren: (node) => { selected = node; } }) };
Object.defineProperty(globalThis, "navigator", {
  value: { clipboard: { writeText: () => Promise.reject(new Error("denied")) } },
  configurable: true,
});
globalThis.setTimeout = (fn) => { const id = nextTimer++; timers.set(id, fn); return id; };
globalThis.clearTimeout = (id) => { timers.delete(id); };
const resetDemo = () => ids["demo-reset"].fire("click");
const runTimers = () => { for (const [id, fn] of [...timers]) { timers.delete(id); fn(); } };

await import("../demo.js");

test("the copy button returns to its original label after repeated clicks", async () => {
  await copyButton.fire("click");
  await copyButton.fire("click"); // double click before the first reset fires
  runTimers();
  assert.equal(copyButton.textContent, "Copy");
});

test("a failed copy selects the command so it can be copied by hand", async () => {
  selected = null;
  await copyButton.fire("click");
  assert.equal(selected, ids["cmd-install"]);
  runTimers();
});

test("every Add toggle has a stable, page-specific accessible name", async () => {
  await resetDemo();
  const rows = ids["demo-list"].children;
  assert.equal(rows.length, 15);
  for (const row of rows) {
    const title = row.children[0].children[0].textContent;
    const toggle = row.children[2];
    assert.equal(toggle.attrs["aria-label"], `Add ${title}`);
  }
  const toggle = rows[0].children[2];
  await toggle.fire("click");
  assert.equal(toggle.attrs["aria-pressed"], "true");
  assert.equal(toggle.attrs["aria-label"], `Add ${rows[0].children[0].children[0].textContent}`);
});

test("an empty search shows 'No pages match' and Apply starts disabled", async () => {
  await resetDemo();
  assert.equal(ids["demo-apply"].disabled, true);
  ids["demo-search"].value = "zzz-no-such-page";
  await ids["demo-search"].fire("input");
  assert.equal(ids["demo-list"].children.length, 1);
  assert.equal(ids["demo-list"].children[0].textContent, "No pages match");
  ids["demo-search"].value = "";
  await ids["demo-search"].fire("input");
});

test("apply renders folder names and titles as text and reset clears the result", async () => {
  await resetDemo();
  const rows = ids["demo-list"].children;
  const [, folderInput, toggle] = rows[0].children;
  folderInput.value = "  <b>Docs</b>  ";
  await folderInput.fire("change");
  assert.equal(folderInput.value, "<b>Docs</b>");
  await toggle.fire("click");
  assert.equal(ids["demo-apply"].disabled, false);
  assert.equal(ids["demo-apply"].textContent, "Apply (1)");
  await ids["demo-apply"].fire("click");
  assert.match(ids["demo-result"].textContent, /Other bookmarks › Link Sense/);
  assert.match(ids["demo-result"].textContent, /<b>Docs<\/b>/);
  await ids["demo-reset"].fire("click");
  assert.equal(ids["demo-result"].children.length, 0);
  assert.equal(ids["demo-apply"].disabled, true);
});
