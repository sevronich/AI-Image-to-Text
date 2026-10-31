import test from "node:test";
import assert from "node:assert/strict";
import { prepareVisionImage, MAX_IMAGE_EDGE } from "../lib/image-normalization.mjs";

const webp = "data:image/webp;base64,UklGRg==";
const png = "data:image/png;base64,iVBORw0KGgo=";
test("PNG and JPEG bytes are preserved without decoding or relabeling", async () => {
  for (const source of [png, "data:image/jpeg;base64,/9j/2Q=="]) {
    assert.equal(await prepareVisionImage(source, { loadImage: () => assert.fail("Unexpected decoding") }), source);
  }
});
test("WebP is actually rasterized into PNG with proportional bounded dimensions", async () => {
  const draws = [];
  const canvas = { width: 0, height: 0, getContext: () => ({ drawImage: (...args) => draws.push(args) }), toDataURL: type => { assert.equal(type, "image/png"); return png; } };
  assert.equal(await prepareVisionImage(webp, { loadImage: async value => { assert.equal(value, webp); return { naturalWidth: 4000, naturalHeight: 2000 }; }, createCanvas: () => canvas }), png);
  assert.equal(canvas.width, MAX_IMAGE_EDGE); assert.equal(canvas.height, MAX_IMAGE_EDGE / 2);
  assert.equal(draws.length, 1);
});
test("broken WebP conversion fails explicitly instead of forwarding the unsupported source", async () => {
  await assert.rejects(prepareVisionImage(webp, { loadImage: async () => { throw new Error("Cannot decode"); } }), /Cannot decode/);
  await assert.rejects(prepareVisionImage(webp, { loadImage: async () => ({ naturalWidth: 0, naturalHeight: 0 }) }));
});
