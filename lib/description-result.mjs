import { SECTION_KEYS } from "./description.mjs";

export class DescriptionError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.name = "DescriptionError";
    this.code = code;
    this.status = status;
  }
}

const invalid = () => new DescriptionError("invalid_description", "លទ្ធផលមិនមានការពិពណ៌នាគ្រប់ផ្នែកទេ។ សូមសាកម្តងទៀត។");
const normalized = text => text.toLowerCase().replace(/\s+/g, " ").trim();
const instruction = /^(?:please\s+)?(?:analy[sz]e|describe|generate|write|provide|return|create|identify)\b|^(?:please\s+)?list\s+(?:the|all|visible)\b/i;
const refusal = /^(?:i\s+(?:cannot|can't|won't|am unable)|sorry[,\s]|i(?:'m| am) sorry|as an ai\b)/i;
const placeholders = new Set([
  "detailed visual summary", "observable appearance", "observable body position",
  "camera framing and spatial arrangement", "artistic technique and visual characteristics",
  "visually supported atmosphere", "faithful visual reconstruction prompt",
  "visible clothing or neutral description of its absence", "directly observable fact", "meaningful uncertainty",
]);

function requireText(value) {
  if (typeof value !== "string" || !value.trim()) throw invalid();
  if (refusal.test(value.trim())) throw new DescriptionError("model_refusal", "Model មិនបានផ្តល់ការវិភាគរូបនេះទេ។ សូមជ្រើសរូបផ្សេង។");
  const letters = value.match(/\p{L}/gu) || [];
  const latin = value.match(/\p{Script=Latin}/gu) || [];
  if (letters.length > 5 && latin.length / letters.length < 0.65) {
    throw new DescriptionError("wrong_language", "Model មិនបានឆ្លើយជា English ទេ។ សូមសាកម្តងទៀត។");
  }
  if (placeholders.has(normalized(value))) throw invalid();
}

/** @param {any} result @param {{submittedTexts?: string[]}} options */
export function validateDescription(result, { submittedTexts = [] } = {}) {
  if (!result || typeof result !== "object" || Array.isArray(result)) throw invalid();
  if (typeof result.refusal === "string") requireText("I cannot provide this description.");
  const keys = (value, required) => value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === required.length && required.every(key => Object.hasOwn(value, key));
  if (!keys(result, ["summary", "sections", "evidence", "prompt"]) || !keys(result.sections, SECTION_KEYS) ||
      !keys(result.evidence, ["confirmed", "uncertain"]) ||
      !Array.isArray(result.evidence.confirmed) || !Array.isArray(result.evidence.uncertain)) throw invalid();
  const observations = [result.summary, ...SECTION_KEYS.map(key => result.sections[key]), ...result.evidence.confirmed, ...result.evidence.uncertain];
  for (const value of [...observations, result.prompt]) requireText(value);
  const submitted = submittedTexts.filter(value => typeof value === "string" && value.trim().length >= 20).map(normalized);
  if (observations.some(value => instruction.test(value.trim()) || submitted.includes(normalized(value))) || submitted.includes(normalized(result.prompt))) {
    throw new DescriptionError("instruction_echo", "Model បានសរសេរការណែនាំ ជំនួសការវិភាគរូបភាព។ សូមសាកម្តងទៀត។");
  }
  if (/^(?:please\s+)?(?:generate|write|provide|create|produce)\s+(?:(?:a|an|the|detailed|visual|minimalist|structured|faithful|complete)\s+){0,6}(?:description|analysis|caption)\b/i.test(result.prompt.trim())) {
    throw new DescriptionError("invalid_reconstruction", "Prompt ពី model ស្នើឲ្យសរសេរការពិពណ៌នា ជំនួសការបង្កើតរូបឡើងវិញ។ សូមសាកម្តងទៀត។");
  }
  if (new Set(SECTION_KEYS.map(key => normalized(result.sections[key]))).size === 1) throw invalid();
  if (result.evidence.confirmed.some(value => /\b(?:may be|might|could be|possibly|probably|appears to|seems to)\b/i.test(value))) {
    throw new DescriptionError("uncertain_evidence", "Model បានដាក់ការទាយក្នុងភស្តុតាងច្បាស់លាស់។ សូមសាកម្តងទៀត។");
  }
  return result;
}

export function parseDescriptionText(text, options) {
  if (typeof text !== "string" || !text.trim()) throw new DescriptionError("missing_output", "Model មិនបានផ្តល់លទ្ធផលទេ។ សូមសាកម្តងទៀត។");
  if (refusal.test(text.trim())) requireText(text);
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new DescriptionError("invalid_json", "លទ្ធផលពី model មិនមែនជា JSON ពេញលេញទេ។ សូមសាកម្តងទៀត។"); }
  return validateDescription(parsed, options);
}

// The local bridge and the cloud route both answer with { description, model, provider }.
// Verify that envelope so a payload missing the actual generated analysis fails explicitly
// instead of being treated as a successful result downstream.
export function validateProviderResult(result, options) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new DescriptionError("invalid_description", "លទ្ធផលពី provider មិនត្រឹមត្រូវទេ។ សូមសាកម្តងទៀត។");
  }
  const description = validateDescription(result.description, options);
  if (typeof result.model !== "string" || !result.model.trim()) {
    throw new DescriptionError("missing_model_identity", "លទ្ធផលគ្មានឈ្មោះ model ដែលបង្កើតទេ។ សូមសាកម្តងទៀត។");
  }
  return { ...result, description };
}

export function parseResponsesOutput(payload, options) {
  if (payload?.status === "incomplete") throw new DescriptionError("truncated_output", "លទ្ធផលត្រូវបានកាត់មុនចប់។ សូមជ្រើសកម្រិតខ្លីជាងមុន។");
  if (payload?.status === "failed" || payload?.error) throw new DescriptionError("provider_error", "Vision provider មិនអាចបញ្ចប់សំណើនេះបានទេ។");
  const parts = [];
  for (const item of payload?.output || []) {
    if (item.status && item.status !== "completed") throw new DescriptionError("incomplete_message", "Model មិនបានបញ្ចប់លទ្ធផលទេ។ សូមសាកម្តងទៀត។");
    for (const content of item.content || []) {
      if (content.type === "refusal") throw new DescriptionError("model_refusal", "Model មិនបានផ្តល់ការវិភាគរូបនេះទេ។ សូមជ្រើសរូបផ្សេង។");
      if (content.type === "output_text" && typeof content.text === "string") parts.push(content.text);
    }
  }
  return parseDescriptionText(typeof payload?.output_text === "string" && payload.output_text.trim() ? payload.output_text : parts.join(""), options);
}
