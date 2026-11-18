"use client";

import { useActionState } from "react";
import type { DailyLimits } from "@jarvisgram/shared";
import { updateLimitsAction, type FormState } from "@/lib/actions";

const FIELDS: { k: keyof DailyLimits; label: string; max: number }[] = [
  { k: "publish", label: "Nashr / kun", max: 50 },
  { k: "comment_reply", label: "Izoh javobi / kun", max: 500 },
  { k: "dm", label: "DM javobi / kun", max: 500 },
  { k: "minPauseSec", label: "Pauza min (s)", max: 7200 },
  { k: "maxPauseSec", label: "Pauza max (s)", max: 7200 },
];

export function LimitsForm({ accountId, limits }: { accountId: string; limits: DailyLimits }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateLimitsAction, undefined);
  return (
    <form action={action} className="limits">
      <input type="hidden" name="accountId" value={accountId} />
      {state?.error && <div className="alert error">{state.error}</div>}
      {state?.ok && <div className="alert ok">{state.ok}</div>}
      <div className="inline">
        {FIELDS.map((f) => (
          <div className="field" key={f.k} style={{ flex: "1 1 110px" }}>
            <label htmlFor={`${accountId}-${f.k}`}>{f.label}</label>
            <input id={`${accountId}-${f.k}`} name={f.k} type="number" min={f.k.includes("Pause") ? 10 : 0} max={f.max} defaultValue={limits[f.k]} required />
          </div>
        ))}
        <button className="btn ghost" disabled={pending}>
          Saqlash
        </button>
      </div>
    </form>
  );
}
