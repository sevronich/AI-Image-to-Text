import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { request as httpRequest } from "node:http";
import { buildOpenAIRequest, describeWithOpenAI } from "../../lib/openai-vision.mjs";
import { describeWithQwen } from "../../lib/qwen.mjs";
import { readLimitedJson } from "../../lib/http-input.mjs";
import { createBridge } from "../../scripts/qwen-bridge.mjs";
import { SITE_ORIGIN } from "../../lib/qwen.mjs";
import { shapesDescription } from "../fixtures/descriptions.mjs";

const image = "data:image/png;base64,iVBORw0KGgo=";
test("cloud request carries the actual image separately from preferences and schema", () => {
  const body = buildOpenAIRequest({ image, detail: "deep", customInstructions: "Focus on background" }, "configured-model");
  assert.equal(body.model, "configured-model");
  assert.equal(body.input[0].content[1].image_url, image);
  assert.equal(body.input[0].content[1].type, "input_image");
  assert.match(body.input[0].content[0].text, /Focus on background/);
  assert.match(body.instructions, /English only/);
  assert.equal(body.text.format.schema.properties.sections.required.length, 6);
});
test("cloud adapter displays parsed model output rather than the input instructions", async () => {
  const raw = { status: "completed", model: "returned-model", output: [{ type: "message", status: "completed", content: [{ type: "output_text", text: JSON.stringify(shapesDescription) }] }] };
  let captured;
  const result = await describeWithOpenAI({ image, customInstructions: "Describe every visible object" }, {
    apiKey: "test-only", onResponse: value => { captured = value; },
    fetchImpl: async (url, options) => {
      assert.equal(url, "https://api.openai.com/v1/responses");
      assert.equal(options.headers.Authorization, "Bearer test-only");
      assert.equal(JSON.parse(options.body).input[0].content[1].image_url, image);
      return new Response(JSON.stringify(raw));
    },
  });
  assert.deepEqual(captured, raw); assert.deepEqual(result.description, shapesDescription);
  assert.equal(result.model, "returned-model");
  assert.notEqual(result.description.summary, "Describe every visible object");
});
test("cloud adapter classifies exhausted credits, refusal and incomplete output without returning a description", async () => {
  for (const [payload, status, expected] of [
    [{ error: { code: "credit_balance_exhausted" } }, 429, "quota_exhausted"],
    [{ status: "incomplete", output_text: JSON.stringify(shapesDescription) }, 200, "truncated_output"],
    [{ status: "completed", output: [{ content: [{ type: "refusal" }] }] }, 200, "model_refusal"],
  ]) {
    await assert.rejects(describeWithOpenAI({ image }, { apiKey: "test-only", fetchImpl: async () => new Response(JSON.stringify(payload), { status }) }), error => error.code === expected);
  }
});
test("both adapters propagate cancellation instead of producing success", async () => {
  for (const generate of [describeWithOpenAI, describeWithQwen]) {
    const controller = new AbortController();
    const pending = generate({ image }, { apiKey: "test-only", signal: controller.signal, fetchImpl: async (_, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      controller.abort();
    }) });
    await assert.rejects(pending, error => error.name === "AbortError");
  }
});
test("cloud body limits apply to actual streamed UTF-8 bytes without Content-Length", async () => {
  const bytes = new TextEncoder().encode(JSON.stringify({ text: "ខ្មែរ".repeat(10) }));
  const request = new Request("http://localhost/", { method: "POST", duplex: "half", body: new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } }) });
  await assert.rejects(readLimitedJson(request, 50), error => error.status === 413);
  await assert.rejects(readLimitedJson(new Request("http://localhost/", { method: "POST", body: "{" }), 50), error => error.status === 400);
});
test("bridge timeout returns 504 and releases the slot for the next analysis", async t => {
  let count = 0;
  const bridge = createBridge({ timeoutMs: 15, generate: async (_, { signal }) => {
    if (count++ === 0) await new Promise((resolve, reject) => signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }));
    return { description: shapesDescription };
  } });
  bridge.listen(0, "127.0.0.1"); await once(bridge, "listening"); t.after(() => bridge.close());
  const post = () => new Promise((resolve, reject) => {
    const req = httpRequest(`http://127.0.0.1:${bridge.address().port}/describe`, { method: "POST", headers: { Host: "127.0.0.1:8765", Origin: SITE_ORIGIN, "Content-Type": "application/json" } }, res => {
      const chunks = []; res.on("data", chunk => chunks.push(chunk)); res.on("end", () => resolve({ status: res.statusCode, payload: JSON.parse(Buffer.concat(chunks).toString()) }));
    }); req.on("error", reject); req.end(JSON.stringify({ image }));
  });
  const first = await post(); assert.equal(first.status, 504); assert.equal(first.payload.code, "model_timeout");
  assert.equal((await post()).status, 200);
});
