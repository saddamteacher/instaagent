"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, signupAction, type FormState } from "@/lib/actions";
import { t } from "@/lib/i18n";

export function AuthForm({ mode, next }: { mode: "login" | "signup"; next?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(mode === "login" ? loginAction : signupAction, undefined);
  const q = next ? `?next=${encodeURIComponent(next)}` : "";
  return (
    <form action={action} className="card">
      <div className="logo" style={{ padding: "0 0 8px" }}>
        Jarvis<span>gram</span>
      </div>
      <h1 style={{ marginBottom: 16 }}>{mode === "login" ? t.auth.loginTitle : t.auth.signupTitle}</h1>
      {state?.error && (
        <div className="alert error" role="alert">
          {state.error}
        </div>
      )}
      <input type="hidden" name="next" value={next ?? ""} />
      {mode === "signup" && (
        <div className="field">
          <label htmlFor="name">{t.auth.name}</label>
          <input id="name" name="name" autoComplete="name" />
        </div>
      )}
      <div className="field">
        <label htmlFor="email">{t.auth.email}</label>
        <input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div className="field">
        <label htmlFor="password">
          {t.auth.password}
          {mode === "signup" && <span className="muted"> · {t.auth.passwordHint}</span>}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={mode === "signup" ? 8 : undefined}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
        />
      </div>
      <button className="btn" disabled={pending}>
        {mode === "login" ? t.auth.login : t.auth.signup}
      </button>
      <p className="muted" style={{ marginTop: 14, textAlign: "center" }}>
        {mode === "login" ? (
          <>
            {t.auth.noAccount} <Link href={`/signup${q}`}>{t.auth.signup}</Link>
          </>
        ) : (
          <>
            {t.auth.haveAccount} <Link href={`/login${q}`}>{t.auth.login}</Link>
          </>
        )}
      </p>
    </form>
  );
}
