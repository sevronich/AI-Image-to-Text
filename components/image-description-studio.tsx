"use client";

import {
  AlertCircle, ArrowRight, Check, Clipboard, Copy, FileImage, ImageIcon,
  LoaderCircle, RefreshCw, ShieldCheck, Sparkles, Upload, X,
} from "lucide-react";
import { ChangeEvent, DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { descriptionText, googleTranslateUrl, MAX_TRANSLATION_CHARACTERS } from "@/lib/translation.mjs";

type SectionKey = "appearance" | "clothing" | "pose" | "composition" | "style" | "mood";
type Result = {
  summary: string;
  sections: Record<SectionKey, string>;
  evidence: { confirmed: string[]; uncertain: string[] };
  prompt: string;
};

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const sectionLabels: Record<SectionKey, [string, string]> = {
  appearance: ["រូបរាង", "Appearance"], clothing: ["សម្លៀកបំពាក់", "Clothing"],
  pose: ["កាយវិការ", "Pose"], composition: ["ប្លង់រូបភាព", "Composition"],
  style: ["រចនាប័ទ្ម", "Style"], mood: ["អារម្មណ៍", "Mood"],
};
const presets = [
  { value: "faithful", km: "ស្មោះត្រង់", en: "Faithful", hint: "អ្វីដែលមើលឃើញពិត" },
  { value: "accessibility", km: "ងាយស្រួលស្តាប់", en: "Accessibility", hint: "លំដាប់ និងទីតាំងច្បាស់" },
  { value: "creative", km: "Prompt ច្នៃប្រឌិត", en: "Creative", hint: "សម្បូរពាក្យសិល្បៈ" },
  { value: "catalog", km: "កាតាឡុក", en: "Catalog", hint: "ពណ៌ សម្ភារៈ និងសម្លៀកបំពាក់" },
];
const detailLevels = [
  { value: "concise", km: "ខ្លី", en: "Concise" },
  { value: "balanced", km: "លម្អិតល្មម", en: "Balanced" },
  { value: "deep", km: "លម្អិតខ្លាំង", en: "Deep" },
];

function formatBytes(bytes: number) {
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

export function ImageDescriptionStudio() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [preset, setPreset] = useState("faithful");
  const [detail, setDetail] = useState("balanced");
  const [customInstructions, setCustomInstructions] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [model, setModel] = useState("");
  const [prompt, setPrompt] = useState("");
  const [translationScope, setTranslationScope] = useState<"prompt" | "summary" | "all">("prompt");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [provider, setProvider] = useState<"qwen" | "openai">("qwen");
  const [localState, setLocalState] = useState<"unknown" | "checking" | "ready" | "offline">("unknown");
  const requestRef = useRef<AbortController | null>(null);
  const translationText = result ? translationScope === "prompt" ? prompt : translationScope === "summary" ? result.summary : descriptionText(result, prompt) : "";
  const translationUrl = googleTranslateUrl(translationText);

  const checkLocal = async () => {
    setLocalState("checking");
    try {
      const response = await fetch("http://127.0.0.1:8765/health", { signal: AbortSignal.timeout(5000) });
      const health = await response.json() as { ready?: boolean };
      setLocalState(response.ok && health.ready ? "ready" : "offline");
    } catch { setLocalState("offline"); }
  };

  const loadFile = useCallback(async (file: File) => {
    requestRef.current?.abort();
    setError("");
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError("សូមប្រើឯកសារ PNG, JPG, WEBP ឬ GIF ប៉ុណ្ណោះ។");
      setStatus("error"); return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError("រូបភាពធំពេក។ ទំហំអតិបរមាគឺ 10MB។");
      setStatus("error"); return;
    }
    const dataUrl = await fileToDataUrl(file);
    setImage(dataUrl); setFileName(file.name); setFileSize(file.size);
    setResult(null); setPrompt(""); setStatus("idle");
  }, []);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.files || []).find((item) => item.type.startsWith("image/"));
      if (file) void loadFile(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [loadFile]);

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void loadFile(file);
    event.target.value = "";
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault(); setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void loadFile(file);
  };
  const loadSample = async () => {
    const response = await fetch("/reference-anime.png");
    const blob = await response.blob();
    await loadFile(new File([blob], "anime-reference.png", { type: blob.type || "image/png" }));
  };
  const analyze = async () => {
    if (!image) return;
    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    setStatus("loading"); setError(""); setResult(null);
    try {
      const response = await fetch(provider === "qwen" ? "http://127.0.0.1:8765/describe" : "/api/describe", {
        method: "POST", headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ image, preset, detail, customInstructions }),
      });
      const payload = await response.json() as { description?: Result; model?: string; error?: string };
      if (!response.ok) throw new Error(payload.error || "ការវិភាគបរាជ័យ។");
      if (!payload.description) throw new Error("Model មិនបានផ្តល់ការពិពណ៌នាទេ។");
      setResult(payload.description); setModel(payload.model || "Vision model");
      setPrompt(payload.description.prompt); setStatus("success"); setTranslationScope("prompt");
      if (provider === "qwen") setLocalState("ready");
      window.setTimeout(() => document.getElementById("results")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    } catch (cause) {
      if (controller.signal.aborted) return;
      setStatus("error");
      const unavailable = cause instanceof TypeError && provider === "qwen";
      if (unavailable) setLocalState("offline");
      setError(unavailable
        ? "មិនអាចភ្ជាប់ Qwen លើកុំព្យូទ័រនេះបានទេ។ សូមបើក Start-Chitra-Qwen.cmd ហើយអនុញ្ញាត Local network access ក្នុង browser ប្រសិនបើមានសំណើ។"
        : cause instanceof Error ? cause.message : "មានបញ្ហាដែលមិនបានរំពឹងទុក។");
    }
  };
  const copyText = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text); setCopied(key);
    window.setTimeout(() => setCopied(""), 1600);
  };
  const selectedPreset = useMemo(() => presets.find((item) => item.value === preset), [preset]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="ចិត្រា AI ទំព័រដើម">
          <span className="brand-mark" aria-hidden="true"><Sparkles size={20} /></span>
          <span><strong>ចិត្រា</strong><small>IMAGE DESCRIPTION AI</small></span>
        </a>
        <div className="privacy-pill"><ShieldCheck size={16} /><span>{provider === "qwen" ? "រូបភាពវិភាគលើកុំព្យូទ័រអ្នក" : "រូបភាពផ្ញើទៅ OpenAI ដើម្បីវិភាគ"}</span><small>{provider === "qwen" ? "LOCAL VISION" : "CLOUD VISION"}</small></div>
      </header>

      <section className="hero" id="top">
        <div className="eyebrow"><span className="live-dot" /> VISION STUDIO · KHMER FIRST</div>
        <h1>មើលរូបភាព។<br /><em>ពិពណ៌នាឲ្យច្បាស់។</em></h1>
        <p>ពិពណ៌នារូបភាពលម្អិតជា English ដោយផ្អែកលើអ្វីដែលមើលឃើញ។ បកប្រែជាខ្មែរតាម Google Translate នៅពេលអ្នកត្រូវការ។</p>
      </section>

      <section className="workspace" aria-label="Image analysis workspace">
        <div className="panel upload-panel">
          <div className="panel-heading">
            <div><span className="step">01</span><h2>ដាក់រូបភាព</h2><small>ADD AN IMAGE</small></div>
            {image && <button className="icon-btn" type="button" onClick={() => { requestRef.current?.abort(); setImage(null); setResult(null); setStatus("idle"); }} aria-label="លុបរូបភាព"><X size={18} /></button>}
          </div>
          <input ref={inputRef} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={onFileChange} />
          {!image ? (
            <div className={`dropzone ${dragging ? "dragging" : ""}`}
              onDragEnter={(e) => { e.preventDefault(); setDragging(true); }} onDragOver={(e) => e.preventDefault()}
              onDragLeave={() => setDragging(false)} onDrop={onDrop}>
              <button className="drop-action" type="button" onClick={() => inputRef.current?.click()}>
                <span className="upload-orbit"><Upload size={24} /></span>
                <strong>អូសរូបភាពមកទីនេះ</strong>
                <span>ឬចុចដើម្បីជ្រើសរើស · paste ក៏បាន</span>
              </button>
              <div className="file-types"><span>PNG</span><span>JPG</span><span>WEBP</span><span>GIF</span><small>MAX 10MB</small></div>
              <button className="sample-link" type="button" onClick={loadSample}><ImageIcon size={15} /> សាកល្បងជាមួយរូប Anime ដើម <ArrowRight size={14} /></button>
            </div>
          ) : (
            <div className="preview-wrap">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image} alt="រូបភាពដែលបានជ្រើសរើសសម្រាប់វិភាគ" />
              <div className="image-meta"><span><FileImage size={15} />{fileName}</span><span>{formatBytes(fileSize)}</span></div>
              <button type="button" className="replace-btn" onClick={() => inputRef.current?.click()}><RefreshCw size={15} /> ប្តូររូបភាព</button>
            </div>
          )}
        </div>

        <div className="panel controls-panel">
          <div className="panel-heading"><div><span className="step">02</span><h2>កំណត់ការវិភាគ</h2><small>ANALYSIS SETTINGS</small></div></div>
          <div className="model-control">
            <label htmlFor="vision-provider">ម៉ូដែល <span>Vision model</span></label>
            <select id="vision-provider" value={provider} disabled={status === "loading"} onChange={e => { setProvider(e.target.value as "qwen" | "openai"); setError(""); setStatus("idle"); setResult(null); }}>
              <option value="qwen">Qwen3.5‑4B · លើកុំព្យូទ័រនេះ</option>
              <option value="openai">OpenAI · Cloud API</option>
            </select>
            {provider === "qwen" && <div className="local-connection">
              <p>ទាញយកពី <a href="https://huggingface.co/unsloth/Qwen3.5-4B-GGUF" target="_blank" rel="noreferrer">Hugging Face</a> · 4-bit · មិនចំណាយ OpenAI credits</p>
              <div><span role="status">{localState === "ready" ? "● Qwen រួចរាល់" : localState === "checking" ? "កំពុងពិនិត្យ…" : localState === "offline" ? "○ មិនទាន់ភ្ជាប់ / កំពុងបើក model" : "○ សូមបើក local model ជាមុន"}</span><button type="button" onClick={checkLocal} disabled={localState === "checking"}>ពិនិត្យការភ្ជាប់</button></div>
              <p>បើក <a href="/Start-Chitra-Qwen.cmd" download>Start-Chitra-Qwen.cmd</a> លើ PC ដែលបានដំឡើង។ បន្ទាប់មកចុចពិនិត្យការភ្ជាប់។</p>
              <p>បើ browser រារាំងការភ្ជាប់ សូម <a href="http://127.0.0.1:5173/">បើកកម្មវិធីលើ PC</a>។</p>
              <p>EN ONLY · Qwen សរសេរតែ English ដើម្បីកាត់បន្ថយពេលបង្កើតអត្ថបទ។ ប៊ូតុងបកប្រែខ្មែរមិនប្រើ GPU របស់អ្នកទេ។</p>
            </div>}
          </div>
          <fieldset className="control-group">
            <legend>គោលបំណង <span>Prompt preset</span></legend>
            <div className="preset-grid">{presets.map((item) => (
              <button key={item.value} type="button" className={preset === item.value ? "selected" : ""} onClick={() => setPreset(item.value)} aria-pressed={preset === item.value}>
                <span>{item.km}</span><small>{item.en}</small>{preset === item.value && <Check size={14} />}
              </button>
            ))}</div>
            <p className="setting-hint">{selectedPreset?.hint}</p>
          </fieldset>
          <fieldset className="control-group">
            <legend>កម្រិតលម្អិត <span>Level of detail</span></legend>
            <div className="segmented">{detailLevels.map((item) => (
              <button key={item.value} type="button" className={detail === item.value ? "selected" : ""} onClick={() => setDetail(item.value)} aria-pressed={detail === item.value}>
                {item.km}<small>{item.en}</small>
              </button>
            ))}</div>
          </fieldset>
          <label className="instructions-label">
            <span>ការណែនាំបន្ថែម <small>OPTIONAL</small></span>
            <textarea value={customInstructions} onChange={(e) => setCustomInstructions(e.target.value.slice(0, 800))} placeholder="ឧ. ផ្តោតលើពន្លឺ និងសម្លៀកបំពាក់..." rows={3} />
            <b>{customInstructions.length}/800</b>
          </label>
          <button className="analyze-btn" type="button" disabled={!image || status === "loading"} onClick={analyze}>
            {status === "loading" ? <><LoaderCircle className="spin" size={20} /> កំពុងមើល និងសរសេរ…</> : <><Sparkles size={20} /> វិភាគរូបភាព <span>Analyze image</span><ArrowRight size={18} /></>}
          </button>
          <p className="privacy-note"><ShieldCheck size={14} /> {provider === "qwen" ? "រូបភាពផ្ញើតែទៅ local Qwen លើ PC របស់អ្នក។" : "API key សម្ងាត់នៅ server-side។ OpenAI API ត្រូវការ credits។"}</p>
        </div>
      </section>

      {status === "loading" && <section className="processing" aria-live="polite">
        <div className="scan-card"><div className="scan-line" /><ImageIcon size={30} /></div>
        <div><strong>កំពុងពិនិត្យភស្តុតាងក្នុងរូបភាព</strong><span>{provider === "qwen" ? "Qwen3.5‑4B is generating English only on your PC." : "Analyzing appearance, pose, composition, style and mood in English…"}</span></div>
      </section>}
      {status === "error" && error && <section className="error-card" role="alert">
        <AlertCircle size={20} /><div><strong>មិនអាចបញ្ចប់ការវិភាគបានទេ</strong><p>{error}</p></div><button type="button" onClick={analyze}>សាកម្តងទៀត</button>
      </section>}

      {result && status === "success" && <section className="results" id="results">
        <div className="results-heading">
          <div><span className="step">03</span><h2>លទ្ធផលពិពណ៌នា</h2><small>STRUCTURED DESCRIPTION · {model}</small></div>
          <span className="english-badge" lang="en">ENGLISH ONLY</span>
        </div>
        <details className="translation-panel">
          <summary>បកប្រែជាខ្មែរ <span>Google Translate ↗</span></summary>
          <div className="translation-content">
            <label htmlFor="translation-scope">ជ្រើសអត្ថបទសម្រាប់បកប្រែ</label>
            <select id="translation-scope" value={translationScope} onChange={event => setTranslationScope(event.target.value as "prompt" | "summary" | "all")}>
              <option value="prompt">Prompt ដែលបានកែសម្រួល</option>
              <option value="summary">សេចក្តីសង្ខេប · Overview</option>
              <option value="all">ការពិពណ៌នាទាំងមូល · Full description</option>
            </select>
            <textarea aria-label="Text to translate" lang="en" readOnly value={translationText} rows={5} />
            <p>ពេលចុចប៊ូតុងខាងក្រោម អត្ថបទនេះនឹងផ្ញើទៅ Google Translate ក្នុង tab ថ្មី។ រូបភាពមិនផ្ញើទៅ Google ទេ ហើយការបកប្រែមិនប្រើ Qwen ឬ GPU របស់ PC។</p>
            {translationUrl ? <a className="translate-link" href={translationUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">បើក Google Translate · English → ខ្មែរ ↗</a> : <p role="status">អត្ថបទមាន {translationText.length.toLocaleString()} តួអក្សរ។ សូមជ្រើស Prompt ឬសេចក្តីសង្ខេប ដែលមានមិនលើស {MAX_TRANSLATION_CHARACTERS.toLocaleString()} តួអក្សរ។</p>}
          </div>
        </details>
        <article className="summary-card">
          <div className="summary-label"><Sparkles size={16} /> សេចក្តីសង្ខេប <span>OVERVIEW</span></div>
          <p lang="en">{result.summary}</p>
          <button type="button" className="copy-corner" onClick={() => copyText(result.summary, "summary")} aria-label="ចម្លងសេចក្តីសង្ខេប">{copied === "summary" ? <Check size={17} /> : <Copy size={17} />}</button>
        </article>
        <div className="section-grid">{(Object.keys(sectionLabels) as SectionKey[]).map((key, index) => (
          <article className="result-card" key={key}>
            <div className="result-card-head"><span>{String(index + 1).padStart(2, "0")}</span><h3>{sectionLabels[key][0]}<small>{sectionLabels[key][1]}</small></h3></div>
            <p lang="en">{result.sections[key]}</p>
          </article>
        ))}</div>
        <div className="evidence-grid">
          <article className="evidence-card confirmed"><h3><Check size={18} /> អ្វីដែលមើលឃើញច្បាស់ <small>CONFIRMED EVIDENCE</small></h3><ul lang="en">{result.evidence.confirmed.map((item, i) => <li key={i}>{item}</li>)}</ul></article>
          <article className="evidence-card uncertain"><h3><AlertCircle size={18} /> ចំណុចមិនច្បាស់ <small>CALIBRATED UNCERTAINTY</small></h3>{result.evidence.uncertain.length ? <ul lang="en">{result.evidence.uncertain.map((item, i) => <li key={i}>{item}</li>)}</ul> : <p lang="en">No material visual ambiguity noted.</p>}</article>
        </div>
        <article className="prompt-card">
          <div className="prompt-heading"><div><Clipboard size={18} /><h3>Prompt អាចកែសម្រួលបាន<small>EDITABLE RECONSTRUCTION PROMPT</small></h3></div><button type="button" onClick={() => copyText(prompt, "prompt")}>{copied === "prompt" ? <><Check size={16} /> បានចម្លង</> : <><Copy size={16} /> ចម្លង Prompt</>}</button></div>
          <textarea lang="en" value={prompt} onChange={(e) => setPrompt(e.target.value)} aria-label="Editable prompt" rows={8} />
          <p>កែសម្រួលបានដោយសេរី មុនពេលយកទៅប្រើក្នុង image generator។</p>
        </article>
      </section>}

      <footer><div><Sparkles size={16} /> ចិត្រា AI</div><p>ការពិពណ៌នាដោយ AI អាចមានកំហុស។ សូមពិនិត្យជានិច្ច។</p><span>VISION, WITH EVIDENCE.</span></footer>
    </main>
  );
}
