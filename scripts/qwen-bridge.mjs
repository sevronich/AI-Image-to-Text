
import { createServer } from "node:http";

import {
  describeWithQwen,
  MAX_REQUEST_BYTES,
  SITE_ORIGIN,
  QWEN_MODEL,
} from "../lib/qwen.mjs";

import { validateProviderResult } from "../lib/description-result.mjs";

// Allowed website origins for the local bridge.
export const ALLOWED_ORIGINS = new Set([
  SITE_ORIGIN,
  "https://chitra-ai-studio-20261025.zanybowl20.chatgpt.site",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
]);

export function createBridge({
  generate = describeWithQwen,
  ready = async () => true,
  apiKey,
  timeoutMs = 300000,
} = {}) {
  let busy = false;

  return createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");

    const origin = req.headers.origin;
    const host = req.headers.host || "";

    // Restrict requests to the local bridge host.
    if (!["127.0.0.1:8765", "localhost:8765"].includes(host)) {
      res.writeHead(403).end();
      return;
    }

    // Validate allowed origins.
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      res.writeHead(403).end();
      return;
    }

    // Configure CORS.
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type"
      );
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, OPTIONS"
      );

      // Local network access compatibility.
      res.setHeader(
        "Access-Control-Allow-Private-Network",
        "true"
      );
    }

    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }

    // Send JSON response.
    const json = (status, data) => {
      if (!res.destroyed) {
        res.writeHead(status, {
          "Content-Type": "application/json; charset=utf-8",
        });

        res.end(JSON.stringify(data));
      }
    };

    // Health endpoint.
    if (req.method === "GET" && req.url === "/health") {
      const available = await ready().catch(() => false);

      json(available ? 200 : 503, {
        ready: available,
        model: QWEN_MODEL,
        busy,
      });

      return;
    }

    // Description endpoint.
    if (req.method !== "POST" || req.url !== "/describe") {
      json(404, { error: "Not found" });
      return;
    }

    // Validate request origin and content type.
    if (
      !origin ||
      !ALLOWED_ORIGINS.has(origin) ||
      !req.headers["content-type"]?.startsWith(
        "application/json"
      )
    ) {
      json(403, {
        error: "Origin and JSON content type are required.",
      });

      return;
    }

    // Prevent concurrent model requests.
    if (busy) {
      json(429, {
        error: "Model កំពុងវិភាគរូបមួយទៀត។ សូមរង់ចាំ។",
      });

      return;
    }

    // Check request payload size.
    if (
      Number(req.headers["content-length"] || 0) >
      MAX_REQUEST_BYTES
    ) {
      json(413, {
        error: "រូបភាពធំពេក។",
      });

      return;
    }

    busy = true;

    const chunks = [];
    let bytes = 0;

    try {
      // Read incoming request body.
      for await (const chunk of req) {
        bytes += chunk.length;

        if (bytes > MAX_REQUEST_BYTES) {
          json(413, {
            error: "រូបភាពធំពេក។",
          });

          return;
        }

        chunks.push(chunk);
      }

      // Parse JSON request.
      let body;

      try {
        body = JSON.parse(
          Buffer.concat(chunks).toString("utf8")
        );
      } catch {
        json(400, {
          error: "Invalid JSON",
        });

        return;
      }

      // Check model availability.
      if (!(await ready().catch(() => false))) {
        json(503, {
          error:
            "Qwen កំពុងផ្ទុក។ សូមរង់ចាំបន្តិច រួចពិនិត្យការភ្ជាប់ និងសាកម្តងទៀត។",
        });

        return;
      }

      // Configure timeout and cancellation.
      const controller = new AbortController();

      const timeout = setTimeout(
        () => controller.abort(),
        timeoutMs
      );

      res.once("close", () => {
        if (!res.writableEnded) {
          controller.abort();
        }
      });

      try {
        // Forward request to the local Qwen model.
        const result = await generate(body, {
          apiKey,
          signal: controller.signal,
        });

        // Only a fully validated structured description may be labeled success.
        // Injected generators (tests/evaluation) may omit the submitted prompt texts,
        // so echo association is checked only when the caller actually supplied them.
        validateProviderResult(result, Array.isArray(body?.submittedTexts)
          ? { submittedTexts: body.submittedTexts }
          : undefined);

        // Return model response.
        json(200, result);
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      const status = error.name === "AbortError" ? 504 : [400, 413, 422, 503].includes(error.status) ? error.status : 502;
      json(status, {
        code: error.name === "AbortError" ? "model_timeout" : error.code || "model_error",
        error:
          error.name === "AbortError"
            ? "ការវិភាគចំណាយពេលយូរពេក។ សូមជ្រើសកម្រិតខ្លី។"
            : error.message ||
              "Local model មិនអាចឆ្លើយបានទេ។",
      });
    } finally {
      busy = false;
    }
  });
}
