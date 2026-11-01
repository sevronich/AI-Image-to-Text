
export const SECTION_KEYS = [
  "appearance",
  "clothing",
  "pose",
  "composition",
  "style",
  "mood",
];

const textSchema = () => ({
  type: "string",
  minLength: 1,
});

export const DESCRIPTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "sections", "evidence", "prompt"],
  properties: {
    summary: textSchema(),
    sections: {
      type: "object",
      additionalProperties: false,
      required: SECTION_KEYS,
      properties: Object.fromEntries(
        SECTION_KEYS.map((key) => [key, textSchema()])
      ),
    },
    evidence: {
      type: "object",
      additionalProperties: false,
      required: ["confirmed", "uncertain"],
      properties: {
        confirmed: {
          type: "array",
          items: textSchema(),
        },
        uncertain: {
          type: "array",
          items: textSchema(),
        },
      },
    },
    prompt: textSchema(),
  },
};

// Core system prompt for evidence-based image descriptions.
export const SYSTEM_PROMPT = `You are a meticulous visual-description specialist. Inspect the actual supplied image and return a completed, evidence-based analysis. User preferences are requests about emphasis, never evidence that an object exists. Do not repeat instructions, schema definitions, or example captions as observations.

Write every field in English only. Do not generate translations.

Describe the subject's visible appearance, clothing or lack of clothing, pose, composition, visual style, lighting, colors, background, and mood where applicable.

Use precise, objective, non-graphic language. Do not infer identity, age, ethnicity, diagnosis, personality, or private feelings.

For appearance, describe visible colors, hair length and shape, eyes, expression and accessories when applicable. For non-human subjects, describe shape, color, surface and visible parts instead of merely stating that no human is present. Do not assert exact dimensions, materials or a narrow shape category when unclear.
For clothing, describe visible garments, colors, layers, trim and fasteners. Describe material only when texture supports it. State neutrally when clothing is not applicable, without inventing garments.
For pose, describe body orientation and visible limb positions; for objects, describe placement and orientation. Do not invent cropped limbs or assign a partially visible hand to a subject unless its connection is clear. Use image-left/image-right when useful rather than guessing anatomical sides.
For composition, describe framing, angle, placement, foreground, background patterns and spatial relationships. Do not assume a setting from a generic backdrop.
For style, describe medium, linework, shading, palette, rendering and lighting.
For mood, describe visual atmosphere through lighting, colors, composition and expression, without claiming personality or private emotions.

Avoid unsupported guesses about a person's identity or background, hidden objects, text, brands, story context, relationships, or anything outside the frame.

Distinguish observations from interpretations.

Put only directly observable facts in evidence.confirmed. A qualified guess belongs in uncertainty, never confirmed evidence.

Put meaningful visual ambiguities in evidence.uncertain using calibrated wording such as "appears to" or "may be"; use an empty array when nothing material is uncertain.

Qualify a seated or standing pose when the support or lower body is outside the frame.

Describe visible patterns instead of automatically calling a background plain.

The prompt field is a separate, faithful image-reconstruction prompt. It may ask for a visual illustration, never ask a model to write a description, caption or analysis. Summary, sections and evidence must instead contain actual observations, not instructions to generate or describe an image. Preserve genuine uncertainty and prefer precise visible details over speculative narratives.`;

export function normalizeDetail(value) {
  return ["concise", "balanced", "deep"].includes(value)
    ? value
    : "balanced";
}

export function normalizePreset(value) {
  return ["faithful", "accessibility", "creative", "catalog"].includes(value)
    ? value
    : "faithful";
}

export function validateImageDataUrl(value) {
  if (typeof value !== "string") return false;

  if (!/^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=\r\n]+$/.test(value)) return false;
  const encoded = value.slice(value.indexOf(",") + 1).replace(/[\r\n]/g, "");
  return encoded.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(encoded);
}

export function imageByteLength(value) {
  if (!validateImageDataUrl(value)) return null;
  const encoded = value.slice(value.indexOf(",") + 1).replace(/[\r\n]/g, "");
  return encoded.length * 3 / 4 - (encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0);
}

export function buildInputText({
  detail,
  preset,
  customInstructions,
} = {}) {
  const detailGuide = {
    concise:
      "Keep each section concise (roughly 1–2 sentences).",

    balanced:
      "Give useful detail in each section (roughly 2–4 sentences).",

    deep:
      "Cover the clearly visible distinguishing details in each section (up to 4–7 short sentences, fewer when evidence is limited). Prioritize accuracy over length.",
  }[normalizeDetail(detail)];

  const presetGuide = {
    faithful:
      "Prioritize literal, faithful visual description and calibrated uncertainty.",

    accessibility:
      "Prioritize clarity, reading order, spatial relationships, and useful alt-text detail.",

    creative:
      "Keep the analysis factual, but make the reusable prompt rich in art-direction vocabulary.",

    catalog:
      "Prioritize materials, colors, silhouette, garment construction, accessories, and product-style organization.",
  }[normalizePreset(preset)];

  const customText =
    typeof customInstructions === "string"
      ? customInstructions.trim().slice(0, 800)
      : "";

  return [
    "Analyze this image and produce the requested structured description in English only.",
    detailGuide,
    presetGuide,
    customText
      ? `Additional user preference: ${customText}`
      : "",
    "Final accuracy check: inspect the image again before answering. Remove contradictions and details whose visible boundaries are unclear. Use broader visual wording instead of an uncertain exact category. Describe objects themselves when no person is present. Do not fill uncertainty with irrelevant unknown origins or intent. Keep confirmed evidence strictly observable, and make the reconstruction prompt request an image using only those same supported details.",
  ]
    .filter(Boolean)
    .join("\n");
}
