# ចិត្រា AI — Image Description Studio

A full-stack, Khmer-first image description app. The default provider is **Qwen3.5-4B running on your own Windows PC**, downloaded from Hugging Face. OpenAI remains an explicitly selected cloud option. Both providers use real vision inference and the same bilingual result format.

## Qwen3.5-4B on this PC

Model: [Qwen3.5-4B, Unsloth Q4_K_M conversion](https://huggingface.co/unsloth/Qwen3.5-4B-GGUF), Apache-2.0. The original model is [Qwen/Qwen3.5-4B](https://huggingface.co/Qwen/Qwen3.5-4B). Runtime: official llama.cpp Windows CUDA 12.4, release b11960.

The setup is tuned for 16GB RAM and a GTX 1660 Ti with 6GB VRAM: 4-bit language model, F16 vision projector, one simultaneous request, 8192-token context, and at most 768 image tokens. Actual memory use and speed depend on image size and other applications.

1. Install Node.js 22.13+ if it is not installed.
2. Run `npm run setup:qwen`. It downloads approximately 4.1GB into ignored `.local-qwen/`, resumes partial downloads, and verifies both model SHA-256 hashes.
3. Run `npm run qwen`, or launch `scripts/Start-Qwen.ps1` to run it in the background.
4. Open the private deployed website or local dev page. Select Qwen3.5-4B, then check the connection.
5. If Chromium asks for local-network access, allow it for this private site. The browser sends the image directly to `127.0.0.1:8765`.

The downloaded `Start-Chitra-Qwen.cmd` is a shortcut for the installation path on the original user's PC. For a relocated checkout, use `scripts/Start-Qwen.ps1` instead.

No Hugging Face token or OpenAI credits are required for this public model. After the download, inference itself can run offline; the hosted website still needs internet. The PC must stay on while analyzing. A phone cannot reach this PC's loopback address.

## Local privacy and service boundary

The bridge binds only to 127.0.0.1. It allows requests only from the exact private production site and localhost development origins, rejects unexpected Host headers, requires JSON and an allowed Origin for POST, and limits body size and concurrent requests. The underlying model server has an ephemeral random API key held in memory. Neither service stores uploaded images or generated descriptions. The model's default logs contain operational timings, not request bodies. Do not enable verbose prompt logging for private images.

Do not expose either local port to the public internet. No tunnel, firewall opening, login service, or startup-at-boot task is installed. Runtime diagnostics are in `.local-qwen/model.log` and `.local-qwen/bridge-error.log`.

### Installation status on the original PC

During verification, Windows Code Integrity rejected the official llama.cpp runtime's unsigned `ggml-base.dll` with exit code `0xC0E90002` (Code Integrity events 3077/3033). Security policy was not changed. This blocks local inference before a model can be loaded. An administrator must review the runtime under the existing policy, or a trusted, signed runtime must be provided. Do not disable Windows protections to proceed.

The model download was left incomplete, with partial files preserved in `.local-qwen/`. After resolving the runtime policy, rerun `npm run setup:qwen` to finish and verify the model, then launch it. The code and production build are verified; real Qwen inference and Khmer output quality are not yet verified on this PC.

## Architecture

- **UI:** Next.js 16 + React 19, built and deployed through Vinext on Cloudflare Workers/Sites.
- **Qwen backend:** browser → loopback Node bridge → authenticated local llama.cpp vision server. Grammar-constrained JSON and response validation preserve the existing Khmer/English sections and evidence fields.
- **Optional OpenAI backend:** `POST /api/describe` calls the OpenAI Responses API. `OPENAI_API_KEY` stays server-side. Only choosing OpenAI sends an image to that provider.
- **Cloud runtime:** Cloudflare Workers hosts the UI and optional cloud API; model weights are never placed in the Worker, source ZIP, or published assets.

## Local setup

Run `npm run install:ci`, `npm run qwen`, and `npm run dev` in separate terminals. Open `http://localhost:5173`. An API key is not needed for Qwen. For the optional OpenAI provider only, set the variables documented in `.env.example` using an ignored local env file, and provision a secret in Sites for the cloud deployment.

## Quality checks

Run `npm test` and `npm run build`. Tests cover the local request adapter, bilingual result validation, truncated output, image payload limits, CORS/Origin/Host rejection, preflight, and provider error handling. Test fixtures are used only in tests; the product has no simulated description path.

Supported image formats: PNG, JPEG, WEBP, and GIF. The app rejects files larger than 10MB in the browser and oversized requests on the server.

## Capability note

The app is designed for high-quality, evidence-based image description. Matching any particular ChatGPT or “GPT-6” experience cannot be guaranteed: output quality depends on the configured vision model, API access, model updates, image quality, and prompt constraints.
