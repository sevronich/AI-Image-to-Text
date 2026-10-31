import test from "node:test";
import assert from "node:assert/strict";
import {
  CHAT_SYSTEM_PROMPT,
  buildChatRequest,
  chatWithQwen,
  parseChatResponse,
  validateChatInput,
} from "../lib/chat.mjs";

const code = (expected) => (error) => error.code === expected;
const history = [{ role: "user", content: "Hello!" }, { role: "assistant", content: "Hi there." }];

test("chat request is plain text with a conversational system prompt and no JSON schema", () => {
  const request = buildChatRequest(validateChatInput({ messages: history }));
  assert.equal(request.messages[0].role, "system");
  assert.equal(request.messages[0].content, CHAT_SYSTEM_PROMPT);
  assert.deepEqual(request.messages.slice(1), history);
  assert.equal(request.response_format, undefined);
  assert.doesNotMatch(JSON.stringify(request), /json_schema|DESCRIPTION_SCHEMA/);
});

test("chat input rejects empty, malformed, oversized and unknown-role messages", () => {
  assert.throws(() => validateChatInput({}), code("invalid_chat_request"));
  assert.throws(() => validateChatInput({ messages: [] }), code("invalid_chat_request"));
  assert.throws(() => validateChatInput({ messages: [{ role: "user", content: "  " }] }), code("invalid_chat_request"));
  assert.throws(() => validateChatInput({ messages: [{ role: "system", content: "hack" }] }), code("invalid_chat_request"));
  assert.throws(() => validateChatInput({ messages: [{ role: "user", content: "x".repeat(4001) }] }), code("chat_message_too_long"));
  assert.throws(() => validateChatInput({ messages: Array.from({ length: 21 }, () => ({ role: "user", content: "hi" })) }), code("chat_too_long"));
});

test("plain completions are returned as text; truncated replies are flagged, not rejected", () => {
  const result = parseChatResponse({ choices: [{ message: { content: " បញ្ចូលសំណួរ " }, finish_reason: "length" }] });
  assert.equal(result.reply, "បញ្ចូលសំណួរ");
  assert.equal(result.truncated, true);
});

test("empty, missing-choice, refused and incomplete chat responses surface explicit errors", () => {
  assert.throws(() => parseChatResponse({ choices: [] }), code("provider_error"));
  assert.throws(() => parseChatResponse({ choices: [{ message: { content: "   " }, finish_reason: "stop" }] }), code("empty_response"));
  assert.throws(() => parseChatResponse({ choices: [{ message: { refusal: "no" }, finish_reason: "stop" }] }), code("model_refusal"));
  assert.throws(() => parseChatResponse({ choices: [{ message: { content: "partial" }, finish_reason: "content_filter" }] }), code("model_refusal"));
  assert.throws(() => parseChatResponse({ choices: [{ message: { content: "partial" }, finish_reason: "stopped_eos" }] }), code("incomplete_output"));
});

test("chatWithQwen posts to the local llama-server and never calls the description validator path", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ choices: [{ message: { content: "សួរបាន! ចម្លើយគឺ..." }, finish_reason: "stop" }] }), { status: 200 });
  };
  const result = await chatWithQwen({ messages: [{ role: "user", content: "Hi" }] }, { fetchImpl });
  assert.equal(calls[0].url, "http://127.0.0.1:8081/v1/chat/completions");
  assert.equal(calls[0].body.messages.at(-1).content, "Hi");
  assert.match(result.reply, /សួរបាន/);
  assert.equal(result.truncated, false);
});

test("chatWithQwen converts provider HTTP failures into explicit chat errors", async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ error: { message: "context exceeded token limit" } }), { status: 400 });
  await assert.rejects(chatWithQwen({ messages: [{ role: "user", content: "Hi" }] }, { fetchImpl }), code("model_request_rejected"));
  const unavailable = async () => new Response("{}", { status: 503 });
  await assert.rejects(chatWithQwen({ messages: [{ role: "user", content: "Hi" }] }, { fetchImpl: unavailable }), (error) => error.code === "provider_error" && error.status === 503);
});
