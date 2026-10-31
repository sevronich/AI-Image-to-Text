
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  QWEN_MODEL,
  SITE_ORIGIN,
} from "../lib/qwen.mjs";

import {
  SECTION_KEYS,
} from "../lib/description.mjs";

// Check whether the local Qwen server is ready.
const ready = await fetch(
  "http://127.0.0.1:8765/health"
);

assert.equal(
  ready.ok,
  true,
  "Local model must be ready before smoke testing."
);

// Load the reference image or a user-specified image.
const image = await readFile(
  process.argv[2] ||
  new URL("../public/reference-anime.png", import.meta.url)
);

const start = Date.now();

// Send the image to the local Qwen Bridge.
const response = await fetch(
  "http://127.0.0.1:8765/describe",
  {
    method: "POST",

    headers: {
      "Content-Type": "application/json",
      Origin: SITE_ORIGIN,
    },

    body: JSON.stringify({
      image:
        "data:image/png;base64," +
        image.toString("base64"),

      detail: "concise",

      preset: "faithful",
    }),

    signal: AbortSignal.timeout(310000),
  }
);

// Parse model response.
const result = await response.json();

// Check HTTP request success.
assert.equal(
  response.ok,
  true,
  JSON.stringify(result)
);

// Verify model identity.
assert.equal(result.model, QWEN_MODEL);

// Verify local provider.
assert.equal(result.provider, "local");

// Verify structured description.
assert.ok(
  result.description &&
  typeof result.description === "object",
  "Description object must be present."
);

// Collect all description fields.
const descriptionFields = [
  result.description.summary,
  result.description.prompt,

  ...SECTION_KEYS.map(
    (key) => result.description.sections?.[key]
  ),
];

// Validate description fields.
for (const value of descriptionFields) {
  assert.equal(
    typeof value,
    "string",
    "Description fields must contain text."
  );

  assert.ok(
    value.trim(),
    "Description fields must not be empty."
  );

  // Verify English-only output configuration.
  assert.doesNotMatch(
    value,
    /[\u1780-\u17ff]/,
    "The model must not generate Khmer."
  );
}

// Validate evidence structure.
assert.ok(
  Array.isArray(result.description.evidence?.confirmed),
  "Confirmed evidence must be an array."
);

assert.ok(
  Array.isArray(result.description.evidence?.uncertain),
  "Uncertain evidence must be an array."
);

// Display successful test result.
console.log(
  JSON.stringify(
    {
      success: true,

      elapsedSeconds: Math.round(
        (Date.now() - start) / 1000
      ),

      model: result.model,

      provider: result.provider,

      description: result.description,
    },
    null,
    2
  )
);
