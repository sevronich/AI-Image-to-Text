import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const config = fileURLToPath(new URL("../dist/server/wrangler.json", import.meta.url));
if (!existsSync(config)) throw new Error("Build the app first: npm run build");
const child = spawn(process.execPath, [
  "--import", new URL("./sites-env.mjs", import.meta.url).href,
  fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url)),
  "dev", "--config", config, "--local", "--persist-to", ".wrangler/state",
  "--ip", "127.0.0.1", "--port", "5173", "--inspector-port", "0",
], { cwd: root, windowsHide: true, stdio: "inherit" });
child.on("error", error => { console.error(error.message); process.exitCode = 1; });
child.on("exit", code => { process.exitCode = code || 0; });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill());
