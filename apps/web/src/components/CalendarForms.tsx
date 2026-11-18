"use client";

import { useActionState } from "react";
import { AGENT_ROLES, ROLE_GUIDES, WEEKDAYS_UZ } from "@jarvisgram/shared";
import { createScheduleAction, rescheduleContentAction, type FormState } from "@/lib/actions";
import { t } from "@/lib/i18n";

/** Kontent vaqtini o'zgartirish (Toshkent vaqtida). */
export function RescheduleForm({ contentId, value, disabled }: { contentId: string; value: string; disabled?: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(rescheduleContentAction, undefined);
  return (
    <form action={action} className="inline resched">
      <input type="hidden" name="contentId" value={contentId} />
      <label className="sr-only" htmlFor={`when-${contentId}`}>
        Nashr vaqti
      </label>
      <input id={`when-${contentId}`} type="datetime-local" name="when" defaultValue={value} disabled={disabled} />
      <button className="btn ghost sm" disabled={pending || disabled}>
        Saqlash
      </button>
      {state?.ok && <span className="muted">✓ {state.ok}</span>}
      {state?.error && <span className="badge danger">{state.error}</span>}
    </form>
  );
}

export function ScheduleForm({ accounts }: { accounts: { id: string; username: string }[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createScheduleAction, undefined);
  return (
    <form action={action}>
      {state?.error && <div className="alert error">{state.error}</div>}
      {state?.ok && <div className="alert ok">{state.ok}</div>}
      <div className="inline">
        <div className="field" style={{ flex: "2 1 240px" }}>
          <label htmlFor="sch-title">Nima qilinsin</label>
          <input id="sch-title" name="title" required maxLength={200} placeholder="Masalan: haftalik statistika hisoboti" />
        </div>
        <div className="field">
          <label htmlFor="sch-role">Kim</label>
          <select id="sch-role" name="role" defaultValue="analyst">
            {AGENT_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_GUIDES[r].title} — {ROLE_GUIDES[r].allowedKinds.map((k) => t.kind[k]).join(", ")}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="sch-kind">Turi</label>
          <select id="sch-kind" name="kind" defaultValue="">
            <option value="">Rol bo'yicha standart</option>
            {Object.entries(t.kind).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="inline" style={{ marginTop: 10 }}>
        <fieldset className="field weekdays">
          <legend>Kunlar (belgilanmasa — har kuni)</legend>
          <div>
            {WEEKDAYS_UZ.map((d, i) => (
              <label key={d} className="wd">
                <input type="checkbox" name="weekdays" value={i + 1} /> {d}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="field" style={{ flex: "0 1 130px" }}>
          <label htmlFor="sch-time">Vaqt (Toshkent)</label>
          <input id="sch-time" name="timeOfDay" type="time" required defaultValue="09:00" />
        </div>
        {accounts.length > 0 && (
          <div className="field">
            <label htmlFor="sch-acc">Akkaunt</label>
            <select id="sch-acc" name="accountId" defaultValue="">
              <option value="">Faol akkaunt</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  @{a.username}
                </option>
              ))}
            </select>
          </div>
        )}
        <button className="btn" disabled={pending}>
          Jadval qo'shish
        </button>
      </div>
      <p className="muted" style={{ margin: "10px 0 0" }}>
        Vaqti kelganda ofisda vazifa paydo bo'ladi — Jarvis keyingi safar uni bajaradi. Instagram'da o'zi hech narsa qilmaydi; nashr, izoh
        va DM baribir sizning tasdig'ingizdan o'tadi.
      </p>
    </form>
  );
}
