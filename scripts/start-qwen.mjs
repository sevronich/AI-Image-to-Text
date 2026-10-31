
import { spawn } from "node:child_process";
import {
  existsSync,
  createWriteStream,
  statSync,
  appendFileSync,
  mkdirSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { createBridge } from "./qwen-bridge.mjs";
import { describeWithQwen } from "../lib/qwen.mjs";

// --------------------------------------------------
// LOCAL QWEN PATH CONFIGURATION
// --------------------------------------------------

const folder = fileURLToPath(
  new URL("../.local-qwen/", import.meta.url)
);

const executable = path.join(
  folder,
  "signed-bin",
  "llama-server.exe"
);

// Verify llama-server executable.
if (!existsSync(executable)) {
  throw new Error("Run npm run setup:qwen first.");
}

// --------------------------------------------------
// MODEL FILE VALIDATION
// --------------------------------------------------

const modelFiles = [
  ["Qwen3.5-4B-Q4_K_M.gguf", 2740937888],
  ["mmproj-F16.gguf", 672423616],
];

for (const [name, size] of modelFiles) {
  const target = path.join(folder, name);

  if (
    !existsSync(target) ||
    statSync(target).size !== size
  ) {
    throw new Error(
      "Model download is not complete. Run npm run setup:qwen to finish it."
    );
  }
}

// --------------------------------------------------
// CHECK EXISTING BRIDGE
// --------------------------------------------------

try {
  const existing = await fetch(
    "http://127.0.0.1:8765/health",
    {
      signal: AbortSignal.timeout(1500),
    }
  );

  if (
    existing.ok ||
    existing.status === 503
  ) {
    console.log("Chitra Qwen is already running.");
    process.exit(0);
  }
} catch {
  // No existing bridge detected.
}

// --------------------------------------------------
// INTERNAL API KEY
// --------------------------------------------------

const apiKey = randomBytes(32).toString("hex");

// --------------------------------------------------
// SERVER LOGGING
// --------------------------------------------------

const log = createWriteStream(
  path.join(folder, "model.log"),
  { flags: "a" }
);

// --------------------------------------------------
// START LOCAL LLAMA SERVER
// --------------------------------------------------

const child = spawn(
  executable,
  [
    "-m",
    path.join(folder, "Qwen3.5-4B-Q4_K_M.gguf"),

    "--mmproj",
    path.join(folder, "mmproj-F16.gguf"),

    "--host",
    "127.0.0.1",

    "--port",
    "8081",

    "--alias",
    "Qwen3.5-4B-Q4_K_M",

    // GPU acceleration.
    "--device",
    "Vulkan0",

    "-ngl",
    "99",

    // Context configuration.
    "-c",
    "8192",

    "-np",
    "1",

    // Batch configuration.
    "-b",
    "256",

    "-ub",
    "128",

    // Vision token configuration.
    "--image-min-tokens",
    "1024",

    "--image-max-tokens",
    "1536",

    // Disable reasoning mode.
    "--reasoning",
    "off",
  ],
  {
    windowsHide: true,

    env: {
      ...process.env,
      LLAMA_API_KEY: apiKey,
    },

    stdio: [
      "ignore",
      "pipe",
      "pipe",
    ],
  }
);

// --------------------------------------------------
// FORWARD MODEL LOGS
// --------------------------------------------------

child.stdout.pipe(log, { end: false });
child.stderr.pipe(log, { end: false });

// --------------------------------------------------
// MODEL HEALTH CHECK
// --------------------------------------------------

const ready = async () => {
  const response = await fetch(
    "http://127.0.0.1:8081/health",
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },

      signal: AbortSignal.timeout(2000),
    }
  );

  return response.ok;
};

// --------------------------------------------------
// CREATE LOCAL QWEN BRIDGE
// --------------------------------------------------

const bridge = createBridge({
  apiKey,
  ready,
  // Explicit local evaluation only. Ordinary requests never retain raw output.
  generate: process.env.CHITRA_EVAL_TRACE === "1" ? (body, options) => describeWithQwen(body, {
    ...options,
    onResponse: (payload, request) => {
      if (typeof body.evaluationCase !== "string" || !/^[a-z0-9_-]{1,64}$/.test(body.evaluationCase)) return;
      const destination = path.join(folder, "evaluations");
      mkdirSync(destination, { recursive: true });
      const record = { caseId: body.evaluationCase, createdAt: new Date().toISOString(), request, rawResponse: payload };
      const line = JSON.stringify(record, (_, value) => typeof value === "string" ? value.replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=\r\n]+/g, "[image omitted]") : value);
      appendFileSync(path.join(destination, "raw-after.jsonl"), line + "\n");
    },
  }) : undefined,
});

// Request timeout: 330 seconds.
bridge.requestTimeout = 330000;

// --------------------------------------------------
// START BRIDGE SERVER
// --------------------------------------------------

bridge.listen(
  8765,
  "127.0.0.1",
  () => {
    console.log(
      "Chitra Qwen bridge: http://127.0.0.1:8765 — model is loading."
    );
  }
);

// --------------------------------------------------
// PROCESS ERROR HANDLING
// --------------------------------------------------

child.on("error", (error) => {
  console.error(error.message);

  process.exitCode = 1;

  bridge.close();
});

// --------------------------------------------------
// MODEL EXIT HANDLING
// --------------------------------------------------

child.on("exit", (code, signal) => {
  if ((code >>> 0) === 0xC0E90002) {
    console.error(
      "Windows Code Integrity blocked an unsigned runtime DLL (0xC0E90002)."
    );

    console.error(
      "Ask your administrator to review or approve the official llama.cpp runtime. Do not disable Windows security."
    );
  } else {
    console.error(
      `Vision runtime stopped (${code ?? signal}). See .local-qwen/model.log.`
    );
  }

  bridge.close();

  process.exitCode =
    code === 0 ? 0 : 1;
});

// --------------------------------------------------
// GRACEFUL SHUTDOWN
// --------------------------------------------------

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    child.kill();
    bridge.close();
  });
}
