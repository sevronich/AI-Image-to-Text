import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const folder = new URL("./fixtures/", import.meta.url);
await mkdir(folder, { recursive: true });
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320"><rect width="480" height="320" fill="white"/><circle cx="120" cy="160" r="70" fill="#df3030"/><rect x="280" y="90" width="120" height="140" fill="#2266dd"/></svg>`;
await sharp(Buffer.from(svg)).png().toFile(fileURLToPath(new URL("shapes.png", folder)));
await sharp(fileURLToPath(new URL("../public/reference-anime.png", import.meta.url))).resize({ width: 768, withoutEnlargement: true }).webp({ quality: 90 }).toFile(fileURLToPath(new URL("anime.webp", folder)));
console.log("Created two visual fixtures. Neither is a product fallback.");
