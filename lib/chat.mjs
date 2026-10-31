// Plain-text chat helpers for the local Qwen model.
// Deliberately independent from the structured-description pipeline:
// chat replies are ordinary text and must never pass through the JSON validator.

import { DescriptionError } from "./description-result.mjs";
import { QWEN_MODEL } from "./qwen.mjs";

export const CHAT_SYSTEM_PROMPT =
  "You are a friendly assistant running locally on the user's computer. " +
  "Answer the user's question directly in plain conversational text. " +
  "Never output JSON, schemas, or instructions back to the user. " +
  "Reply in the same language the user writes in (ខ្មែរ ឬ English).";

export const MAX_MESSAGES = 20;
export const MAX_MESSAGE_CHARS = 4000;
export const MAX_TOTAL_CHARS = 24000;

// Validate the chat request shape before it ever reaches llama-server.
export function validateChatInput(body) {
  const messages = body?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new DescriptionError("invalid_chat_request", "សំណើឆាតមិនត្រឹមត្រូវទេ។", 400);
  }
  if (messages.length > MAX_MESSAGES) {
    throw new DescriptionError("chat_too_long", "ប្រវត្តិសន្ទនាយาวពេក។ សូមចាប់ផ្តើមសន្ទនាថ្មី។", 413);
  }
  let total = 0;
  for (const message of messages) {
    if (!message || typeof message.content !== "string" || !message.content.trim()) {
      throw new DescriptionError("invalid_chat_request", "សារនីមួយៗត្រូវតែមានអត្ថបទ។", 400);
    }
    if (!["user", "assistant"].includes(message.role)) {
      throw new DescriptionError("invalid_chat_request", "តួនាទីសារមិនត្រឹមត្រូវទេ។", 400);
    }
    if (message.content.length > MAX_MESSAGE_CHARS) {
      throw new DescriptionError("chat_message_too_long", "សារមួយយาวពេក។ សូមសរសេរខ្លីជាងមុន។", 413);
    }
    total += message.content.length;
  }
  if (total > MAX_TOTAL_CHARS) {
    throw new DescriptionError("chat_too_long", "ប្រវត្តិសន្ទនាយาวពេក។ សូមចាប់ផ្តើមសន្ទនាថ្មី។", 413);
  }
  return { messages };
}

// Build an OpenAI-compatible plain-text chat request for llama-server.
export function buildChatRequest(validated) {
  return {
    model: QWEN_MODEL,
    stream: false,
    cache_prompt: true,
    temperature: 0.7,
    top_p: 0.9,
    max_tokens: 800,
    chat_template_kwargs: { enable_thinking: false },
    messages: [
      { role: "system", content: CHAT_SYSTEM_PROMPT },
      ...validated.messages,
    ],
  };
}

// Extract the assistant reply as plain text; no schema validation applied.
export function parseChatResponse(payload) {
  const choice = payload?.choices?.[0];
  if (!choice) {
    throw new DescriptionError("provider_error", "Local model មិនបានផ្តល់ចម្លើយទេ។ សូមសាកម្តងទៀត។", 502);
  }
  if (choice.message?.refusal || choice.finish_reason === "content_filter") {
    throw new DescriptionError("model_refusal", "Model មិនបានឆ្លើយសំណួរនេះទេ។ សូមសាកសំណួរផ្សេង។", 422);
  }
  if (choice.finish_reason !== "stop" && choice.finish_reason !== "length") {
    throw new DescriptionError("incomplete_output", "Model មិនបានបញ្ចប់ចម្លើយទេ។ សូមសាកម្តងទៀត។", 502);
  }
  const text = typeof choice.message?.content === "string" ? choice.message.content.trim() : "";
  if (!text) {
    throw new DescriptionError("empty_response", "Model បានផ្តល់ចម្លើយទទេ។ សូមសាកម្តងទៀត។", 502);
  }
  return { reply: text, truncated: choice.finish_reason === "length", model: QWEN_MODEL };
}

// Send a chat conversation to the local llama-server instance.
export async function chatWithQwen(
  body,
  { baseUrl = "http://127.0.0.1:8081", apiKey, signal, fetchImpl = globalThis.fetch } = {}
) {
  const validated = validateChatInput(body);
  const request = buildChatRequest(validated);
  const response = await fetchImpl(baseUrl + "/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    signal: signal ?? undefined,
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    const failure = await response.json().catch(() => null);
    const reason = typeof failure?.error?.message === "string" ? failure.error.message : "";
    if (response.status === 400) {
      throw new DescriptionError(
        "model_request_rejected",
        /context|token|length/i.test(reason)
          ? "ការសន្ទនាយาวពេកសម្រាប់ model។ សូមចាប់ផ្តើមសន្ទនាថ្មី។"
          : "Qwen មិនអាចឆ្លើយសំណើនេះបានទេ។ សូមសាកម្តងទៀត។",
        400
      );
    }
    throw new DescriptionError("provider_error", `Local chat model returned HTTP ${response.status}.`, response.status === 503 ? 503 : 502);
  }
  const payload = await response.json();
  return parseChatResponse(payload);
}
