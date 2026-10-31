
import {
  DESCRIPTION_SCHEMA,
  SYSTEM_PROMPT,
  buildInputText,
  normalizeDetail,
  validateImageDataUrl,
} from "./description.mjs";
import { DescriptionError, parseDescriptionText, validateProviderResult } from "./description-result.mjs";

export const QWEN_MODEL = "Qwen3.5-4B-Q4_K_M";

export const LOCAL_ORIGIN = "http://127.0.0.1:8765";

export const SITE_ORIGIN =
  "https://chitra-ai-studio-20261025.sevronich999.chatgpt.site";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export const MAX_REQUEST_BYTES = 14 * 1024 * 1024;

// Validate image format and file size.
export function validateLocalInput(body) {
  if (!body || !validateImageDataUrl(body.image)) {
    throw new DescriptionError("invalid_image",
      "សូមជ្រើសរើសរូបភាព PNG, JPEG, WEBP ឬ GIF។"
      , 400
    );
  }

  const encoded = body.image
    .slice(body.image.indexOf(",") + 1)
    .replace(/\s/g, "");

  const bytes =
    Math.floor((encoded.length * 3) / 4) -
    (encoded.endsWith("==")
      ? 2
      : encoded.endsWith("=")
        ? 1
        : 0);

  if (bytes > MAX_IMAGE_BYTES) {
    throw new DescriptionError("image_too_large",
      "រូបភាពធំពេក។ ទំហំអតិបរមាគឺ 10MB។"
      , 413
    );
  }

  return body;
}

// Build OpenAI-compatible request for llama-server.
export function buildQwenRequest(body) {
  validateLocalInput(body);

  const detail = normalizeDetail(body.detail);

  const schema = structuredClone(DESCRIPTION_SCHEMA);

  const bound = (node) => {
    if (node.type === "string") {
      node.maxLength =
        detail === "concise"
          ? 350
          : detail === "deep"
            ? 1400
            : 800;
    }

    for (const child of Object.values(node.properties || {})) {
      bound(child);
    }

    if (node.items) bound(node.items);
  };

  bound(schema);

  schema.properties.prompt.maxLength *= 2;

  schema.properties.evidence.properties.confirmed.maxItems =
    detail === "concise" ? 3 : 5;

  schema.properties.evidence.properties.uncertain.maxItems =
    detail === "concise" ? 1 : 2;

  return {
    model: QWEN_MODEL,
    stream: false,
    cache_prompt: false,
    temperature: 0.3,
    top_p: 0.9,

    max_tokens:
      detail === "deep"
        ? 3200
        : detail === "concise"
          ? 1400
          : 2200,

    chat_template_kwargs: {
      enable_thinking: false,
    },

    messages: [
      {
        role: "system",
        content:
          SYSTEM_PROMPT +
          "\nAvoid vague praise and repetition. " +
          "Return only JSON matching this schema, using actual descriptions rather than schema definitions.\n" +
          JSON.stringify(DESCRIPTION_SCHEMA),
      },

      {
        role: "user",
        content: [
          {
            type: "text",

            text:
              buildInputText(body) +
              (detail === "concise"
                ? "\nUse just one short sentence per field. Limit confirmed evidence to 3 facts and uncertainty to 1 item. Keep the reconstruction prompt to 2 sentences."
                : "\nLimit confirmed evidence to 5 facts and uncertainty to 2 items. Keep each field focused."),
          },

          {
            type: "image_url",
            image_url: {
              url: body.image,
            },
          },
        ],
      },
    ],

    response_format: {
      type: "json_schema",
      schema,
    },
  };
}

// Parse and validate the model's structured JSON response.
export function parseQwenResponse(payload, options) {
  const choice = payload?.choices?.[0];

  if (choice?.finish_reason === "length") {
    throw new DescriptionError("truncated_output", "លទ្ធផលត្រូវបានកាត់មុនចប់។ សូមជ្រើសកម្រិតខ្លីជាងមុន។");
  }

  if (choice?.message?.refusal || choice?.finish_reason === "content_filter") throw new DescriptionError("model_refusal", "Model មិនបានផ្តល់ការវិភាគរូបនេះទេ។ សូមជ្រើសរូបផ្សេង។");
  if (choice?.finish_reason !== "stop") throw new DescriptionError("incomplete_output", "Model មិនបានបញ្ចប់លទ្ធផលទេ។ សូមសាកម្តងទៀត។");
  return parseDescriptionText(choice.message?.content, options);
}

// Server fallback for direct API callers; browser uploads also normalize WebP.
export async function normalizeImageForQwen(body) {
  validateLocalInput(body);

  if (body.image.startsWith("data:image/webp")) {
    try {
      const { default: sharp } = await import("sharp");

      const comma = body.image.indexOf(",");

      if (comma !== -1) {
        const inputBuf = Buffer.from(
          body.image.slice(comma + 1),
          "base64"
        );

        const pngBuf = await sharp(inputBuf, { limitInputPixels: 40000000, animated: false })
          .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
          .toFormat("png")
          .toBuffer();

        const normalized = {
          ...body,
          image: `data:image/png;base64,${pngBuf.toString("base64")}`,
        };
        validateLocalInput(normalized);
        return normalized;
      }
    } catch (error) {
      if (error instanceof DescriptionError) throw error;
      throw new DescriptionError("image_decode_failed", "មិនអាចបម្លែង WebP នេះបានទេ។ សូមជ្រើសរូបដែលបើកមើលបាន ឬប្រើ PNG/JPG។", 400);
    }
  }

  return body;
}

// Run image description through the local Qwen server.
export async function describeWithQwen(
  body,
  {
    baseUrl = "http://127.0.0.1:8081",
    apiKey,
    signal,
    fetchImpl = fetch,
    onResponse,
  } = {}
) {
  const preparedBody = await normalizeImageForQwen(body);
  const request = buildQwenRequest(preparedBody);

  const response = await fetchImpl(
    baseUrl + "/v1/chat/completions",
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",

        ...(apiKey
          ? {
              Authorization: `Bearer ${apiKey}`,
            }
          : {}),
      },

      signal,

      body: JSON.stringify(
        request
      ),
    }
  );

  if (!response.ok) {
    const failure = await response.json().catch(() => null);
    const reason = typeof failure?.error?.message === "string" ? failure.error.message : "";
    if (response.status === 400) throw new DescriptionError("model_request_rejected", /context|token|length/i.test(reason)
      ? "សំណើវែងពេកសម្រាប់ model។ សូមបន្ថយការណែនាំ ឬកម្រិតលម្អិត។"
      : "Qwen មិនអាចអានរូបនេះបានទេ។ សូមជ្រើសរូបឡើងវិញ ឬប្រើ PNG/JPG។", 400);
    throw new DescriptionError("provider_error", `Local vision model returned HTTP ${response.status}.`, response.status === 503 ? 503 : 502);
  }

  const payload = await response.json();
  if (!Array.isArray(payload?.choices) || !payload.choices.length) {
    // A 200 answer without any completion choice is a provider failure, never a success.
    throw new DescriptionError("provider_error", "Local vision model មិនបានផ្តល់ការបញ្ចប់ (completion) ទេ។ សូមសាកម្តងទៀត។", 502);
  }
  // Optional in-memory evaluation hook. Production does not log model payloads.
  onResponse?.(payload, {
    model: request.model,
    temperature: request.temperature,
    maxTokens: request.max_tokens,
    systemPrompt: request.messages[0].content,
    userInstructions: request.messages[1].content[0].text,
    imageMime: preparedBody.image.slice(5, preparedBody.image.indexOf(";")),
    imageBytes: Math.floor(preparedBody.image.slice(preparedBody.image.indexOf(",") + 1).length * 3 / 4),
  });
  return validateProviderResult({
    description: parseQwenResponse(payload, { submittedTexts: [SYSTEM_PROMPT, buildInputText(body)] }),

    model: QWEN_MODEL,

    provider: "local",

    source: "unsloth/Qwen3.5-4B-GGUF",
  }, { submittedTexts: [SYSTEM_PROMPT, buildInputText(body)] });
}
