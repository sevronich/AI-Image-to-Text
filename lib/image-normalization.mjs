export const MAX_NORMALIZED_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_EDGE = 2048;

function loadBrowserImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("មិនអាចអានរូបនេះបានទេ។ សូមប្រើរូប PNG ឬ JPG ដែលបើកមើលបាន។"));
    image.src = source;
  });
}

// The installed llama.cpp decoder does not support WebP. Decode locally in
// the browser and submit a real PNG; do not just change the MIME label.
export async function prepareVisionImage(source, {
  loadImage = loadBrowserImage,
  createCanvas = () => document.createElement("canvas"),
} = {}) {
  if (!source.startsWith("data:image/webp;base64,")) return source;
  const image = await loadImage(source);
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  if (!width || !height) throw new Error("រូបភាពមិនមានទំហំត្រឹមត្រូវទេ។");
  let scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(width, height));
  const canvas = createCanvas();
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Browser មិនអាចរៀបចំរូបភាពបានទេ។ សូមសាក browser ផ្សេង។");
  for (let attempt = 0; attempt < 4; attempt++) {
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = canvas.toDataURL("image/png");
    if (!png.startsWith("data:image/png;base64,")) throw new Error("Browser មិនអាចបម្លែងរូបទៅ PNG បានទេ។");
    if (Math.floor(png.slice(png.indexOf(",") + 1).length * 3 / 4) <= MAX_NORMALIZED_BYTES) return png;
    scale *= 0.75;
  }
  throw new Error("រូបភាពក្រោយបម្លែងធំពេក។ សូមបន្ថយទំហំរូប រួចសាកម្តងទៀត។");
}
