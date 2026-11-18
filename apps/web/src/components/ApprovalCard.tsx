"use client";

import { useActionState, useState } from "react";
import type { ActionPayload } from "@jarvisgram/shared";
import { resolveApprovalAction, type FormState } from "@/lib/actions";

export interface ApprovalView {
  id: string;
  title: string;
  kindLabel: string;
  roleTitle: string;
  agentName: string | null;
  username: string | null;
  publishMode: "chrome" | "graph_api" | null;
  code: string | null;
  payload: ActionPayload | null;
  /** payload bo'lmasa (masalan, ixtiyoriy ko'rib chiqish) — natija JSON */
  result: string;
  /** Serverda formatlangan (hydration mos kelishi uchun). */
  submittedAt: string | null;
  scheduledLabel: string | null;
}

/** Tasdiq kartasi: Instagram'da qanday ko'rinishini ko'rsatadi, matnni tahrirlab tasdiqlash mumkin. */
export function ApprovalCard({ a }: { a: ApprovalView }) {
  const [state, action, pending] = useActionState<FormState, FormData>(resolveApprovalAction, undefined);
  const p = a.payload;
  const original = p ? (p.kind === "publish" ? p.caption : p.reply) : "";
  const [text, setText] = useState(original);
  if (state?.ok) return <div className="alert ok">{state.ok}</div>;
  const edited = p !== null && text !== original;

  return (
    <form action={action} className="card" style={{ marginTop: 0 }}>
      <input type="hidden" name="taskId" value={a.id} />
      {edited && <input type="hidden" name="editedText" value={text} />}
      <div className="row" style={{ paddingTop: 0 }}>
        <span className="grow">
          <b>{a.title}</b>
          <div className="muted">
            {a.kindLabel} · {a.agentName ?? a.roleTitle} ({a.roleTitle}){a.username ? ` · @${a.username}` : ""}
            {a.publishMode ? ` · ${a.publishMode === "graph_api" ? "Graph API" : "Claude in Chrome"}` : ""}
            {a.submittedAt ? ` · ${a.submittedAt}` : ""}
          </div>
        </span>
        {a.code && (
          <span title="Claude orqali tasdiqlash uchun shu kodni ayting">
            <span className="muted">Kod </span>
            <span className="approval-code">{a.code}</span>
          </span>
        )}
      </div>

      {p?.kind === "publish" && (
        <div className="ig-preview">
          <div className="ig-head">
            <span className="ig-avatar" aria-hidden /> <b>{a.username ?? "akkaunt"}</b>
            <span className="badge" style={{ marginLeft: "auto" }}>
              {p.type}
            </span>
          </div>
          {p.mediaUrls[0] && /\.(jpe?g|png|webp|gif)(\?|$)/i.test(p.mediaUrls[0]) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="ig-media" src={p.mediaUrls[0]} alt="Post rasmi" referrerPolicy="no-referrer" />
          ) : (
            <div className="ig-media ig-placeholder">
              {p.mediaUrls.length ? `${p.mediaUrls.length} ta media fayl` : "Media nashr paytida tanlanadi"}
            </div>
          )}
          <div className="field" style={{ margin: "10px 0 6px" }}>
            <label htmlFor={`text-${a.id}`}>Caption (tahrirlash mumkin)</label>
            <textarea id={`text-${a.id}`} rows={5} value={text} onChange={(e) => setText(e.target.value)} maxLength={2200} />
          </div>
          {p.hashtags.length > 0 && <div className="ig-tags">{p.hashtags.join(" ")}</div>}
          {p.audioUrl && (
            <div className="field" style={{ margin: "6px 0" }}>
              <span className="muted">Ovoz (voiceover)</span>
              <audio controls preload="none" src={p.audioUrl} style={{ width: "100%" }} />
            </div>
          )}
          {a.scheduledLabel && <div className="muted">Rejalashtirilgan: {a.scheduledLabel}</div>}
        </div>
      )}

      {p && p.kind !== "publish" && (
        <div className="ig-preview">
          <div className="muted">
            {p.kind === "dm" ? "Kelgan xabar" : "O'z postingizdagi izoh"}
            {p.targetRef.startsWith("https://") && (
              <>
                {" "}
                ·{" "}
                <a href={p.targetRef} target="_blank" rel="noreferrer noopener">
                  ochish
                </a>
              </>
            )}
          </div>
          <div className="ig-msg in">{p.originalText || "—"}</div>
          <div className="field" style={{ margin: "8px 0 0" }}>
            <label htmlFor={`text-${a.id}`}>Javob (tahrirlash mumkin)</label>
            <textarea id={`text-${a.id}`} rows={3} value={text} onChange={(e) => setText(e.target.value)} maxLength={2200} />
          </div>
        </div>
      )}

      {!p && <pre className="result">{a.result}</pre>}

      {state?.error && (
        <div className="alert error" role="alert">
          {state.error}
        </div>
      )}
      <div className="inline" style={{ marginTop: 10 }}>
        <div className="field">
          <label htmlFor={`note-${a.id}`}>Izoh (ixtiyoriy)</label>
          <input id={`note-${a.id}`} name="note" placeholder="Masalan: hook qisqaroq bo'lsin" />
        </div>
        <button className="btn" name="decision" value="approve" disabled={pending || (p !== null && !text.trim())}>
          {edited ? "Tahrirlab tasdiqlash" : "Tasdiqlash"}
        </button>
        <button className="btn ghost" name="decision" value="reject" disabled={pending}>
          Rad etish
        </button>
      </div>
    </form>
  );
}
