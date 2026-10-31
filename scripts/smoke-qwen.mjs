import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { QWEN_MODEL, SITE_ORIGIN } from "../lib/qwen.mjs";
import { SECTION_KEYS } from "../lib/description.mjs";

const ready = await fetch("http://127.0.0.1:8765/health");
assert.equal(ready.ok, true, "Local model must be ready before smoke testing.");
const image = await readFile(process.argv[2] || new URL("../public/reference-anime.png", import.meta.url));
const start = Date.now();
const response = await fetch("http://127.0.0.1:8765/describe", {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: SITE_ORIGIN },
  body: JSON.stringify({ image: "data:image/png;base64," + image.toString("base64"), detail: "concise", preset: "faithful" }),
  signal: AbortSignal.timeout(310000),
});
const result = await response.json();
assert.equal(response.ok, true, JSON.stringify(result));
assert.equal(result.model, QWEN_MODEL);
assert.equal(result.provider, "local");
for (const value of [result.description.summary, result.description.prompt, ...SECTION_KEYS.map(key => result.description.sections[key])]) {
  assert.equal(typeof value, "string");
  assert.ok(value.trim(), "English text must be present.");
  assert.doesNotMatch(value, /[\u1780-\u17ff]/, "The model must not generate Khmer.");
}
assert.match(result.description.sections.appearance, /hair/i);
assert.match(result.description.sections.clothing, /white|light/i);
console.log(JSON.stringify({ elapsedSeconds: Math.round((Date.now() - start) / 1000), model: result.model, description: result.description }, null, 2));
