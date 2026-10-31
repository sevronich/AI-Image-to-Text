import { spawn } from "node:child_process";
import { existsSync, createWriteStream, statSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createBridge } from "./qwen-bridge.mjs";

const folder = fileURLToPath(new URL("../.local-qwen/", import.meta.url));
const executable = path.join(folder, "signed-bin", "llama-server.exe");
if (!existsSync(executable)) throw new Error("Run npm run setup:qwen first.");
for (const [name, size] of [["Qwen3.5-4B-Q4_K_M.gguf", 2740937888], ["mmproj-F16.gguf", 672423616]]) {
  const target = path.join(folder, name);
  if (!existsSync(target) || statSync(target).size !== size) throw new Error("Model download is not complete. Run npm run setup:qwen to finish it.");
}
try {
  const existing = await fetch("http://127.0.0.1:8765/health", { signal: AbortSignal.timeout(1500) });
  if (existing.ok || existing.status === 503) { console.log("Chitra Qwen is already running."); process.exit(0); }
} catch { /* No existing bridge. */ }
const apiKey = randomBytes(32).toString("hex");
const log = createWriteStream(path.join(folder, "model.log"), { flags: "a" });
const child = spawn(executable, [
  "-m", path.join(folder, "Qwen3.5-4B-Q4_K_M.gguf"),
  "--mmproj", path.join(folder, "mmproj-F16.gguf"),
  "--host", "127.0.0.1", "--port", "8081",
  "--alias", "Qwen3.5-4B-Q4_K_M",
  "--device", "Vulkan0",
  "-ngl", "99", "-c", "8192", "-np", "1",
  "-b", "256", "-ub", "128", "--image-min-tokens", "1024", "--image-max-tokens", "1536",
  "--reasoning", "off",
], { windowsHide: true, env: { ...process.env, LLAMA_API_KEY: apiKey }, stdio: ["ignore", "pipe", "pipe"] });
child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false });
child.on("error", error => { console.error(error.message); process.exitCode = 1; bridge.close(); });
const ready = async () => (await fetch("http://127.0.0.1:8081/health", { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(2000) })).ok;
const bridge = createBridge({ apiKey, ready });
bridge.requestTimeout = 330000;
bridge.listen(8765, "127.0.0.1", () => console.log("Chitra Qwen bridge: http://127.0.0.1:8765 — model is loading."));
child.on("exit", code => {
  if ((code >>> 0) === 0xC0E90002) {
    console.error("Windows Code Integrity blocked an unsigned runtime DLL (0xC0E90002). Ask your administrator to review/approve the official llama.cpp runtime, or use a runtime that your existing policy trusts. Do not disable Windows security.");
  } else {
    console.error(`Vision runtime stopped (${code}). See .local-qwen/model.log.`);
  }
  bridge.close();
  process.exitCode = code || 0;
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { child.kill(); bridge.close(); });
