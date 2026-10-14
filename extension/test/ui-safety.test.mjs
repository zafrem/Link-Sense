import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Page titles and URLs come from untrusted pages: the UI must render them as text.
test("ui.js never builds markup from strings", () => {
  const src = readFileSync(new URL("../ui.js", import.meta.url), "utf8");
  for (const banned of ["innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "eval("]) {
    assert.equal(src.includes(banned), false, `ui.js must not use ${banned}`);
  }
});
