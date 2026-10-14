import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const siteDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (name) => readFileSync(path.join(siteDir, name));

test("favicon.svg has the 64x64 viewBox and both colour variants", () => {
  const svg = read("favicon.svg").toString("utf8");
  assert.match(svg, /^<svg[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /viewBox="0 0 64 64"/);
  assert.match(svg, /<\/svg>\s*$/);
  for (const colour of ["#0f766e", "#ffffff", "#5fd0c4", "#06201d"]) {
    assert.ok(svg.toLowerCase().includes(colour), `missing colour ${colour}`);
  }
  assert.match(svg, /prefers-color-scheme:\s*dark/);
});

test("favicon.svg contains nothing executable or external", () => {
  const svg = read("favicon.svg").toString("utf8");
  assert.equal(/<script/i.test(svg), false);
  assert.equal(/\bhref\s*=/i.test(svg), false);
  assert.equal(/url\(/i.test(svg), false);
  const hosts = [...svg.matchAll(/https?:\/\/[^\s"')]+/g)].map((m) => m[0]);
  assert.deepEqual(hosts, ["http://www.w3.org/2000/svg"]);
});

test("apple-touch-icon.png is a 180x180 opaque RGB PNG", () => {
  const png = read("apple-touch-icon.png");
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(png.toString("ascii", 12, 16), "IHDR");
  assert.equal(png.readUInt32BE(16), 180);
  assert.equal(png.readUInt32BE(20), 180);
  assert.equal(png[25], 2, "colour type 2 = RGB without alpha, so iOS shows no black corners");
});

test("favicon.ico holds exactly the 16, 32 and 48 pixel images", () => {
  const ico = read("favicon.ico");
  assert.equal(ico.readUInt16LE(0), 0, "reserved");
  assert.equal(ico.readUInt16LE(2), 1, "type 1 = icon");
  const count = ico.readUInt16LE(4);
  assert.equal(count, 3);
  const sizes = [];
  for (let i = 0; i < count; i += 1) {
    const entry = 6 + i * 16;
    const width = ico[entry] || 256;
    const height = ico[entry + 1] || 256;
    assert.equal(width, height);
    const bytes = ico.readUInt32LE(entry + 8);
    const offset = ico.readUInt32LE(entry + 12);
    assert.ok(bytes > 0 && offset + bytes <= ico.length, `image ${i} lies inside the file`);
    sizes.push(width);
  }
  assert.deepEqual(sizes.sort((a, b) => a - b), [16, 32, 48]);
});
