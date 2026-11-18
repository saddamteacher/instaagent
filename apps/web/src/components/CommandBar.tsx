"use client";

import { useEffect, useRef, useState } from "react";

type Line = { who: "siz" | "agent"; text: string };
type VoiceStatus = "off" | "connecting" | "listening" | "speaking";

async function sendCommand(text: string, source: "web" | "voice") {
  const r = await fetch("/api/commands", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text, source }),
  });
  const j = (await r.json().catch(() => ({}))) as { error?: string; text?: string };
  if (!r.ok) throw new Error(j.error ?? "Buyruqni yozib bo'lmadi");
  return j.text ?? text;
}

/**
 * Veb-ofisdan Jarvisga buyruq: matn yoki ElevenLabs ovozli agent.
 * Buyruq faqat "buyruqlar qutisi"ga yoziladi — Jarvis (Claude ilovangiz) uni keyingi safar olib majlis chaqiradi.
 */
export function CommandBar({ voice }: { voice: { enabled: boolean; reason?: string } }) {
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<VoiceStatus>("off");
  const [lines, setLines] = useState<Line[]>([]);
  const conv = useRef<{ endSession: () => Promise<void> } | null>(null);

  useEffect(() => () => void conv.current?.endSession().catch(() => {}), []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      const t = await sendCommand(text, "web");
      setMsg({ ok: true, text: `Qutiga yozildi: "${t}". Claude'da Jarvisga "buyruqlarni bajar" deng.` });
      setText("");
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const toggleVoice = async () => {
    if (conv.current) {
      await conv.current.endSession().catch(() => {});
      conv.current = null;
      setStatus("off");
      return;
    }
    setStatus("connecting");
    setMsg(null);
    try {
      const r = await fetch("/api/voice/session", { cache: "no-store" });
      const auth = (await r.json()) as { agentId?: string; signedUrl?: string; error?: string };
      if (!r.ok) throw new Error(auth.error ?? "Ovozli agent mavjud emas");
      const { Conversation } = await import("@elevenlabs/client");
      const session = await Conversation.startSession({
        ...(auth.signedUrl ? { signedUrl: auth.signedUrl } : { agentId: auth.agentId! }),
        clientTools: {
          // Agentda xuddi shu nom bilan "client" tool bo'lishi shart (docs/elevenlabs-agent.md)
          jarvis_buyruq: async ({ buyruq }: { buyruq?: string }) => {
            try {
              const t = await sendCommand(String(buyruq ?? ""), "voice");
              setMsg({ ok: true, text: `Ovozli buyruq qutiga yozildi: "${t}"` });
              return "Buyruq Jarvisgram qutisiga yozildi. Jarvis uni Claude ilovasida bajaradi.";
            } catch (err) {
              return `Yozilmadi: ${(err as Error).message}`;
            }
          },
        },
        onModeChange: ({ mode }) => setStatus(mode === "speaking" ? "speaking" : "listening"),
        onStatusChange: ({ status: s }) => s === "disconnected" && setStatus("off"),
        onDisconnect: () => {
          conv.current = null;
          setStatus("off");
        },
        onError: (m) => setMsg({ ok: false, text: `Ovoz: ${m}` }),
        onMessage: (m) => setLines((l) => [...l.slice(-3), { who: String(m.role) === "user" ? "siz" : "agent", text: m.message }]),
      });
      conv.current = session;
      setStatus("listening");
    } catch (err) {
      conv.current = null;
      setStatus("off");
      setMsg({ ok: false, text: (err as Error).message || "Mikrofonga ruxsat berilmadi" });
    }
  };

  const label = { off: "🎙 Ovoz bilan", connecting: "Ulanmoqda…", listening: "● Tinglayapman — to'xtatish", speaking: "● Gapiryapti — to'xtatish" }[status];

  return (
    <section className="card cmdbar" aria-label="Jarvisga buyruq">
      <form className="inline" onSubmit={submit}>
        <div className="field" style={{ flex: "3 1 280px" }}>
          <label htmlFor="cmd-text">Jarvisga buyruq</label>
          <input
            id="cmd-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={1000}
            autoComplete="off"
            placeholder="Masalan: ertangi Reels'ni tayyorlang"
          />
        </div>
        <button className="btn" disabled={busy || !text.trim()}>
          Yuborish
        </button>
        <button
          type="button"
          className={`btn ${status === "off" ? "ghost" : "danger"}`}
          onClick={toggleVoice}
          disabled={!voice.enabled || status === "connecting"}
          title={voice.enabled ? "ElevenLabs ovozli agent" : voice.reason}
          aria-pressed={status !== "off"}
        >
          {label}
        </button>
      </form>
      {!voice.enabled && voice.reason && <p className="muted" style={{ margin: "8px 0 0" }}>{voice.reason}</p>}
      {msg && (
        <div className={`alert ${msg.ok ? "ok" : "error"}`} role="status" style={{ margin: "10px 0 0" }}>
          {msg.text}
        </div>
      )}
      {lines.length > 0 && (
        <div className="log" style={{ marginTop: 8 }} aria-live="polite">
          {lines.map((l, i) => (
            <div key={i}>
              <b>{l.who}</b> {l.text}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
