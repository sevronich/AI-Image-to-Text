import { DescriptionError } from "./description-result.mjs";

export async function readLimitedJson(request, limit) {
  if (Number(request.headers.get("content-length") || 0) > limit) throw new DescriptionError("request_too_large", "រូបភាពធំពេក។ សូមប្រើឯកសារតូចជាង 10MB។", 413);
  if (!request.body) throw new DescriptionError("invalid_request", "សំណើមិនត្រឹមត្រូវ។", 400);
  const reader = request.body.getReader();
  const chunks = []; let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > limit) { await reader.cancel().catch(() => {}); throw new DescriptionError("request_too_large", "រូបភាពធំពេក។ សូមប្រើឯកសារតូចជាង 10MB។", 413); }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  const combined = new Uint8Array(bytes); let offset = 0;
  for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(combined)); }
  catch { throw new DescriptionError("invalid_json_request", "សំណើមិនមែនជា JSON ត្រឹមត្រូវទេ។", 400); }
}
