import { NextResponse } from "next/server";
import { describeWithOpenAI } from "@/lib/openai-vision.mjs";
import { readLimitedJson } from "@/lib/http-input.mjs";
import { DescriptionError } from "@/lib/description-result.mjs";

export const runtime = "edge";
const MAX_REQUEST_BYTES = 14 * 1024 * 1024;
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  request.signal.addEventListener("abort", abort, { once: true });
  if (request.signal.aborted) abort();
  const timeout = setTimeout(abort, 75_000);
  try {
    const body = await readLimitedJson(request, MAX_REQUEST_BYTES);
    return json(await describeWithOpenAI(body, {
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_VISION_MODEL || "gpt-5.1",
      signal: controller.signal,
    }));
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") return json({ code: "model_timeout", error: "ការវិភាគត្រូវបានផ្អាក ឬចំណាយពេលយូរពេក។ សូមសាកម្តងទៀត។" }, 504);
    if (error instanceof DescriptionError) return json({ code: error.code, error: error.message }, error.status);
    console.error("Image description failed", error instanceof Error ? error.name : "unknown");
    return json({ code: "provider_error", error: "មានបញ្ហាក្នុងការវិភាគរូបភាព។ សូមសាកម្តងទៀត។" }, 502);
  } finally {
    clearTimeout(timeout);
    request.signal.removeEventListener("abort", abort);
  }
}
