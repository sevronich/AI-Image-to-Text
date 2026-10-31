import { createServer } from "node:http";
import { describeWithQwen, MAX_REQUEST_BYTES, SITE_ORIGIN, QWEN_MODEL } from "../lib/qwen.mjs";

export const ALLOWED_ORIGINS = new Set([SITE_ORIGIN, "https://chitra-ai-studio-20261025.zanybowl20.chatgpt.site", "http://127.0.0.1:5173", "http://localhost:5173"]);

export function createBridge({ generate = describeWithQwen, ready = async () => true, apiKey } = {}) {
  let busy = false;
  return createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const origin = req.headers.origin;
    const host = req.headers.host || "";
    if (!["127.0.0.1:8765", "localhost:8765"].includes(host)) {
      res.writeHead(403).end(); return;
    }
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      res.writeHead(403).end(); return;
    }
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      // Older Chromium versions use this preflight; newer ones prompt for local-network access.
      res.setHeader("Access-Control-Allow-Private-Network", "true");
    }
    if (req.method === "OPTIONS") { res.writeHead(204).end(); return; }
    const json = (status, data) => {
      if (!res.destroyed) { res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(data)); }
    };
    if (req.method === "GET" && req.url === "/health") {
      const available = await ready().catch(() => false);
      json(available ? 200 : 503, { ready: available, model: QWEN_MODEL, busy }); return;
    }
    if (req.method !== "POST" || req.url !== "/describe") { json(404, { error: "Not found" }); return; }
    if (!origin || !ALLOWED_ORIGINS.has(origin) || !req.headers["content-type"]?.startsWith("application/json")) {
      json(403, { error: "Origin and JSON content type are required." }); return;
    }
    if (busy) { json(429, { error: "Model កំពុងវិភាគរូបមួយទៀត។ សូមរង់ចាំ។" }); return; }
    if (Number(req.headers["content-length"] || 0) > MAX_REQUEST_BYTES) { json(413, { error: "រូបភាពធំពេក។" }); return; }
    busy = true;
    const chunks = [];
    let bytes = 0;
    try {
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > MAX_REQUEST_BYTES) { json(413, { error: "រូបភាពធំពេក។" }); return; }
        chunks.push(chunk);
      }
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
      catch { json(400, { error: "Invalid JSON" }); return; }
      if (!await ready().catch(() => false)) {
        json(503, { error: "Qwen កំពុងផ្ទុក។ សូមរង់ចាំបន្តិច រួចពិនិត្យការភ្ជាប់ និងសាកម្តងទៀត។" }); return;
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 300000);
      res.once("close", () => { if (!res.writableEnded) controller.abort(); });
      try {
        const result = await generate(body, { apiKey, signal: controller.signal });
        json(200, result);
      } finally { clearTimeout(timeout); }
    } catch (error) {
      busy = false;
      json(502, { error: error.name === "AbortError" ? "ការវិភាគចំណាយពេលយូរពេក។ សូមជ្រើសកម្រិតខ្លី។" : error.message || "Local model មិនអាចឆ្លើយបានទេ។" });
    } finally {
      busy = false;
    }
  });
}
