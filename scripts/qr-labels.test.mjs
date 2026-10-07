import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { createRequire } from "node:module";
import sharp from "sharp";
import { decodeQrLabels } from "../lib/qr-image.ts";

const image = await readFile("tests/fixtures/qr/printed-labels.png");
const fixture = JSON.parse(await readFile("tests/fixtures/qr/labels.json", "utf8"));
const { scan } = createRequire(import.meta.url)("../backend/src/workspace/stock-ledger.js");
assert.equal(createHash("sha256").update(image).digest("hex"), fixture.sha256);
async function decode(buffer) {
  const { data, info } = await sharp(buffer).greyscale().raw().toBuffer({ resolveWithObject: true });
  const pixels = Uint8ClampedArray.from({ length: info.width * info.height }, (_, i) => data[i * info.channels]);
  return decodeQrLabels(pixels, info.width, info.height);
}
test("original sheet decodes exactly all ten payloads (120 contains QR 128)", async () => {
  for (const angle of [0, 90, 180, 270])
    assert.deepEqual((await decode(await sharp(image).rotate(angle).toBuffer())).sort(), fixture.labels.map((l) => l.payload).sort(), `Whole sheet, rotation ${angle}`);
});
test("every original label decodes individually in all four orientations", async () => {
  for (const { id, payload, left, top, width, height } of fixture.labels) {
    const crop = await sharp(image).extract({ left, top, width, height }).png().toBuffer();
    for (const angle of [0, 90, 180, 270])
      assert.deepEqual(await decode(await sharp(crop).rotate(angle).toBuffer()), [payload], `ID ${id}, rotation ${angle}`);
  }
});
test("delivery accepts every registered original payload and rejects another piece", () => {
  for (const label of fixture.labels) {
    const part = { code: label.id, qr_code: label.payload.replace(/[\r\n]+$/, "") };
    assert.doesNotThrow(() => scan(part, label.payload));
    assert.doesNotThrow(() => scan(part, label.id));
    for (const other of fixture.labels.filter((l) => l.id !== label.id))
      assert.throws(() => scan(part, other.payload), /não corresponde/);
  }
});
