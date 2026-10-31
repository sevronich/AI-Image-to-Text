import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { request as httpRequest } from "node:http";
import { buildQwenRequest, parseQwenResponse, describeWithQwen, validateLocalInput, SITE_ORIGIN } from "../lib/qwen.mjs";
import { createBridge } from "../scripts/qwen-bridge.mjs";

const image = "data:image/png;base64,iVBORw0KGgo=";
const pair = "Test description";
const fixture = {
  summary: pair,
  sections: Object.fromEntries(["appearance", "clothing", "pose", "composition", "style", "mood"].map(key => [key, pair])),
  evidence: { confirmed: [pair], uncertain: [] },
  prompt: pair,
};
const payload = { choices: [{ finish_reason: "stop", message: { content: JSON.stringify(fixture) } }] };
const localRequest = (url, { method = "GET", headers, body } = {}) => new Promise((resolve, reject) => {
  const req = httpRequest(url, { method, headers }, res => {
    const chunks = [];
    res.on("data", chunk => chunks.push(chunk));
    res.on("end", () => resolve(new Response([204, 304].includes(res.statusCode) ? null : Buffer.concat(chunks), { status: res.statusCode, headers: res.headers })));
  });
  req.on("error", reject);
  req.end(body);
});

test("Qwen analyzes the actual image in English without requesting Khmer generation", () => {
  const request = buildQwenRequest({ image, detail: "concise", preset: "faithful" });
  assert.equal(request.messages[1].content[1].image_url.url, image);
  assert.equal(request.chat_template_kwargs.enable_thinking, false);
  assert.equal(request.response_format.schema.required.includes("sections"), true);
  assert.equal(request.response_format.schema.properties.summary.type, "string");
  assert.match(request.messages[0].content, /English only/);
  assert.doesNotMatch(request.messages[0].content, /[\u1780-\u17ff]/);
  assert.ok(request.max_tokens < 3600);
  assert.equal("api_key" in request, false);
});
test("Qwen response parser rejects truncated, missing and obsolete bilingual descriptions", () => {
  assert.throws(() => parseQwenResponse({ choices: [{ finish_reason: "length" }] }));
  assert.throws(() => parseQwenResponse({ choices: [{ message: { content: "{}" } }] }));
  assert.deepEqual(parseQwenResponse(payload), fixture);
  assert.throws(() => parseQwenResponse({ choices: [{ message: { content: JSON.stringify({ ...fixture, summary: { en: "English", km: "ខ្មែរ" } }) } }] }));
});
test("remote image URLs cannot trigger local SSRF", () => {
  assert.throws(() => validateLocalInput({ image: "http://127.0.0.1/private" }));
});

test("loading model returns an actionable error without attempting inference", async t => {
  const bridge = createBridge({ ready: async () => false, generate: async () => { assert.fail("Model is not ready"); } });
  bridge.listen(0, "127.0.0.1");
  await once(bridge, "listening");
  t.after(() => bridge.close());
  const response = await localRequest(`http://127.0.0.1:${bridge.address().port}/describe`, {
    method: "POST", headers: { Host: "127.0.0.1:8765", Origin: SITE_ORIGIN, "Content-Type": "application/json" },
    body: JSON.stringify({ image }),
  });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /Qwen/);
});
test("image payload limit is checked independently of Content-Length", () => {
  assert.throws(() => validateLocalInput({ image: "data:image/png;base64," + "A".repeat(14 * 1024 * 1024) }));
});
test("provider adapter posts to local vision endpoint and preserves actual model output", async () => {
  let called = false;
  const result = await describeWithQwen({ image }, {
    apiKey: "test-only",
    fetchImpl: async (url, options) => {
      called = true;
      assert.equal(url, "http://127.0.0.1:8081/v1/chat/completions");
      assert.equal(options.headers.Authorization, "Bearer test-only");
      assert.equal(JSON.parse(options.body).messages[1].content[1].image_url.url, image);
      return new Response(JSON.stringify(payload), { status: 200 });
    },
  });
  assert.equal(called, true);
  assert.deepEqual(result.description, fixture);
});
test("local bridge allows the private site while denying unrelated websites and DNS rebinding", async t => {
  let generated = 0;
  const bridge = createBridge({ generate: async () => { generated++; return { description: fixture }; } });
  bridge.listen(0, "127.0.0.1");
  await once(bridge, "listening");
  t.after(() => bridge.close());
  const address = bridge.address();
  const url = `http://127.0.0.1:${address.port}`;
  const headers = { Host: "127.0.0.1:8765", Origin: SITE_ORIGIN, "Content-Type": "application/json" };
  const options = { method: "POST", headers, body: JSON.stringify({ image }) };
  const badOrigin = await localRequest(url + "/describe", { ...options, headers: { ...headers, Origin: "https://unrelated.example" } });
  assert.equal(badOrigin.status, 403);
  const badHost = await localRequest(url + "/describe", { ...options, headers: { ...headers, Host: "attacker.example:8765" } });
  assert.equal(badHost.status, 403);
  const noOrigin = await localRequest(url + "/describe", { ...options, headers: { Host: headers.Host, "Content-Type": "application/json" } });
  assert.equal(noOrigin.status, 403);
  const preflight = await localRequest(url + "/describe", { method: "OPTIONS", headers });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), SITE_ORIGIN);
  const success = await localRequest(url + "/describe", options);
  assert.equal(success.status, 200);
  assert.equal(success.headers.get("cache-control"), "no-store");
  assert.equal(generated, 1);
});

test("local bridge releases the request slot after malformed JSON", async t => {
  const bridge = createBridge({ generate: async () => ({ description: fixture }) });
  bridge.listen(0, "127.0.0.1");
  await once(bridge, "listening");
  t.after(() => bridge.close());
  const url = `http://127.0.0.1:${bridge.address().port}/describe`;
  const headers = { Host: "127.0.0.1:8765", Origin: SITE_ORIGIN, "Content-Type": "application/json" };
  assert.equal((await localRequest(url, { method: "POST", headers, body: "{" })).status, 400);
  assert.equal((await localRequest(url, { method: "POST", headers, body: JSON.stringify({ image }) })).status, 200);
});

test("local bridge refuses a second analysis while the first is running", async t => {
  let release;
  let started;
  const active = new Promise(resolve => { started = resolve; });
  const bridge = createBridge({ generate: async () => { started(); await new Promise(resolve => { release = resolve; }); return { description: fixture }; } });
  bridge.listen(0, "127.0.0.1");
  await once(bridge, "listening");
  t.after(() => bridge.close());
  const url = `http://127.0.0.1:${bridge.address().port}/describe`;
  const options = { method: "POST", headers: { Host: "127.0.0.1:8765", Origin: SITE_ORIGIN, "Content-Type": "application/json" }, body: JSON.stringify({ image }) };
  const first = localRequest(url, options);
  await active;
  assert.equal((await localRequest(url, options)).status, 429);
  release();
  assert.equal((await first).status, 200);
});
