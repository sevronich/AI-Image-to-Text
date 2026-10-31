import { mkdir, stat } from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { installSignedRuntime } from "./install-qwen-runtime.mjs";

const root = fileURLToPath(new URL("../.local-qwen/", import.meta.url));
await mkdir(root, { recursive: true });
const files = [
  { name: "Qwen3.5-4B-Q4_K_M.gguf", url: "https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/main/Qwen3.5-4B-Q4_K_M.gguf", size: 2740937888, sha256: "00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4" },
  { name: "mmproj-F16.gguf", url: "https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/main/mmproj-F16.gguf", size: 672423616, sha256: "cd88edcf8d031894960bb0c9c5b9b7e1fea6ebee02b9f7ce925a00d12891f864" },
];
function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "inherit", "inherit"], windowsHide: true });
    child.on("error", reject);
    child.on("exit", code => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)));
  });
}
const partsByFile = new Map();
async function downloadModel(file, target) {
  const prefix = (await stat(target).catch(() => null))?.size || 0;
  if (prefix === file.size) return;
  const parts = [];
  const chunkSize = 64 * 1024 * 1024;
  for (let start = prefix; start < file.size; start += chunkSize) {
    const end = Math.min(file.size - 1, start + chunkSize - 1);
    parts.push({ start, end, target: target + `.part-${start}-${end}` });
  }
  partsByFile.set(file.name, { prefix, parts });
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(24, parts.length) }, async () => {
    while (next < parts.length) {
      const part = parts[next++];
      let have = (await stat(part.target).catch(() => null))?.size || 0;
      if (have === part.end - part.start + 1) continue;
      if (have > part.end - part.start + 1) throw new Error("Partial model size mismatch.");
      while (have < part.end - part.start + 1) {
        const start = part.start + have;
        const end = Math.min(part.end, start + 4 * 1024 * 1024 - 1);
        const remainder = part.target + ".remainder";
        await run("curl.exe", ["--location", "--fail", "--silent", "--show-error", "--retry", "3", "--max-time", "180", "--range", `${start}-${end}`, "--output", remainder, file.url + `?download=true&chitra-range=${start}-${end}`]);
        if ((await stat(remainder)).size !== end - start + 1) throw new Error("Range size mismatch.");
        await pipeline(createReadStream(remainder), createWriteStream(part.target, { flags: "a" }));
        have += end - start + 1;
      }
      if ((await stat(part.target)).size !== part.end - part.start + 1) throw new Error("Range size mismatch.");
    }
  }));
  for (const part of parts) await pipeline(createReadStream(part.target), createWriteStream(target, { flags: "a" }));
  partsByFile.delete(file.name);
}
const progress = setInterval(async () => {
  const sizes = await Promise.all(files.map(async f => {
    const state = partsByFile.get(f.name);
    const bytes = state ? state.prefix + (await Promise.all(state.parts.map(async p => (await stat(p.target).catch(() => null))?.size || 0))).reduce((a,b) => a+b, 0) : (await stat(path.join(root, f.name)).catch(() => null))?.size || 0;
    return `${f.name}: ${Math.min(100, Math.round(bytes / f.size * 100))}%`;
  }));
  console.log(sizes.join(" | "));
}, 20000);
try {
  await Promise.all(files.map(async file => {
    const target = path.join(root, file.name);
    if ((await stat(target).catch(() => null))?.size !== file.size) {
      if (file.sha256) await downloadModel(file, target);
      else await run("curl.exe", ["--location", "--fail", "--silent", "--show-error", "--retry", "3", "--continue-at", "-", "--output", target, file.url]);
    }
    if ((await stat(target)).size !== file.size) throw new Error(`Unexpected size for ${file.name}`);
    if (file.sha256) {
      const hash = createHash("sha256");
      for await (const chunk of createReadStream(target)) hash.update(chunk);
      if (hash.digest("hex") !== file.sha256) throw new Error(`Checksum mismatch: ${file.name}`);
    }
    console.log(`Verified ${file.name}`);
  }));
  await installSignedRuntime();
  console.log("Qwen3.5-4B is ready. Run: npm run qwen");
} finally {
  clearInterval(progress);
}
