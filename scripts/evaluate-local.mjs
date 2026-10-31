import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { validateDescription } from "../lib/description-result.mjs";
import { SITE_ORIGIN } from "../lib/qwen.mjs";

const label = process.argv[2] || "after";
if (!/^[a-zA-Z0-9_-]+$/.test(label)) throw new Error("Invalid evaluation label");
const root = fileURLToPath(new URL("../", import.meta.url));
const cases = JSON.parse(await readFile(new URL("../evaluation/cases.json", import.meta.url), "utf8"));
const results = [];
for (const item of cases) {
  const health = await fetch("http://127.0.0.1:8765/health").then(r => r.json());
  if (!health.ready || health.busy) throw new Error("Wait until the local model is ready and idle.");
  const bytes = await readFile(path.join(root, item.file));
  const start = Date.now();
  const response = await fetch("http://127.0.0.1:8765/describe", {
    method: "POST", headers: { "Content-Type": "application/json", Origin: SITE_ORIGIN },
    body: JSON.stringify({ image: `data:${item.mime};base64,${bytes.toString("base64")}`, detail: "deep", preset: "faithful", evaluationCase: item.id }),
    signal: AbortSignal.timeout(310000),
  });
  const payload = await response.json();
  let validation = { passed: false, code: payload.code || "provider_error" };
  if (response.ok) {
    try { validateDescription(payload.description); validation = { passed: true, code: "valid" }; }
    catch (error) { validation = { passed: false, code: error.code || "invalid" }; }
  }
  const result = { caseId: item.id, sha256: createHash("sha256").update(bytes).digest("hex"), detail: "deep", httpStatus: response.status, elapsedSeconds: Math.round((Date.now() - start) / 1000), validation, response: payload, reference: item.reference };
  results.push(result);
  console.log(JSON.stringify({ caseId: item.id, httpStatus: response.status, elapsedSeconds: result.elapsedSeconds, validation }));
}
const folder = path.join(root, ".local-qwen", "evaluations");
await mkdir(folder, { recursive: true });
await writeFile(path.join(folder, label + ".json"), JSON.stringify({ label, createdAt: new Date().toISOString(), results }, null, 2));
console.log(`Saved evaluation: .local-qwen/evaluations/${label}.json. Semantic claims require reference review; contract validation alone does not prove accuracy.`);
