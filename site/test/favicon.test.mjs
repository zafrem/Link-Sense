import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const siteDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (name) => readFileSync(path.join(siteDir, name));

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Walk every PNG chunk, checking lengths, CRCs and the closing IEND. Returns a list of problems.
function pngProblems(png) {
  if (png.length < 8 || !PNG_SIGNATURE.every((b, i) => png[i] === b)) return ["bad signature"];
  const problems = [];
  let pos = 8;
  let sawIend = false;
  while (pos + 12 <= png.length) {
    const length = png.readUInt32BE(pos);
    const type = png.toString("ascii", pos + 4, pos + 8);
    const end = pos + 12 + length;
    if (end > png.length) {
      problems.push(`chunk ${type} runs past the end of the file`);
      break;
    }
    if (png.readUInt32BE(pos + 8 + length) !== crc32(png.subarray(pos + 4, pos + 8 + length))) {
      problems.push(`bad CRC in ${type}`);
    }
    if (type === "IEND") {
      sawIend = true;
      if (end !== png.length) problems.push("data after IEND");
      break;
    }
    pos = end;
  }
  if (!sawIend) problems.push("missing IEND");
  return problems;
}

// ICO directory entries: [{ width, height, bytes, offset }]
function icoEntries(ico) {
  const count = ico.readUInt16LE(4);
  return Array.from({ length: count }, (_, i) => {
    const entry = 6 + i * 16;
    return {
      width: ico[entry] || 256,
      height: ico[entry + 1] || 256,
      bytes: ico.readUInt32LE(entry + 8),
      offset: ico.readUInt32LE(entry + 12),
    };
  });
}

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
  assert.equal(png.toString("ascii", 12, 16), "IHDR");
  assert.equal(png.readUInt32BE(16), 180);
  assert.equal(png.readUInt32BE(20), 180);
  assert.equal(png[25], 2, "colour type 2 = RGB without alpha, so iOS shows no black corners");
});

test("apple-touch-icon.png is an intact PNG: every chunk CRC is valid and it ends with IEND", () => {
  assert.deepEqual(pngProblems(read("apple-touch-icon.png")), []);
});

test("favicon.ico holds exactly the 16, 32 and 48 pixel images", () => {
  const ico = read("favicon.ico");
  assert.equal(ico.readUInt16LE(0), 0, "reserved");
  assert.equal(ico.readUInt16LE(2), 1, "type 1 = icon");
  const entries = icoEntries(ico);
  assert.equal(entries.length, 3);
  for (const e of entries) {
    assert.equal(e.width, e.height);
    assert.ok(e.bytes > 0 && e.offset + e.bytes <= ico.length, "frame lies inside the file");
  }
  assert.deepEqual(entries.map((e) => e.width).sort((a, b) => a - b), [16, 32, 48]);
});

test("every favicon.ico frame is an intact PNG whose own size matches its directory entry", () => {
  const ico = read("favicon.ico");
  for (const e of icoEntries(ico)) {
    const frame = ico.subarray(e.offset, e.offset + e.bytes);
    assert.deepEqual(pngProblems(frame), [], `${e.width}px frame`);
    assert.equal(frame.readUInt32BE(16), e.width, `${e.width}px frame IHDR width`);
    assert.equal(frame.readUInt32BE(20), e.height, `${e.width}px frame IHDR height`);
  }
});

test("the PNG check rejects truncated, zeroed and unterminated files", () => {
  const good = read("apple-touch-icon.png");
  assert.notDeepEqual(pngProblems(good.subarray(0, 40)), []);
  assert.notDeepEqual(pngProblems(good.subarray(0, good.length - 12)), []);
  const zeroed = Buffer.from(good);
  zeroed.fill(0, 100, 140);
  assert.notDeepEqual(pngProblems(zeroed), []);
  assert.notDeepEqual(pngProblems(Buffer.from("not a png at all")), []);
});
