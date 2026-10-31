import { DESCRIPTION_SCHEMA, SYSTEM_PROMPT, buildInputText, normalizeDetail, imageByteLength } from "./description.mjs";
import { DescriptionError, parseResponsesOutput, validateProviderResult } from "./description-result.mjs";

export function buildOpenAIRequest(body, model) {
  const bytes = imageByteLength(body?.image);
  if (bytes === null) throw new DescriptionError("invalid_image", "សូមជ្រើសរើសរូបភាព PNG, JPEG, WEBP ឬ GIF។", 400);
  if (bytes > 10 * 1024 * 1024) throw new DescriptionError("image_too_large", "រូបភាពធំពេក។ ទំហំអតិបរមាគឺ 10MB។", 413);
  const detail = normalizeDetail(body.detail);
  return {
    model,
    instructions: SYSTEM_PROMPT,
    input: [{ role: "user", content: [
      { type: "input_text", text: buildInputText(body) },
      { type: "input_image", image_url: body.image, detail: detail === "deep" ? "high" : "auto" },
    ] }],
    text: { format: { type: "json_schema", name: "image_description", strict: true, schema: DESCRIPTION_SCHEMA } },
    reasoning: { effort: detail === "deep" ? "high" : "medium" },
    max_output_tokens: detail === "deep" ? 6500 : detail === "concise" ? 2500 : 4200,
  };
}

/** @param {any} body @param {{apiKey?: string, model?: string, signal?: AbortSignal, fetchImpl?: typeof fetch, onResponse?: (payload: any) => void}} options */
export async function describeWithOpenAI(body, { apiKey, model = "gpt-5.1", signal, fetchImpl = fetch, onResponse } = {}) {
  const request = buildOpenAIRequest(body, model);
  if (!apiKey) throw new DescriptionError("missing_api_key", "Server មិនទាន់បានកំណត់ OPENAI_API_KEY ទេ។", 503);
  const response = await fetchImpl("https://api.openai.com/v1/responses", {
    method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    signal, body: JSON.stringify(request),
  });
  const payload = await response.json();
  if (!response.ok) {
    const exhausted = ["insufficient_quota", "credit_balance_exhausted"].includes(payload?.error?.code);
    throw new DescriptionError(exhausted ? "quota_exhausted" : "provider_error",
      exhausted ? "OpenAI credits មិនគ្រប់។ អ្នកអាចជ្រើស Qwen លើ PC ដើម្បីបន្ត។" : response.status === 429 ? "មានសំណើច្រើនពេក។ សូមរង់ចាំបន្តិច ហើយសាកម្តងទៀត។" : "Vision provider មិនអាចបញ្ចប់សំណើនេះបានទេ។",
      response.status === 429 ? 429 : 502);
  }
  onResponse?.(payload);
  const submittedTexts = [SYSTEM_PROMPT, buildInputText(body)];
  return validateProviderResult({ description: parseResponsesOutput(payload, { submittedTexts }), model: payload.model || model, provider: "openai" }, { submittedTexts });
}
