import { DESCRIPTION_SCHEMA, SECTION_KEYS, SYSTEM_PROMPT, buildInputText, normalizeDetail, validateImageDataUrl } from "./description.mjs";

export const QWEN_MODEL = "Qwen3.5-4B-Q4_K_M";
export const LOCAL_ORIGIN = "http://127.0.0.1:8765";
export const SITE_ORIGIN = "https://chitra-ai-studio-20261025.zanybowl20.chatgpt.site";
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_REQUEST_BYTES = 14 * 1024 * 1024;

export function validateLocalInput(body) {
  if (!body || !validateImageDataUrl(body.image)) throw new Error("សូមជ្រើសរើសរូបភាព PNG, JPEG, WEBP ឬ GIF។");
  const encoded = body.image.slice(body.image.indexOf(",") + 1).replace(/\s/g, "");
  const bytes = Math.floor(encoded.length * 3 / 4) - (encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0);
  if (bytes > MAX_IMAGE_BYTES) throw new Error("រូបភាពធំពេក។ ទំហំអតិបរមាគឺ 10MB។");
  return body;
}

export function buildQwenRequest(body) {
  validateLocalInput(body);
  const detail = normalizeDetail(body.detail);
  return {
    model: QWEN_MODEL,
    stream: false,
    temperature: 0.3,
    top_p: 0.9,
    max_tokens: detail === "deep" ? 4000 : detail === "concise" ? 2000 : 3000,
    chat_template_kwargs: { enable_thinking: false },
    messages: [
      { role: "system", content: SYSTEM_PROMPT + "\nReturn only the requested JSON. Keep prose focused and avoid repetition." },
      { role: "user", content: [
        { type: "text", text: buildInputText(body) },
        { type: "image_url", image_url: { url: body.image } },
      ] },
    ],
    response_format: { type: "json_schema", schema: DESCRIPTION_SCHEMA },
  };
}

export function parseQwenResponse(payload) {
  const choice = payload?.choices?.[0];
  if (choice?.finish_reason === "length") throw new Error("លទ្ធផលវែងពេក។ សូមជ្រើសកម្រិតខ្លី ហើយសាកម្ដងទៀត។");
  const content = choice?.message?.content;
  if (typeof content !== "string") throw new Error("Model មិនបានផ្តល់លទ្ធផលទេ។");
  const result = JSON.parse(content);
  const bilingual = value => value && typeof value.km === "string" && value.km.trim() && typeof value.en === "string" && value.en.trim();
  if (!bilingual(result.summary) || !bilingual(result.prompt) ||
      !SECTION_KEYS.every(key => bilingual(result.sections?.[key])) ||
      !["confirmed", "uncertain"].every(key => Array.isArray(result.evidence?.[key]) && result.evidence[key].every(bilingual))) {
    throw new Error("លទ្ធផលមិនមានរចនាសម្ព័ន្ធពីរភាសាគ្រប់គ្រាន់ទេ។ សូមសាកម្ដងទៀត។");
  }
  return result;
}

export async function describeWithQwen(body, { baseUrl = "http://127.0.0.1:8081", apiKey, signal, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(baseUrl + "/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
    signal,
    body: JSON.stringify(buildQwenRequest(body)),
  });
  if (!response.ok) throw new Error(`Local vision model returned HTTP ${response.status}.`);
  return { description: parseQwenResponse(await response.json()), model: QWEN_MODEL, provider: "local", source: "unsloth/Qwen3.5-4B-GGUF" };
}
