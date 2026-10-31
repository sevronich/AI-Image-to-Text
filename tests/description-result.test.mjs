import test from "node:test";
import assert from "node:assert/strict";
import { validateDescription, parseDescriptionText, parseResponsesOutput } from "../lib/description-result.mjs";
import { shapesDescription } from "./fixtures/descriptions.mjs";

const copy = () => structuredClone(shapesDescription);
const code = expected => error => error.code === expected;
test("a completed English analysis preserves all six sections and the actual reconstruction prompt", () => {
  assert.deepEqual(parseDescriptionText(JSON.stringify(shapesDescription)), shapesDescription);
  assert.match(validateDescription(shapesDescription).prompt, /^Create/);
});
test("instruction echoes are errors, including an exact submitted instruction", () => {
  const result = copy(); result.summary = "Please describe the visible image in detail.";
  assert.throws(() => validateDescription(result), code("instruction_echo"));
  result.summary = "Focus on the colors and background pattern.";
  assert.throws(() => validateDescription(result, { submittedTexts: [result.summary] }), code("instruction_echo"));
});
test("schema definitions and repeated generic sections are not descriptions", () => {
  const result = copy(); result.summary = "Detailed visual summary";
  assert.throws(() => validateDescription(result));
  result.summary = shapesDescription.summary;
  Object.keys(result.sections).forEach(key => { result.sections[key] = "An image is visible."; });
  assert.throws(() => validateDescription(result));
});
test("reconstruction may request an image but must not request another caption", () => {
  const result = copy(); result.prompt = "Generate a minimalist visual description of the red circle and blue rectangle.";
  assert.throws(() => validateDescription(result), code("invalid_reconstruction"));
  result.prompt = "Generate an image of a red circle and a blue rectangle.";
  assert.equal(validateDescription(result).prompt, result.prompt);
});
test("missing, mistyped, extra and malformed fields are rejected without invented defaults", () => {
  for (const mutate of [r => delete r.sections.pose, r => { r.summary = null; }, r => { r.evidence.confirmed = [null]; }, r => { r.extra = "anything"; }]) {
    const result = copy(); mutate(result); assert.throws(() => validateDescription(result));
  }
  assert.throws(() => parseDescriptionText('{"summary":'), code("invalid_json"));
  assert.throws(() => parseDescriptionText(""), code("missing_output"));
});
test("non-English script-only output is rejected while normal English is accepted", () => {
  const result = copy(); result.summary = "ការពិពណ៌នារូបភាពជាភាសាខ្មែរ";
  assert.throws(() => validateDescription(result), code("wrong_language"));
});
test("qualified visual guesses belong only to uncertainty, not confirmed observations", () => {
  const result = copy(); result.evidence.uncertain = ["The shapes may be cut from paper."];
  assert.deepEqual(validateDescription(result).evidence.uncertain, result.evidence.uncertain);
  result.evidence.confirmed.push("The shapes may be cut from paper.");
  assert.throws(() => validateDescription(result), code("uncertain_evidence"));
});
test("model refusals are reported explicitly rather than rendered as descriptions", () => {
  assert.throws(() => parseDescriptionText("I cannot provide that analysis."), code("model_refusal"));
  const result = copy(); result.sections.appearance = "I cannot assist with that image.";
  assert.throws(() => validateDescription(result), code("model_refusal"));
});
test("Responses output joins all output_text fragments and ignores reasoning items", () => {
  const text = JSON.stringify(shapesDescription); const split = Math.floor(text.length / 2);
  const result = parseResponsesOutput({ status: "completed", output: [
    { type: "reasoning", summary: [] },
    { type: "message", status: "completed", content: [{ type: "output_text", text: text.slice(0, split) }, { type: "output_text", text: text.slice(split) }] },
  ] });
  assert.deepEqual(result, shapesDescription);
  assert.deepEqual(parseResponsesOutput({ status: "completed", output_text: text }), shapesDescription);
});
test("Responses incomplete, refusal and failed states override even otherwise valid JSON", () => {
  const text = JSON.stringify(shapesDescription);
  assert.throws(() => parseResponsesOutput({ status: "incomplete", output_text: text }), code("truncated_output"));
  assert.throws(() => parseResponsesOutput({ output_text: text, output: [{ content: [{ type: "refusal", refusal: "Declined" }] }] }), code("model_refusal"));
  assert.throws(() => parseResponsesOutput({ status: "failed", output_text: text }), code("provider_error"));
});
