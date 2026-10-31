"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LoaderCircle, MessageCircle, RefreshCw, Send, Sparkles, X } from "lucide-react";

type ChatMessage = { role: "user" | "assistant"; content: string };

const MAX_INPUT_CHARS = 4000;
const MAX_HISTORY_MESSAGES = 20;

export function ChatPanel() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const session = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => { session.current += 1; abortRef.current?.abort(); }, []);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, sending, open]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || sending) return;
    const id = ++session.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const history = [...messages, { role: "user", content: text } as ChatMessage];
    setMessages(history);
    setDraft("");
    setError("");
    setSending(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ messages: history.slice(-MAX_HISTORY_MESSAGES) }),
      });
      const payload = await response.json() as { reply?: string; truncated?: boolean; error?: string };
      if (id !== session.current) return;
      const reply = typeof payload.reply === "string" && payload.reply ? payload.reply : "";
      if (!response.ok || !reply) {
        throw new Error(payload.error || "Qwen មិនអាចឆ្លើយបានទេ។ សូមត្រួតពិនិត្យ local model រួចសាកម្តងទៀត។");
      }
      // The displayed assistant message is the generated reply only — never the user's own text.
      setMessages((current) => (id === session.current
        ? [...current, { role: "assistant", content: payload.truncated ? `${reply}…` : reply }]
        : current));
    } catch (cause) {
      if (id !== session.current) return;
      if (cause instanceof Error && cause.name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : "មានបញ្ហាដែលមិនបានរំពឹងទុក។");
    } finally {
      if (id === session.current) setSending(false);
    }
  }, [draft, messages, sending]);

  const clearChat = () => {
    session.current += 1;
    abortRef.current?.abort();
    setMessages([]);
    setError("");
    setSending(false);
  };

  return (
    <>
      <button
        type="button"
        className="chitra-chat-launcher"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={open ? "បិទប្រឡីឆាត" : "បើកឆាតជាមួយ Qwen"}
      >
        {open ? <X size={20} /> : <><MessageCircle size={18} /> ឆាតជាមួយ Qwen</>}
      </button>

      {open && (
        <section className="chitra-chat-panel" aria-label="Chat with local Qwen">
          <div className="chitra-chat-head">
            <div><Sparkles size={16} /><strong>Qwen3.5‑4B Chat</strong><small>LOCAL · PLAIN TEXT</small></div>
            <div>
              <button type="button" onClick={clearChat} aria-label="សម្អាតការសន្ទនា"><RefreshCw size={15} /></button>
              <button type="button" onClick={() => setOpen(false)} aria-label="បិទ"><X size={15} /></button>
            </div>
          </div>

          <div className="chitra-chat-log" ref={listRef} role="log" aria-live="polite">
            {messages.length === 0 && !sending && (
              <p className="chitra-chat-empty">សួរ Qwen អ្វីក៏បាន — ខ្មែរ ឬ English។ ចម្លើយត្រូវបានបង្កើតលើ PC របស់អ្នក ហើយមិនប្រើ JSON validator របស់ការវិភាគរូបភាពទេ។</p>
            )}
            {messages.map((message, index) => (
              <div key={index} className={`chitra-chat-bubble ${message.role}`}>{message.content}</div>
            ))}
            {sending && <div className="chitra-chat-bubble assistant pending"><LoaderCircle className="spin" size={15} /> កំពុងគិត…</div>}
          </div>

          {error && <p className="chitra-chat-error" role="alert">{error}</p>}

          <div className="chitra-chat-input-row">
            <textarea
              rows={2}
              value={draft}
              disabled={sending}
              maxLength={MAX_INPUT_CHARS}
              placeholder="พิมพ์ข้อความ… (Enter ផ្ញើ, Shift+Enter បន្ទាត់)"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
            />
            <button type="button" className="chitra-chat-send" onClick={() => void send()} disabled={sending || !draft.trim()} aria-label="ផ្ញើសារ">
              {sending ? <LoaderCircle className="spin" size={18} /> : <Send size={18} />}
            </button>
          </div>
          <small className="chitra-chat-note">អត្ថបទឆាតត្រូវបានរក្សាទុកតែក្នុង browser tab នេះ។ {draft.length}/{MAX_INPUT_CHARS}</small>
        </section>
      )}
    </>
  );
}
