import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ADVANCED_SCHEMA_VERSION, VISIBILITY_STATES, ANATOMY_REGIONS, ADVANCED_CAPS,
  validateAdvanced, applyVerificationChecks,
} from "../lib/anatomy.mjs";
import { buildDescriptionSchema, normalizeAdvanced } from "../lib/description.mjs";

const base = () => ({
  summary: "A figure reclines at a diagonal angle on patterned bedding.",
  sections: {
    appearance: "Dark hair falls across the pillow; eyes appear closed.",
    clothing: "A light long-sleeved top with visible trim.",
    pose: "Body angled diagonally, one arm extended toward image-left.",
    composition: "High camera angle; subject fills the frame diagonally.",
    style: "Flat cel shading with clean linework.",
    mood: "Cool palette and soft lighting suggest calm.",
  },
  evidence: { confirmed: ["The figure lies at a diagonal angle."], uncertain: ["Hand connection is unclear."] },
  prompt: "Anime illustration of a dark-haired figure reclining diagonally on patterned bedding, cool lighting, cel shading.",
});

const advancedResult = (overrides = {}) => ({
  ...base(),
  schema_version: ADVANCED_SCHEMA_VERSION,
  advanced: true,
  subjects: [{
    id: "subject_1",
    subject_type: "person",
    pose: { orientation: "reclining at a diagonal", description: "Body supported by bedding; right leg extended, left knee bent." },
    anatomy: [
      { region: "hair", visibility: "visible", attributes: ["dark", "shoulder-length"], description: "Dark shoulder-length hair spreads across the pillow.", evidence: "Directly visible strands.", uncertainty: null },
      { region: "feet", visibility: "outside_frame", attributes: [], description: "Feet are cut off by the lower image edge.", evidence: null, uncertainty: null },
    ],
  }],
  spatial_relationships: [{ between: ["subject_1", "background"], description: "The figure rests on patterned bedding that fills the background." }],
  verified_observations: ["The body is angled diagonally rather than horizontal."],
  uncertain_observations: ["Finger count cannot be determined at this resolution."],
  ...overrides,
});

test("normalizeAdvanced gates the mode to deep detail only", () => {
  assert.equal(normalizeAdvanced(true, "deep"), true);
  assert.equal(normalizeAdvanced(true, "balanced"), false);
  assert.equal(normalizeAdvanced(false, "deep"), false);
  assert.equal(normalizeAdvanced("true", "deep"), true);
  assert.equal(normalizeAdvanced(undefined, undefined), false);
});

test("buildDescriptionSchema stays byte-identical for v1 and extends additively", () => {
  const v1 = buildDescriptionSchema();
  assert.deepEqual(Object.keys(v1.required).length ? v1.required : v1.required, ["summary", "sections", "evidence", "prompt"]);
  assert.equal(v1.properties.subjects, undefined);
  const v2 = buildDescriptionSchema({ advanced: true });
  assert.equal(v2.required.join(","), v1.required.join(",")); // additive: no new required fields
  assert.ok(v2.properties.subjects && v2.properties.anatomy === undefined);
  assert.equal(v2.additionalProperties, false);
  assert.ok(VISIBILITY_STATES.every((state) => typeof state === "string"));
});

test("validateAdvanced accepts a well-formed v2.0 result and sanitizes it", () => {
  const clean = validateAdvanced(advancedResult());
  assert.equal(clean.schema_version, ADVANCED_SCHEMA_VERSION);
  assert.equal(clean.subjects[0].id, "subject_1");
  assert.equal(clean.subjects[0].anatomy[1].visibility, "outside_frame");
  assert.equal(clean.spatial_relationships[0].between[0], "subject_1");
});

test("validateAdvanced returns null for plain v1 results", () => {
  assert.equal(validateAdvanced(base()), null);
});

test("validateAdvanced rejects broken subject ids, unknown regions, and invented hidden detail", () => {
  assert.throws(() => validateAdvanced(advancedResult({
    subjects: [{ ...advancedResult().subjects[0], id: "subject_7" }],
  })), /stable and sequential/);
  assert.throws(() => validateAdvanced(advancedResult({
    subjects: [{ ...advancedResult().subjects[0], anatomy: [{ region: "tail_wag", visibility: "visible", description: "Something" }] }],
  })), /unknown region/);
  assert.throws(() => validateAdvanced(advancedResult({
    subjects: [{ ...advancedResult().subjects[0], anatomy: [{ region: "hips", visibility: "occluded", description: "She is wearing a red skirt here" }] }],
  })), /invents hidden detail/);
  const repeatedSubject = advancedResult();
  repeatedSubject.subjects = [repeatedSubject.subjects[0], repeatedSubject.subjects[0]];
  assert.throws(() => validateAdvanced(repeatedSubject), /stable and sequential/);
});

test("validateAdvanced rejects hedged-visible entries without uncertainty and confirmed/uncertain contradictions", () => {
  assert.throws(() => validateAdvanced(advancedResult({
    subjects: [{ ...advancedResult().subjects[0], anatomy: [{ region: "eyes", visibility: "visible", description: "The eyes appear to be green." }] }],
  })), /hedged as visible/);
  const dup = advancedResult();
  dup.uncertain_observations = ["The body is angled diagonally rather than horizontal."];
  assert.throws(() => validateAdvanced(dup), /both confirmed and uncertain/);
});

test("validateAdvanced enforces English-only advanced text", () => {
  assert.throws(() => validateAdvanced(advancedResult({
    subjects: [{ ...advancedResult().subjects[0], pose: { orientation: "ដេក", description: "ស្រីម្នាក់ដេកលើគ្រែនៅក្នុងបន្ទប់" } }],
  })), /not English/);
});

test("ANATOMY_REGIONS covers head, upper body, lower body and general groups", () => {
  for (const region of ["hair", "eyes", "neck", "shoulders", "elbows", "hands", "chest", "abdomen", "waist", "hips", "thighs", "knees", "calves", "feet"]) {
    assert.ok(ANATOMY_REGIONS.includes(region), `missing region ${region}`);
  }
  assert.ok(ANATOMY_REGIONS.length >= 40);
  assert.equal(new Set(ANATOMY_REGIONS).size, ANATOMY_REGIONS.length);
});

test("applyVerificationChecks demotes unsupported claims out of confirmed evidence", () => {
  const draft = advancedResult();
  const original = draft.evidence.confirmed[0];
  const { description, applied } = applyVerificationChecks(draft, [
    { claim: original, verdict: "unsupported", note: "The body is clearly vertical in the image." },
  ]);
  assert.ok(applied >= 1);
  assert.ok(!description.evidence.confirmed.includes(original));
  assert.ok(description.evidence.uncertain.some((item) => item.includes("Possibly inaccurate")));
  const kept = applyVerificationChecks(advancedResult(), [{ claim: "unrelated claim entirely", verdict: "unsupported", note: "n/a" }]);
  assert.equal(kept.description.evidence.confirmed.length, 1);
});

test("verification checks list must be an array; non-array is a no-op", () => {
  const before = advancedResult();
  const after = applyVerificationChecks(before, null);
  assert.deepEqual(after.description.evidence.confirmed, before.evidence.confirmed);
});

test("caps bound the sanitized output size", () => {
  const big = advancedResult();
  big.verified_observations = Array.from({ length: 40 }, (_, i) => `Verified observation number ${i + 1} about the picture.`);
  const clean = validateAdvanced(big);
  assert.equal(clean.verified_observations.length, ADVANCED_CAPS.maxVerified);
});
