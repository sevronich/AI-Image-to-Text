# ចិត្រា AI — Image Description Studio

A full-stack, Khmer-first image description app powered by a real vision-capable OpenAI model. It returns faithful, structured Khmer and English descriptions covering appearance, clothing, pose, composition, style, mood, visible evidence, uncertainty, and an editable reconstruction prompt.

## Architecture

- **UI:** Next.js 16 + React 19, built and deployed through Vinext on Cloudflare Workers/Sites.
- **Backend:** `POST /api/describe` accepts an in-memory image data URL and calls the OpenAI Responses API with structured JSON output.
- **Privacy:** `OPENAI_API_KEY` is read only by the server route. The browser never receives the key. Images are sent for analysis and are not written to application storage.
- **Model:** defaults to `gpt-5.1`; override with `OPENAI_VISION_MODEL` if another compatible model is available to your API project.

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Set `OPENAI_API_KEY` in `.env.local`. Never commit this file.
3. Run `npm run install:ci`, then `npm run dev`.
4. Open `http://localhost:5173`.

## Quality checks

Run `npm test` and `npm run build`.

Supported image formats: PNG, JPEG, WEBP, and GIF. The app rejects files larger than 10MB in the browser and oversized requests on the server.

## Capability note

The app is designed for high-quality, evidence-based image description. Matching any particular ChatGPT or “GPT-6” experience cannot be guaranteed: output quality depends on the configured vision model, API access, model updates, image quality, and prompt constraints.
