import { NextResponse } from "next/server";
import { readLimitedJson } from "@/lib/http-input.mjs";
import { chatWithQwen } from "@/lib/chat.mjs";
import { DescriptionError } from "@/lib/description-result.mjs";

export const runtime = "edge";
// Chat payloads are plain text only — keep the request cap small.
const MAX_REQUEST_BYTES = 128 * 1024;
const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  request.signal.addEventListener("abort", abort, { once: true });
  if (request.signal.aborted) abort();
  const timeout = setTimeout(abort, 90_000);
  try {
    const body = await readLimitedJson(request, MAX_REQUEST_BYTES);
    // chatWithQwen is plain JavaScript; keep the call untyped like the sibling .mjs imports.
    const options = { signal: controller.signal, fetchImpl: (url: string | URL | Request, init: RequestInit) => fetch(url, init) };
    return json(await (chatWithQwen as (body: unknown, options: unknown) => Promise<unknown>)(body, options));
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return json({ code: "model_timeout", error: "ចម្លើយចំណាយពេលយូរពេក។ សូមសាកម្តងទៀត។" }, 504);
    }
    if (error instanceof DescriptionError) return json({ code: error.code, error: error.message }, error.status);
    console.error("Chat request failed", error instanceof Error ? error.name : "unknown");
    return json({ code: "provider_error", error: "មានបញ្ហាក្នុងការឆ្លើយ។ សូមត្រួតពិនិត្យថា Qwen កំពុងដំណើរការ រួចសាកម្តងទៀត។" }, 502);
  } finally {
    clearTimeout(timeout);
    request.signal.removeEventListener("abort", abort);
  }
}
