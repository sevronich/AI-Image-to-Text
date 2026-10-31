
import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { request as httpRequest } from "node:http";
import { shapesDescription } from "../fixtures/descriptions.mjs";

import {
  buildQwenRequest,
  parseQwenResponse,
  describeWithQwen,
  normalizeImageForQwen,
  validateLocalInput,
  SITE_ORIGIN,
} from "../../lib/qwen.mjs";

import {
  createBridge,
} from "../../scripts/qwen-bridge.mjs";

// Shared test fixtures.
const image = "data:image/png;base64,iVBORw0KGgo=";

const pair = "Test description";

const fixture = structuredClone(shapesDescription);

const payload = {
  choices: [
    {
      finish_reason: "stop",
      message: {
        content: JSON.stringify(fixture),
      },
    },
  ],
};

// HTTP helper for local bridge testing.
const localRequest = (
  url,
  { method = "GET", headers, body } = {}
) =>
  new Promise((resolve, reject) => {
    const req = httpRequest(
      url,
      { method, headers },
      (res) => {
        const chunks = [];

        res.on("data", (chunk) => {
          chunks.push(chunk);
        });

        res.on("end", () => {
          resolve(
            new Response(
              [204, 304].includes(res.statusCode)
                ? null
                : Buffer.concat(chunks),
              {
                status: res.statusCode,
                headers: res.headers,
              }
            )
          );
        });
      }
    );

    req.on("error", reject);
    req.end(body);
  });

// ----------------------------------------------------
// TEST 1 — Qwen Request Construction
// ----------------------------------------------------

test(
  "Qwen analyzes the image using English structured output",
  () => {
    const request = buildQwenRequest({
      image,
      detail: "concise",
      preset: "faithful",
    });

    assert.equal(
      request.messages[1].content[1].image_url.url,
      image
    );

    assert.equal(
      request.chat_template_kwargs.enable_thinking,
      false
    );

    assert.equal(
      request.response_format.schema.required.includes(
        "sections"
      ),
      true
    );

    assert.equal(
      request.response_format.schema.properties.summary.type,
      "string"
    );

    assert.match(
      request.messages[0].content,
      /English only/
    );

    assert.doesNotMatch(
      request.messages[0].content,
      /[\u1780-\u17ff]/
    );

    assert.ok(request.max_tokens < 3600);

    assert.equal(
      "api_key" in request,
      false
    );
  }
);

// ----------------------------------------------------
// TEST 2 — Response Structure Validation
// ----------------------------------------------------

test(
  "Qwen parser validates structured JSON responses",
  () => {
    // Reject incomplete generation.
    assert.throws(() =>
      parseQwenResponse({
        choices: [
          {
            finish_reason: "length",
          },
        ],
      })
    );

    // Reject missing required fields.
    assert.throws(() =>
      parseQwenResponse({
        choices: [
          {
            message: {
              content: "{}",
            },
          },
        ],
      })
    );

    // Accept valid structured output.
    assert.deepEqual(
      parseQwenResponse(payload),
      fixture
    );

    // Reject obsolete bilingual object format.
    assert.throws(() =>
      parseQwenResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({
                ...fixture,
                summary: {
                  en: "English",
                  km: "ខ្មែរ",
                },
              }),
            },
          },
        ],
      })
    );
  }
);

// ----------------------------------------------------
// TEST 3 — Preserve Generated Descriptions
// ----------------------------------------------------

test(
  "Qwen parser preserves model descriptions without keyword filtering",
  () => {
    const description = {
      ...fixture,

      summary:
        "The illustration depicts an unclothed figure.",

      sections: {
        ...fixture.sections,
        appearance:
          "The figure has long black hair and a neutral expression.",
      },

      prompt:
        "Reconstruct the illustrated figure with the visible composition.",
    };

    const modelPayload = {
      choices: [
        {
          finish_reason: "stop",

          message: {
            content: JSON.stringify(description),
          },
        },
      ],
    };

    const result = parseQwenResponse(modelPayload);

    assert.deepEqual(result, description);

    assert.equal(
      result.summary,
      description.summary
    );

    assert.equal(
      result.prompt,
      description.prompt
    );
  }
);

// ----------------------------------------------------
// TEST 4 — Input URL Validation / SSRF Protection
// ----------------------------------------------------

test(
  "remote image URLs cannot trigger local SSRF",
  () => {
    assert.throws(() =>
      validateLocalInput({
        image: "http://127.0.0.1/private",
      })
    );
  }
);

// ----------------------------------------------------
// TEST 5 — Model Readiness
// ----------------------------------------------------

test(
  "loading model returns an actionable error without inference",
  async (t) => {
    const bridge = createBridge({
      ready: async () => false,

      generate: async () => {
        assert.fail("Model is not ready");
      },
    });

    bridge.listen(0, "127.0.0.1");

    await once(bridge, "listening");

    t.after(() => bridge.close());

    const response = await localRequest(
      `http://127.0.0.1:${bridge.address().port}/describe`,
      {
        method: "POST",

        headers: {
          Host: "127.0.0.1:8765",
          Origin: SITE_ORIGIN,
          "Content-Type": "application/json",
        },

        body: JSON.stringify({ image }),
      }
    );

    assert.equal(response.status, 503);

    assert.match(
      (await response.json()).error,
      /Qwen/
    );
  }
);

// ----------------------------------------------------
// TEST 6 — Image Payload Limit
// ----------------------------------------------------

test(
  "image payload limit is independently validated",
  () => {
    assert.throws(() =>
      validateLocalInput({
        image:
          "data:image/png;base64," +
          "A".repeat(14 * 1024 * 1024),
      })
    );
  }
);

// ----------------------------------------------------
// TEST 7 — Local Vision Provider
// ----------------------------------------------------

test(
  "provider adapter calls local vision endpoint and preserves model output",
  async () => {
    let called = false;

    const result = await describeWithQwen(
      { image },
      {
        apiKey: "test-only",

        fetchImpl: async (url, options) => {
          called = true;

          assert.equal(
            url,
            "http://127.0.0.1:8081/v1/chat/completions"
          );

          assert.equal(
            options.headers.Authorization,
            "Bearer test-only"
          );

          assert.equal(
            JSON.parse(options.body)
              .messages[1].content[1]
              .image_url.url,
            image
          );

          return new Response(
            JSON.stringify(payload),
            { status: 200 }
          );
        },
      }
    );

    assert.equal(called, true);

    assert.deepEqual(
      result.description,
      fixture
    );
  }
);

// ----------------------------------------------------
// TEST 8 — WebP Conversion
// ----------------------------------------------------

test(
  "normalizeImageForQwen transcodes WebP to PNG",
  async () => {
    const sharp = (
      await import("sharp")
    ).default;

    const webpBuf = await sharp({
      create: {
        width: 16,
        height: 16,
        channels: 3,

        background: {
          r: 10,
          g: 20,
          b: 30,
        },
      },
    })
      .webp()
      .toBuffer();

    const webpDataUrl =
      "data:image/webp;base64," +
      webpBuf.toString("base64");

    const normalized =
      await normalizeImageForQwen({
        image: webpDataUrl,
      });

    assert.ok(
      normalized.image.startsWith(
        "data:image/png;base64,"
      )
    );
  }
);

// ----------------------------------------------------
// TEST 9 — Local Server Error Handling
// ----------------------------------------------------

test(
  "describeWithQwen reports a safe actionable error without echoing untrusted server text",
  async () => {
    await assert.rejects(
      describeWithQwen(
        { image },
        {
          apiKey: "test",

          fetchImpl: async () =>
            new Response(
              JSON.stringify({
                error: {
                  message: "Invalid parameter",
                },
              }),
              { status: 400 }
            ),
        }
      ),

      error => error.code === "model_request_rejected" && error.status === 400 && !error.message.includes("Invalid parameter")
    );
  }
);

// ----------------------------------------------------
// TEST 10 — CORS and Host Protection
// ----------------------------------------------------

test(
  "local bridge validates website origins and host headers",
  async (t) => {
    let generated = 0;

    const bridge = createBridge({
      generate: async () => {
        generated++;

        return {
          description: fixture,
        };
      },
    });

    bridge.listen(0, "127.0.0.1");

    await once(bridge, "listening");

    t.after(() => bridge.close());

    const address = bridge.address();

    const url =
      `http://127.0.0.1:${address.port}`;

    const headers = {
      Host: "127.0.0.1:8765",
      Origin: SITE_ORIGIN,
      "Content-Type": "application/json",
    };

    const options = {
      method: "POST",
      headers,
      body: JSON.stringify({ image }),
    };

    // Reject unrelated website.
    const badOrigin = await localRequest(
      url + "/describe",
      {
        ...options,

        headers: {
          ...headers,
          Origin: "https://unrelated.example",
        },
      }
    );

    assert.equal(badOrigin.status, 403);

    // Reject invalid host.
    const badHost = await localRequest(
      url + "/describe",
      {
        ...options,

        headers: {
          ...headers,
          Host: "attacker.example:8765",
        },
      }
    );

    assert.equal(badHost.status, 403);

    // Reject request without origin.
    const noOrigin = await localRequest(
      url + "/describe",
      {
        ...options,

        headers: {
          Host: headers.Host,
          "Content-Type": "application/json",
        },
      }
    );

    assert.equal(noOrigin.status, 403);

    // Validate preflight.
    const preflight = await localRequest(
      url + "/describe",
      {
        method: "OPTIONS",
        headers,
      }
    );

    assert.equal(preflight.status, 204);

    assert.equal(
      preflight.headers.get(
        "access-control-allow-origin"
      ),
      SITE_ORIGIN
    );

    // Verify allowed request.
    const success = await localRequest(
      url + "/describe",
      options
    );

    assert.equal(success.status, 200);

    assert.equal(
      success.headers.get("cache-control"),
      "no-store"
    );

    assert.equal(generated, 1);
  }
);

// ----------------------------------------------------
// TEST 11 — Malformed JSON Recovery
// ----------------------------------------------------

test(
  "local bridge releases request slot after malformed JSON",
  async (t) => {
    const bridge = createBridge({
      generate: async () => ({
        description: fixture,
      }),
    });

    bridge.listen(0, "127.0.0.1");

    await once(bridge, "listening");

    t.after(() => bridge.close());

    const url =
      `http://127.0.0.1:${bridge.address().port}/describe`;

    const headers = {
      Host: "127.0.0.1:8765",
      Origin: SITE_ORIGIN,
      "Content-Type": "application/json",
    };

    // Invalid JSON.
    const invalid = await localRequest(
      url,
      {
        method: "POST",
        headers,
        body: "{",
      }
    );

    assert.equal(invalid.status, 400);

    // Confirm bridge can accept another request.
    const valid = await localRequest(
      url,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ image }),
      }
    );

    assert.equal(valid.status, 200);
  }
);

// ----------------------------------------------------
// TEST 12 — Concurrent Request Handling
// ----------------------------------------------------

test(
  "local bridge refuses concurrent model requests",
  async (t) => {
    let release;
    let started;

    const active = new Promise((resolve) => {
      started = resolve;
    });

    const bridge = createBridge({
      generate: async () => {
        started();

        await new Promise((resolve) => {
          release = resolve;
        });

        return {
          description: fixture,
        };
      },
    });

    bridge.listen(0, "127.0.0.1");

    await once(bridge, "listening");

    t.after(() => bridge.close());

    const url =
      `http://127.0.0.1:${bridge.address().port}/describe`;

    const options = {
      method: "POST",

      headers: {
        Host: "127.0.0.1:8765",
        Origin: SITE_ORIGIN,
        "Content-Type": "application/json",
      },

      body: JSON.stringify({ image }),
    };

    // Start the first request.
    const first = localRequest(url, options);

    await active;

    // Second concurrent request should return 429.
    const second = await localRequest(
      url,
      options
    );

    assert.equal(second.status, 429);

    // Release first request.
    release();

    const firstResponse = await first;

    assert.equal(firstResponse.status, 200);
  }
);
test("broken WebP fails explicitly before any model request", async () => {
  let called = false;
  await assert.rejects(describeWithQwen({ image: "data:image/webp;base64,UklGRg==" }, {
    fetchImpl: async () => { called = true; throw new Error("Must not reach model"); },
  }), error => error.code === "image_decode_failed" && error.status === 400);
  assert.equal(called, false);
});

