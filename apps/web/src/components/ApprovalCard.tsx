"use client";

import { useActionState } from "react";
import { resolveApprovalAction, type FormState } from "@/lib/actions";

export interface ApprovalView {
  id: string;
  title: string;
  kindLabel: string;
  roleTitle: string;
  agentName: string | null;
  username: string | null;
  code: string | null;
  result: string;
  /** Serverda formatlangan (hydration mos kelishi uchun). */
  submittedAt: string | null;
}

export function ApprovalCard({ a }: { a: ApprovalView }) {
  const [state, action, pending] = useActionState<FormState, FormData>(resolveApprovalAction, undefined);
  if (state?.ok) return <div className="alert ok">{state.ok}</div>;
  return (
    <form action={action} className="card" style={{ marginTop: 0 }}>
      <input type="hidden" name="taskId" value={a.id} />
      <div className="row" style={{ paddingTop: 0 }}>
        <span className="grow">
          <b>{a.title}</b>
          <div className="muted">
            {a.kindLabel} · {a.agentName ?? a.roleTitle} ({a.roleTitle}){a.username ? ` · @${a.username}` : ""}
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
      <pre className="result">{a.result}</pre>
      {state?.error && <div className="alert error" role="alert">{state.error}</div>}
      <div className="inline">
        <div className="field">
          <label htmlFor={`note-${a.id}`}>Izoh (ixtiyoriy)</label>
          <input id={`note-${a.id}`} name="note" placeholder="Masalan: hook qisqaroq bo'lsin" />
        </div>
        <button className="btn" name="decision" value="approve" disabled={pending}>
          Tasdiqlash
        </button>
        <button className="btn ghost" name="decision" value="reject" disabled={pending}>
          Rad etish
        </button>
      </div>
    </form>
  );
}
