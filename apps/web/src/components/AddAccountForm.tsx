"use client";

import { useActionState } from "react";
import { addAccountAction, type FormState } from "@/lib/actions";

export function AddAccountForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(addAccountAction, undefined);
  return (
    <form action={action}>
      {state?.error && <div className="alert error" role="alert">{state.error}</div>}
      {state?.ok && <div className="alert ok" role="status">{state.ok}</div>}
      <div className="inline">
        <div className="field">
          <label htmlFor="username">Instagram username</label>
          <input id="username" name="username" placeholder="@mening.dokonim" required autoComplete="off" />
        </div>
        <div className="field">
          <label htmlFor="chromeProfile">Chrome profili (ixtiyoriy)</label>
          <input id="chromeProfile" name="chromeProfile" placeholder="Masalan: Do'kon" autoComplete="off" />
        </div>
        <div className="field" style={{ flex: "0 1 200px" }}>
          <label htmlFor="publishMode">Nashr usuli</label>
          <select id="publishMode" name="publishMode" defaultValue="chrome">
            <option value="chrome">Claude in Chrome</option>
            <option value="graph_api">Rasmiy Graph API</option>
          </select>
        </div>
        <button className="btn" disabled={pending}>
          Qo'shish
        </button>
      </div>
      <p className="muted" style={{ marginTop: 10, marginBottom: 0 }}>
        Parol so'ralmaydi va saqlanmaydi. Instagram sessiyasi sizning Chrome profilingizda qoladi.
      </p>
    </form>
  );
}
