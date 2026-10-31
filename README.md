# ចិត្រា AI — Image Description Studio

The active local project is **`D:\Project\Chitra-AI`**. Double-click `START.cmd` to run the app, `STOP.cmd` to stop it and release model/GPU memory, or open `Chitra-AI.code-workspace` in VS Code. See [HOW-TO-RUN-KH.md](HOW-TO-RUN-KH.md) for Khmer instructions. The previous C-drive checkout is retained as a backup.

A full-stack image description app with a Khmer-first interface and **English-only AI output**. The default provider is **Qwen3.5-4B running on your own Windows PC**, downloaded from Hugging Face. OpenAI remains an explicitly selected cloud option. Both providers use real vision inference and the same English result format.

## Optional Khmer translation

After analysis, expand **បកប្រែជាខ្មែរ · Google Translate**. Choose the edited prompt, overview, or full description, review the text, then open Google Translate. It opens a new tab with English → Khmer selected. Only the selected text is sent to Google when the user clicks the link; no image is sent. Translation does not call Qwen, use local GPU inference, require an API key, or run automatically. Google handles translation under its own service terms and privacy policy.

The app caps translation links at 5,000 characters and asks the user to choose a shorter scope rather than silently truncating. Editing the prompt updates the text sent for prompt translation. Khmer translations remain machine-generated and should be reviewed.

English-only generation reduces output tokens and decode work; model weight memory and image-processing memory are largely unchanged. It does not guarantee a lower peak VRAM allocation.

The exact attached 1152×2048 anime image completed a real English-only concise test in 18 seconds on the original GTX 1660 Ti. The output identified the garment layers, raised hand, and gray grid background. Timings vary by image, detail setting, and other running applications; this is one observed run, not a performance guarantee.

## Qwen3.5-4B on this PC

Model: [Qwen3.5-4B, Unsloth Q4_K_M conversion](https://huggingface.co/unsloth/Qwen3.5-4B-GGUF), Apache-2.0. The original model is [Qwen/Qwen3.5-4B](https://huggingface.co/Qwen/Qwen3.5-4B). Runtime: signed llama.cpp components from the official Ollama v0.40.13 Windows release, using Vulkan on the NVIDIA GPU.

The setup is tuned for 16GB RAM and a GTX 1660 Ti with 6GB VRAM: 4-bit language model, F16 vision projector, one simultaneous request, 8192-token context, and 1024–1536 image tokens for visual detail. Actual memory use and speed depend on image size and other applications.

1. Install Node.js 22.13+ if it is not installed.
2. Run `npm run setup:qwen`. It downloads approximately 3.4GB of model data plus a small signed runtime into ignored `.local-qwen/`, resumes partial downloads, verifies both model SHA-256 hashes, and verifies Windows Authenticode signatures on runtime components.
3. Run `npm run build` once, then launch `scripts/Start-Qwen.ps1`. It starts the local app at `http://127.0.0.1:5173` and the model in the background. `npm run qwen` starts only the model/bridge.
4. Open the private deployed website or local dev page. Select Qwen3.5-4B, then check the connection.
5. If Chromium asks for local-network access, allow it for this private site. The browser sends the image directly to `127.0.0.1:8765`.

`START.cmd` resolves the project relative to its own location. The downloadable `Start-Chitra-Qwen.cmd` also works from the project root and otherwise looks for `D:\Project\Chitra-AI`. For any other checkout location, use its root `START.cmd` or `scripts/Start-Qwen.ps1`.

The local app is the reliable option when a browser blocks connections from the HTTPS hosted site to localhost. It uses the same built UI and real model, without a cloud login. The launcher does not change Windows execution policy or security settings. On a cold start, wait a few seconds and refresh if necessary.

No Hugging Face token or OpenAI credits are required for this public model. After the download, inference itself can run offline; the hosted website still needs internet. The PC must stay on while analyzing. A phone cannot reach this PC's loopback address.

## Local privacy and service boundary

The bridge binds only to 127.0.0.1. It allows requests only from the exact private production site and localhost development origins, rejects unexpected Host headers, requires JSON and an allowed Origin for POST, and limits body size and concurrent requests. The underlying model server has an ephemeral random API key held in memory. Neither service stores uploaded images or generated descriptions. The model's default logs contain operational timings, not request bodies. Do not enable verbose prompt logging for private images.

Do not expose either local port to the public internet. No tunnel, firewall opening, login service, or startup-at-boot task is installed. Runtime diagnostics are in `.local-qwen/model.log` and `.local-qwen/bridge-error.log`.

### Installation status on the original PC

The initial unsigned llama.cpp build was rejected by Windows Code Integrity. This was resolved by switching to the digitally signed runtime distributed by Ollama. All 38 executable/DLL signatures were verified as valid, the runtime started successfully, and it detected the GTX 1660 Ti as Vulkan0. Windows security policy was not modified. `scripts/start-qwen.mjs` explicitly selects Vulkan0 on this PC.

Both Hugging Face model files passed SHA-256 verification. The initial bilingual reference-image test completed in 41 seconds, but local Khmer output had substantial mistranslation and repetition. AI generation now produces English only, and Khmer translation is an explicit Google Translate action. The hosted page could not reach loopback in the in-app browser; use the local app in that situation.

## Architecture

- **UI:** Next.js 16 + React 19, built and deployed through Vinext on Cloudflare Workers/Sites.
- **Qwen backend:** browser → loopback Node bridge → authenticated local llama.cpp vision server. Grammar-constrained JSON and response validation return English summary, sections, evidence, and prompt strings, without generating a second language.
- **Optional OpenAI backend:** `POST /api/describe` calls the OpenAI Responses API. `OPENAI_API_KEY` stays server-side. Only choosing OpenAI sends an image to that provider.
- **Cloud runtime:** Cloudflare Workers hosts the UI and optional cloud API; model weights are never placed in the Worker, source ZIP, or published assets.

## Local setup

Run `npm run install:ci`, `npm run qwen`, and `npm run dev` in separate terminals. Open `http://localhost:5173`. An API key is not needed for Qwen. For the optional OpenAI provider only, set the variables documented in `.env.example` using an ignored local env file, and provision a secret in Sites for the cloud deployment.

## Quality checks

Run `npm test` and `npm run build`. Tests cover English-only requests and result validation, rejection of the obsolete bilingual format, truncated output, image payload limits, CORS/Origin/Host rejection, preflight, provider errors, and translation URL destination/encoding/length limits. Test fixtures are used only in tests; the product has no simulated description path. `node scripts/smoke-qwen.mjs [optional-image.png]` runs a real inference test on the installed model.

Supported image formats: PNG, JPEG, WEBP, and GIF. The app rejects files larger than 10MB in the browser and oversized requests on the server.

## Capability note

The app is designed for high-quality, evidence-based image description. Matching any particular ChatGPT or “GPT-6” experience cannot be guaranteed: output quality depends on the configured vision model, API access, model updates, image quality, and prompt constraints.
