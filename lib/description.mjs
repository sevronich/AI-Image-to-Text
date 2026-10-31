export const SECTION_KEYS = ["appearance", "clothing", "pose", "composition", "style", "mood"];

function bilingualSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["en", "km"],
    properties: { en: { type: "string", minLength: 1 }, km: { type: "string", minLength: 1 } },
  };
}

export const DESCRIPTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "sections", "evidence", "prompt"],
  properties: {
    summary: bilingualSchema(),
    sections: {
      type: "object",
      additionalProperties: false,
      required: SECTION_KEYS,
      properties: Object.fromEntries(SECTION_KEYS.map((key) => [key, bilingualSchema()])),
    },
    evidence: {
      type: "object",
      additionalProperties: false,
      required: ["confirmed", "uncertain"],
      properties: {
        confirmed: { type: "array", items: bilingualSchema() },
        uncertain: { type: "array", items: bilingualSchema() },
      },
    },
    prompt: bilingualSchema(),
  },
};

export const SYSTEM_PROMPT = `You are a meticulous visual-description specialist. Analyze only what is visibly supported by the supplied image.

Return fluent Khmer and English in every field. The Khmer must sound natural and polished, not like a word-for-word translation. Describe appearance, clothing, pose, composition, visual style, and mood. For people or characters, do not identify a real person, infer ethnicity, nationality, religion, diagnosis, personality, or other sensitive traits. Do not sexualize or guess age; use neutral phrases such as "a person" or "an illustrated character" unless an age group is visually unambiguous. Never invent obscured objects, text, brands, story context, relationships, or off-frame details.

Put directly observable facts in evidence.confirmed. Put meaningful ambiguities in evidence.uncertain using calibrated wording such as "appears to" or "may be"; use an empty array when nothing material is uncertain. The prompt fields should be editable, reusable image-generation prompts that faithfully reconstruct the visible scene without adding unsupported details.`;

export function normalizeDetail(value) {
  return ["concise", "balanced", "deep"].includes(value) ? value : "balanced";
}

export function normalizePreset(value) {
  return ["faithful", "accessibility", "creative", "catalog"].includes(value) ? value : "faithful";
}

export function validateImageDataUrl(value) {
  if (typeof value !== "string") return false;
  return /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=\r\n]+$/.test(value);
}

export function buildInputText({ detail, preset, customInstructions }) {
  const detailGuide = {
    concise: "Keep each section concise (roughly 1–2 sentences).",
    balanced: "Give useful detail in each section (roughly 2–4 sentences).",
    deep: "Give a close, nuanced visual reading while remaining evidence-based (roughly 4–7 sentences per section).",
  }[normalizeDetail(detail)];

  const presetGuide = {
    faithful: "Prioritize literal, faithful visual description and calibrated uncertainty.",
    accessibility: "Prioritize clarity, reading order, spatial relationships, and useful alt-text detail.",
    creative: "Keep the analysis factual, but make the reusable prompt rich in art-direction vocabulary.",
    catalog: "Prioritize materials, colors, silhouette, garment construction, accessories, and product-style organization.",
  }[normalizePreset(preset)];

  const safeCustom = typeof customInstructions === "string" ? customInstructions.trim().slice(0, 800) : "";
  return [
    "Analyze this image and produce the requested bilingual structured description.",
    detailGuide,
    presetGuide,
    safeCustom ? `Additional user preference: ${safeCustom}` : "",
  ].filter(Boolean).join("\n");
}
