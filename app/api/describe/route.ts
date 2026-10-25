import { NextResponse } from "next/server";
import {
  DESCRIPTION_SCHEMA,
  SYSTEM_PROMPT,
  buildInputText,
  normalizeDetail,
  validateImageDataUrl,
} from "@/lib/description.mjs";

export const runtime = "edge";
const MAX_REQUEST_BYTES = 14 * 1024 * 1024;

type OpenAIResponsePayload = {
  output_text?: string;
  model?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  error?: { code?: string };
};

type RequestBody = {
  image?: unknown;
  detail?: unknown;
  preset?: unknown;
  customInstructions?: unknown;
};

function extractOutputText(payload: OpenAIResponsePayload): string | null {
  if (typeof payload?.output_text === "string") return payload.output_text;
  for (const item of payload?.output ?? []) {
    for (const content of item?.content ?? []) {
      if (content?.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  return null;
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > MAX_REQUEST_BYTES) {
    return NextResponse.json({ error: "រូបភាពធំពេក។ សូមប្រើឯកសារតូចជាង 10MB។" }, { status: 413 });
  }

  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "សំណើមិនត្រឹមត្រូវ។" }, { status: 400 });
  }
  if (!validateImageDataUrl(body?.image)) {
    return NextResponse.json({ error: "សូមជ្រើសរើសរូបភាព PNG, JPEG, WEBP ឬ GIF។" }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Server មិនទាន់បានកំណត់ OPENAI_API_KEY ទេ។" }, { status: 503 });

  const detail = normalizeDetail(body?.detail);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 75_000);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: process.env.OPENAI_VISION_MODEL || "gpt-5.1",
        instructions: SYSTEM_PROMPT,
        input: [{
          role: "user",
          content: [
            { type: "input_text", text: buildInputText({ detail, preset: body?.preset, customInstructions: body?.customInstructions }) },
            { type: "input_image", image_url: body.image, detail: detail === "deep" ? "high" : "auto" },
          ],
        }],
        text: { format: { type: "json_schema", name: "image_description", strict: true, schema: DESCRIPTION_SCHEMA } },
        reasoning: { effort: detail === "deep" ? "high" : "medium" },
        max_output_tokens: detail === "deep" ? 6500 : detail === "concise" ? 2500 : 4200,
      }),
    });

    const payload = (await response.json()) as OpenAIResponsePayload;
    if (!response.ok) {
      const status = response.status === 429 ? 429 : 502;
      const message = response.status === 429
        ? "មានសំណើច្រើនពេក ឬ API quota មិនគ្រប់។ សូមរង់ចាំបន្តិចហើយសាកម្តងទៀត។"
        : "Vision model មិនអាចវិភាគរូបភាពនេះបានទេ។ សូមសាកម្តងទៀត។";
      console.error("OpenAI response error", response.status, payload?.error?.code || "unknown");
      return NextResponse.json({ error: message }, { status });
    }

    const text = extractOutputText(payload);
    if (!text) throw new Error("Model returned no output text");
    return NextResponse.json({ description: JSON.parse(text), model: payload.model || process.env.OPENAI_VISION_MODEL || "gpt-5.1" });
  } catch (error) {
    console.error("Image description failed", error instanceof Error ? error.message : "unknown");
    const message = error instanceof Error && error.name === "AbortError"
      ? "ការវិភាគចំណាយពេលយូរពេក។ សូមសាកម្តងទៀត។"
      : "មានបញ្ហាក្នុងការវិភាគរូបភាព។ សូមពិនិត្យការតភ្ជាប់ ហើយសាកម្តងទៀត។";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    clearTimeout(timeout);
  }
}
