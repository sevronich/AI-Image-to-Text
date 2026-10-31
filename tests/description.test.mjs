
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildInputText,
  normalizeDetail,
  normalizePreset,
  validateImageDataUrl,
} from "../lib/description.mjs";

// Test supported image data formats.
test("accepts supported base64 image data URLs", () => {
  assert.equal(
    validateImageDataUrl("data:image/png;base64,iVBORw0KGgo="),
    true
  );

  assert.equal(
    validateImageDataUrl("data:image/webp;base64,UklGRg=="),
    true
  );
});

// Test invalid image URL formats.
test("rejects remote URLs and unsupported media", () => {
  assert.equal(
    validateImageDataUrl("https://example.com/image.png"),
    false
  );

  assert.equal(
    validateImageDataUrl("data:image/svg+xml;base64,PHN2Zz4="),
    false
  );
});

// Test detail and preset normalization.
test("normalizes unknown controls to defaults", () => {
  assert.equal(
    normalizeDetail("unknown"),
    "balanced"
  );

  assert.equal(
    normalizePreset("unknown"),
    "faithful"
  );
});

// Test custom instruction length handling.
test("truncates custom instructions before model input", () => {
  const text = buildInputText({
    detail: "deep",
    preset: "catalog",
    customInstructions: "x".repeat(1200),
  });

  assert.equal(
    text.includes("x".repeat(801)),
    false
  );

  assert.match(
    text,
    /materials, colors/i
  );
});
