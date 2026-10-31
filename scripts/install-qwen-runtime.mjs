import { mkdir, writeFile, access } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const runtimeDirectory = fileURLToPath(new URL("../.local-qwen/signed-bin/", import.meta.url));
const source = "https://github.com/ollama/ollama/releases/download/v0.40.13/ollama-windows-amd64.zip";
const size = 1601969847;
async function range(start, end) {
  const response = await fetch(source, {
    headers: { Range: `bytes=${start}-${end}` },
    signal: AbortSignal.timeout(120000),
  });
  if (response.status !== 206) throw new Error(`Runtime download returned HTTP ${response.status}; byte ranges are required.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length !== end - start + 1) throw new Error("Unexpected runtime download size.");
  return bytes;
}

export async function installSignedRuntime() {
  await mkdir(runtimeDirectory, { recursive: true });
  try {
    await access(path.join(runtimeDirectory, "verified.json"));
    console.log("Signed runtime is already installed.");
    return;
  } catch { /* Fresh install. */ }
  const tail = await range(size - 65536, size - 1);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Release ZIP directory is missing.");
  const directorySize = tail.readUInt32LE(eocd + 12);
  const directoryOffset = tail.readUInt32LE(eocd + 16);
  const directory = await range(directoryOffset, directoryOffset + directorySize - 1);
  const entries = [];
  for (let i = 0; i < directory.length;) {
    if (directory.readUInt32LE(i) !== 0x02014b50) throw new Error("Invalid release ZIP directory.");
    const nameLength = directory.readUInt16LE(i + 28);
    const extraLength = directory.readUInt16LE(i + 30);
    const commentLength = directory.readUInt16LE(i + 32);
    const name = directory.subarray(i + 46, i + 46 + nameLength).toString("utf8");
    const core = /^lib\/ollama\/[a-zA-Z0-9_.-]+\.(dll|exe)$/.test(name);
    const vulkan = /^lib\/ollama\/vulkan\/[a-zA-Z0-9_.-]+\.dll$/.test(name);
    if (core || vulkan) entries.push({
      name, method: directory.readUInt16LE(i + 10), compressed: directory.readUInt32LE(i + 20),
      uncompressed: directory.readUInt32LE(i + 24), offset: directory.readUInt32LE(i + 42),
    });
    i += 46 + nameLength + extraLength + commentLength;
  }
  let next = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (next < entries.length) {
      const entry = entries[next++];
      const header = await range(entry.offset, entry.offset + 29);
      if (header.readUInt32LE(0) !== 0x04034b50) throw new Error("Invalid ZIP local entry.");
      const dataOffset = entry.offset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
      const compressed = await range(dataOffset, dataOffset + entry.compressed - 1);
      const data = entry.method === 8 ? inflateRawSync(compressed) : entry.method === 0 ? compressed : null;
      if (!data || data.length !== entry.uncompressed) throw new Error("Runtime entry size mismatch.");
      await writeFile(path.join(runtimeDirectory, path.posix.basename(entry.name)), data);
      console.log(`Installed ${path.posix.basename(entry.name)}`);
    }
  }));
  const target = runtimeDirectory.replaceAll("'", "''");
  const verification = execFileSync("powershell.exe", ["-NoProfile", "-Command",
    `$bad=Get-ChildItem -LiteralPath '${target}' -File | Where-Object { $_.Extension -in @('.exe','.dll') } | ForEach-Object { Get-AuthenticodeSignature -LiteralPath $_.FullName } | Where-Object { $_.Status -ne 'Valid' }; if ($bad) { Write-Error 'Runtime signature verification failed'; exit 1 }; Write-Output 'All runtime signatures are valid.'`,
  ], { windowsHide: true, encoding: "utf8" });
  console.log(verification.trim());
  await writeFile(path.join(runtimeDirectory, "verified.json"), JSON.stringify({ source, backend: "Vulkan", publisher: "Ollama Inc. / Microsoft", verifiedAt: new Date().toISOString() }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await installSignedRuntime();
