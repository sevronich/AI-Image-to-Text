import test from "node:test";
import assert from "node:assert/strict";
import { googleTranslateUrl, descriptionText, MAX_TRANSLATION_CHARACTERS } from "../lib/translation.mjs";

test("translation link sends selected text only to Google with English and Khmer selected", () => {
  const text = "A white shirt & gray top.\nA raised hand? #pose";
  const url = new URL(googleTranslateUrl(text));
  assert.equal(url.origin, "https://translate.google.com");
  assert.equal(url.searchParams.get("sl"), "en");
  assert.equal(url.searchParams.get("tl"), "km");
  assert.equal(url.searchParams.get("text"), text);
  assert.deepEqual([...url.searchParams.keys()], ["sl", "tl", "text", "op"]);
});

test("translation refuses empty and oversized text without silently truncating", () => {
  assert.equal(googleTranslateUrl(" "), null);
  assert.equal(googleTranslateUrl("a".repeat(MAX_TRANSLATION_CHARACTERS + 1)), null);
  assert.ok(googleTranslateUrl("a".repeat(MAX_TRANSLATION_CHARACTERS)));
});

test("full description translation preserves facts and uses the user's edited prompt", () => {
  const result = { summary: "Summary", sections: { pose: "Hand raised" }, evidence: { confirmed: ["White shirt"], uncertain: [] }, prompt: "Old prompt" };
  const text = descriptionText(result, "Edited prompt");
  assert.match(text, /Hand raised/);
  assert.match(text, /White shirt/);
  assert.match(text, /Edited prompt/);
  assert.doesNotMatch(text, /Old prompt|undefined/);
});
