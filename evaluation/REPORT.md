# Image description reliability audit — 2026-10-31

## Outcome and scope

The existing Next/Vinext → loopback bridge → authenticated llama-server architecture, Khmer UI, English-only output, Qwen3.5-4B model, GPU acceleration, presets, translation feature, and JSON contract are preserved. No new paid provider, key, tunnel, Windows security change, or automatic inference retry was introduced.

The WebP decoder failure, silent conversion fallback, weak result parsing and image/result race protections have been repaired. Real reference-image inference, browser upload/conversion, all six result sections and replacement during inference were exercised. **Semantic accuracy is not fully solved:** the installed 4B model still makes confident visual mistakes. Structural validation must not be interpreted as independent verification of confirmed evidence. The strict semantic acceptance criterion is therefore only partially met; the report records the remaining errors instead of certifying all observations.

## Root causes and evidence

### Upload → validation → actual image bytes

The failing UI had selected `22.webp` (about 41KB). The user's screenshot showed `Local vision model returned HTTP 400.` The runtime log contained `mtmd_helper_bitmap_init_from_buf: failed to decode buffer as either image or audio (video support not compiled in)` at runtime timestamps `18.19.885.066` and `23.16.853.792`. The installed multimodal decoder cannot directly consume that WebP buffer.

During the audit, local files were also being edited externally. The existing worktree acquired browser/Sharp conversion code before the controlled baseline was run. Both controlled baseline cases consequently returned HTTP 200; **there is no manufactured HTTP 400 in the before/after table**. The converters' catch paths silently returned the unsupported original input, so the failure could recur on decode/load problems. They now fail explicitly rather than forwarding unreadable bytes.

The exact private failing WebP was tested for conversion only, without vision inference or publication: Sharp decoded it into a real PNG at 800×800. Its content is excluded from repository fixtures, published assets and evaluation captures. The user-supplied clothed anime reference and a generated geometric fixture were used for inference.

Browser WebP upload now uses Image + Canvas to produce genuine PNG bytes, preserving aspect ratio and alpha with a 2048-pixel long-edge cap and a 10MB output bound. Direct API WebP uploads use Sharp with a 40-million-pixel decode limit, the same dimension cap, and an independent decoded-byte limit. PNG/JPEG/GIF retain their bytes. MIME replacement alone is never used as conversion.

### Prompt → provider request → vision inference

`buildQwenRequest` supplies a system instruction, separate user text and `image_url` content to `/v1/chat/completions`, plus the existing grammar-constrained JSON schema. The actual installed server accepted this payload. Its configured vision projector and Vulkan backend produced responses with image-dependent content: the anime request described garment layers/hands/grid, while the geometric request described colored shapes and their positions. The projector is not missing; real inference, not a canned fallback, produced both responses.

The diagnostic capture records the exact model-facing system/user instructions, normalized MIME/byte count, raw completion JSON, finish reason and token usage for the safe tagged evaluation cases. No image base64 or ephemeral model API key is captured. Fixture hashes in before/after results establish the same image inputs were compared.

Both final completions terminated with `finish_reason: stop`, well below the 3200 Deep output-token budget and 8192 context. There was no evidence of truncation in these runs, so model, temperature, context and output budgets were retained. Tests exercise an explicit `length` completion as an error; the application never repairs incomplete JSON by inventing text.

### Raw response → parsed description → frontend

No product fallback from failed inference to the input instruction was found. Successful descriptions come from parsed provider output. The separate `prompt` field intentionally contains a reusable image-reconstruction prompt, which can start with “Generate an image…”. That is distinct from the factual summary and six sections.

There was a real purpose error in the baseline geometric reconstruction prompt: it asked to “Generate a minimalist visual description…” instead of reconstructing an image. The validator now rejects this form. The UI label explicitly identifies the editable reconstruction prompt, separate from actual observations.

Previously, the local parser mostly checked types and one truncation reason; the cloud route used JSON.parse without equivalent complete-shape, refusal, incomplete-response or instruction-echo validation. The cloud path also selected only one text fragment. Both now use a shared validator, and Responses output joins all output-text fragments after checking refusal/failure/incomplete statuses.

The frontend renders `payload.description`; it independently validates that object before setting success. Selection versions and AbortController now cover file reads, WebP decoding, sample fetching, inference and deferred scrolling. A late result or file decode from an old selection cannot overwrite the new one, even when cancellation is ignored by the underlying operation. Selecting/removing an image clears old results and edited prompts. Pending/error states do not render a success result.

`cache_prompt: false` remains set. The cloud route sends `Cache-Control: no-store`. There was no evidence that server caching returned another image's description; asynchronous selection races were a separate integrity weakness worth fixing.

The local launcher stop routine also missed wrappers started with relative script paths, leaving owned model/Worker children running and locking the build directory. It now discovers those children using this project's exact model path or Wrangler configuration before stopping their scoped process tree. Other projects and IDE processes are excluded.

## Exact source changes

| File | Change |
| --- | --- |
| `lib/description.mjs` | Evidence-based section guidance, non-human coverage, image reconstruction distinction, final accuracy check, stricter base64 validation and decoded-byte helper. |
| `lib/description-result.mjs` | New shared exact-contract parser/validator; rejects instruction echo, schema placeholders, missing/extra/wrong-type fields, repeated sections, refusals, obvious wrong-script output and qualified guesses in confirmed evidence; parses Responses completion states/fragments. |
| `lib/image-normalization.mjs` | New testable browser WebP rasterization with explicit errors and bounds. |
| `lib/request-session.mjs` | New testable cancellation/version guard for image-result association. |
| `lib/http-input.mjs` | New streamed UTF-8 request-size enforcement and JSON errors for the cloud route. |
| `lib/openai-vision.mjs` | Existing cloud request moved into a testable adapter with shared parsing/error classification; no live cloud call made. |
| `lib/qwen.mjs` | Strict local completion parsing, explicit WebP conversion failures, safe actionable HTTP errors, optional in-memory evaluation hook; retained existing Sharp conversion work. |
| `app/api/describe/route.ts` | Uses shared cloud adapter/input limits, cancellation/timeout, safe typed errors and no-store headers. |
| `components/image-description-studio.tsx` | Uses tested conversion/version guard; validates actual response; preserves six-section UI; separates reconstruction label; clears stale results and disables mutable settings while processing. |
| `scripts/qwen-bridge.mjs` | Typed error status handling, timeout classification and injectable timeout for tests; preserved CORS/Host/body/concurrency protections and existing formatting edits. |
| `scripts/start-qwen.mjs` | Optional tagged evaluation response capture with redaction; retained existing runtime/setup edits and GPU parameters. |
| `scripts/Stop-Chitra.ps1` | Scoped shutdown now finds relative launcher wrappers through exact owned child paths. |
| `scripts/evaluate-local.mjs` | New real-model evaluation runner; correct MIME per fixture, sequential requests, hashes/settings/status/actual responses, no semantic pass claims. |
| `evaluation/create-fixtures.mjs`, `evaluation/cases.json`, `evaluation/fixtures/anime.webp`, `evaluation/fixtures/shapes.png` | Two different compositions with reference facts/uncertainties, separate from product code. |
| `evaluation/results/before.json`, `evaluation/results/after.json`, `evaluation/results/after-initial.json`, `evaluation/results/raw-after.jsonl` | Reviewed copies of safe-fixture outputs and redacted diagnostic records for the comparison; no private input image. |
| `tests/description-result.test.mjs`, `tests/image-normalization.test.mjs`, `tests/request-session.test.mjs`, `tests/fixtures/descriptions.mjs` | New reusable integrity/normalization/state tests and a test-only mock response. |
| `tests/integration/providers.test.mjs`, `tests/integration/qwen.test.mjs` | Cloud/local adapter and bridge tests; existing `tests/qwen.test.mjs` moved to the integration folder with imports/fixtures updated; broken WebP must not reach the model. |
| `package.json`, `package-lock.json` | Separate test/evaluation commands and explicit pinned Sharp dependency already proven to load on this PC. |
| `README.md`, `evaluation/REPORT.md` | Setup, format handling, test/evaluation procedure, privacy and limits. |

Existing concurrent edits/formatting in `scripts/Start-Qwen.ps1`, `scripts/smoke-qwen.mjs`, `scripts/start-qwen.mjs`, `scripts/qwen-bridge.mjs`, `lib/qwen.mjs`, `lib/description.mjs`, and `tests/description.test.mjs` were retained. The change list above distinguishes the substantive repair from those pre-existing worktree changes; no broad reset or runtime replacement was performed.

## Prompt and inference configuration

The shared prompt requests actual completed English observations, treats preferences as emphasis rather than visual evidence, covers all six categories, describes non-human objects, limits claims to visible limbs/background/material cues, avoids private attributes and narratives, and separates genuine uncertainty from confirmed facts. Deep detail is an upper bound rather than a demand to fill space. A final short check asks for contradictions and unsupported categories to be removed. No fixture-specific expected facts are inserted into the prompt or application output.

An older local-only appended instruction that always prioritized human hair/clothing/hands was removed because it competed with non-human guidance. The local and cloud paths now share the same main prompt and result contract.

Retained local parameters: Qwen3.5-4B-Q4_K_M with its F16 projector; Vulkan0 GPU acceleration; `-ngl 99`; context 8192; one slot; batch 256/microbatch 128; image tokens 1024–1536; thinking off; temperature 0.3; top_p 0.9; stream false; cache_prompt false. Output limits remain Concise 1400, Balanced 2200, Deep 3200. String/schema bounds remain in place. No retry is used: users see persistent errors instead of hidden repeated GPU work.

The optional OpenAI route retains its existing default model `gpt-5.1`, structured Responses request, server-only key, 75-second timeout and existing token/reasoning settings. Tests mock its transport; no credits were spent to claim live cloud parity.

## Executed validation

Story: a user uploads/pastes/drops an image, chooses local Qwen or optional cloud inference, and receives the actual English structured response associated with that selection. Automated integrity checks and browser checks are distinct from semantic evaluation.

| Boundary | Status | Evidence |
| --- | --- | --- |
| UI and upload | Passed | Browser accepted the WebP reference and previewed real PNG data. |
| Browser → bridge | Passed | Deep generation entered a pending state; the real local result returned and rendered. |
| Bridge → vision model | Passed | Safe fixture requests yielded different image-dependent raw completions, normal stop reasons and token usage. |
| Raw response → parsed contract | Passed | Both final evaluation responses passed the shared validator; malformed/refused/incomplete fixtures failed in tests. |
| Result → correct selection/UI | Passed | Switching during inference cleared the previous request; new shape results rendered all six sections/evidence/prompt. |
| Visual truth of every claim | Partial | Open eyes were misread as closed; the blue upright rectangle was called a square. See the manual review. |
| Optional live cloud | Not run | Provider consistency/errors were reviewed and mock-tested; no paid inference was used. |

- `npm run test:unit`: 23/23 passed.
- `npm run test:integration`: 19/19 passed (42 tests total, no failures/skips).
- `npx tsc --noEmit`: passed.
- `npm run build`: passed with the existing Vinext route-classification informational note.
- Browser: safe `anime.webp` uploaded through file chooser; preview source began `data:image/png;base64,` (not MIME relabeling). Started Deep inference, replaced it with `shapes.png` during processing, and observed the old pending/result UI clear. Analyzed shapes; all six English sections, both evidence lists and the separate editable reconstruction prompt rendered with shape content and no stale anime description.
- Browser error recovery: an intentionally broken four-byte WebP displayed an explicit unreadable-image error, no success result, and a “choose new image” action. Selecting a valid PNG cleared the error and enabled analysis.
- Private failing WebP: real conversion to PNG 800×800 passed; deliberately excluded from inference fixtures and publication.

Tests cover multimodal image association/payload, genuine model output instead of input text, local stop/length/refusal handling, Responses fragments/status/refusal, missing/malformed/extra fields, recognizable instruction echoes and schema placeholders, wrong-script output, uncertainty classification, WebP pixels/failure, cancellation and non-cooperative late results, request bytes, bridge timeout/slot release, Origin/Host/CORS/concurrency and translation destination/encoding/length. Cloud transport and bridge faults use mocks; they are not claims of real cloud inference.

Reproduce separately:

```powershell
npm run test:unit
npm run test:integration
npx tsc --noEmit
npm run build
node evaluation/create-fixtures.mjs
# Start Qwen and wait until the connection check says ready and idle.
npm run eval:local -- after
```

## Before/after real-model comparison

Same model, hardware, Deep/Faithful settings and exact fixture bytes; no expected descriptions are fed into inference. Single sampled runs are not statistical model benchmarks. The initial after run is retained as `after-initial.json`, followed by one general prompt refinement removing human-only bias and adding a final accuracy check. All four after raw responses remain in `raw-after.jsonl`; neither errors nor earlier candidates were hidden.

Review the captured [baseline](results/before.json), [initial after run](results/after-initial.json), [final after run](results/after.json) and [redacted raw provider records](results/raw-after.jsonl). These reviewed safe-fixture copies are deliberately versioned; ordinary runtime captures remain ignored under `.local-qwen/`.

| Case | Baseline | Final | Structural outcome |
| --- | --- | --- | --- |
| Anime WebP | HTTP 200, 22s | HTTP 200, 20s | Both supplied the complete English contract. Final includes clearer outfit/background in the summary and reconstruction prompt. |
| Geometric PNG | HTTP 200, 16s | HTTP 200, 18s | Both complete; baseline reconstruction requested another description, final requests an image. Final appearance describes objects rather than only absence of people. |

Hashes: anime `4a6f1386f69045027ba52372d4a92c3f890d62d954a87b77277c4cae65c987c7`; shapes `2121153910c639861e97b826f518a018ef67621cfa32fa126842f37a1c255a8e`.

### Manual reference review: anime

- Supported before and after: light-blue hair; gray cropped top with an open white shirt; black shorts with white trim and drawstring; one hand by the chest and another beside the head; gray grid/checker background; anime digital rendering and a gentle visible smile. These image-dependent details establish real analysis.
- Improved: final summary and reconstruction include garment colors/layers and the checkered background instead of a generic “layered outfit” and “neutral background”. Earring is described in the visible ear rather than an unsupported anatomical side. Final confirmed list avoids asserting a seated pose; pose ambiguity is recorded as uncertain.
- Unsupported/wrong after: “eyes are closed” is false—the illustrated eyes are visibly partly open. “Crouching” remains an unsupported pose alternative; the summary's gender category is unnecessary and its uncertainty is unhelpful. The initial after run also invented visible teeth despite saying closed-mouth; this is preserved in the initial capture as a known failure.
- Missing after: the cropped top's white lower band, fine hair layers/ends, clear eye detail, white cutout border and some hand/finger detail. Deep does not consistently yield comprehensive detail; the final response is shorter.
- Genuine uncertainty: exact support/seating surface is outside the frame and precise fabrics are not established. Those should remain uncertain; no bed, room, age or identity is confirmed.

### Manual reference review: geometric image

- Supported before and after: red circular shape on image-left; blue four-sided shape on image-right; white background/gap; solid flat colors and clean edges; no people/clothing. Both shapes are vertically centered.
- Improved: appearance now describes the objects and flat color; reconstruction now asks for an image rather than another caption. No human hair/garment/pose was hallucinated.
- Unsupported/wrong before and after: the blue shape is a **120×140 upright rectangle**, not a square. Qwen repeats the wrong square category in confirmed evidence and the reconstruction. This is a real residual model error, not a parser success.
- Missing: taller-than-wide proportions; pose text still says “not applicable” instead of describing object orientation.
- Uncertainty quality: baseline speculated about decorative/symbolic intent; final removed that, but replaced it with low-value unknown exact colors/ratios. The fixture needs no material uncertainty; an empty uncertain array would be better.

No numeric accuracy score is asserted from two examples. The requested “unsupported observations are never confirmed” condition cannot be guaranteed by schema/regex checks and is demonstrably not fully met by this model in these samples.

## Limits and privacy

The validator is a response-integrity boundary, not a second visual model. It cannot detect all factual errors, contradictions, paraphrased instruction echoes, or fluent non-English text written in Latin script. Its script check catches obvious Khmer/bilingual-shaped output; it is not a complete language identifier. Qualified-guess checks catch recognizable phrasing, not every speculative claim. Confirmed evidence remains the model's claim, not an independently certified fact.

Image normalization can reduce fine detail; animated images are treated as stills. Limits fail explicitly rather than silently dropping fields or fabricating descriptions. Cancellation prevents stale display; a local inference already running may take time to release its single slot, during which a new request can receive a busy response. The standalone evaluation runner requires the model to be ready first; launching it before the bridge starts returns a connection error, then can be rerun after readiness.

Only local Qwen inference was tested live. OpenAI behavior was reviewed and exercised through mocked responses, not a paid request. Matching a stronger ChatGPT/GPT-6-class model is not guaranteed by this 4B quantized model or by these fixes. Better visual accuracy needs model/hardware evaluation or training beyond this software repair; it is not silently substituted with a paid provider.

Loopback binding, exact Origin/Host checks, JSON request type, 14MB body/10MB image limits, one-request concurrency, random in-memory model key and no normal image/result persistence remain. No full image base64 is logged. Tagged safe evaluation captures are ignored local files; the diagnostic flag must be removed by restarting normally before private usage. No Windows security setting was changed.

After evaluation, the app and model were stopped and started normally without `CHITRA_EVAL_TRACE`; ordinary private usage does not enable the capture hook. Reviewed copies of the four safe diagnostic records are supplied above for auditability.
