"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { DomainError, accounts, agents, approvals, getDb, logs, oauth, users } from "@jarvisgram/db";
import { PUBLISH_MODES, type PublishMode } from "@jarvisgram/shared";
import { t } from "./i18n";
import { SESSION_COOKIE, currentSession, requireSession, safeNext, setSessionCookie } from "./session";

export type FormState = { error?: string; ok?: string } | undefined;

const str = (f: FormData, k: string) => String(f.get(k) ?? "");
const fail = (e: unknown): FormState => {
  if (e instanceof DomainError) return { error: e.message };
  throw e;
};

// ---------- Auth ----------

export async function signupAction(_: FormState, f: FormData): Promise<FormState> {
  try {
    const { user } = await users.signUp(getDb(), { email: str(f, "email"), password: str(f, "password"), name: str(f, "name") });
    const s = await users.createSession(getDb(), user.id);
    await setSessionCookie(s.token, s.expiresAt);
  } catch (e) {
    return fail(e);
  }
  redirect(safeNext(str(f, "next"), "/connect"));
}

export async function loginAction(_: FormState, f: FormData): Promise<FormState> {
  const user = await users.authenticate(getDb(), str(f, "email"), str(f, "password"));
  if (!user) return { error: t.auth.invalid };
  const s = await users.createSession(getDb(), user.id);
  await setSessionCookie(s.token, s.expiresAt);
  redirect(safeNext(str(f, "next")));
}

export async function logoutAction() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await users.deleteSession(getDb(), token);
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}

// ---------- OAuth rozilik ----------

export async function consentAction(f: FormData) {
  const reqId = str(f, "req");
  const s = await currentSession();
  if (!s) redirect(`/login?next=${encodeURIComponent(`/oauth/consent?req=${reqId}`)}`);
  const db = getDb();
  const url =
    str(f, "decision") === "approve"
      ? await oauth.approveAuthorization(db, reqId, s.user.id)
      : await oauth.denyAuthorization(db, reqId);
  if (str(f, "decision") === "approve")
    await logs.addLog({ db, workspaceId: s.workspace.id, actor: "user" }, { message: "Claude Jarvisgram'ga ulandi", tool: "oauth" });
  redirect(url);
}

export async function revokeConnectionAction(f: FormData) {
  const { user } = await requireSession();
  await oauth.revokeConnection(getDb(), user.id, str(f, "tokenId"));
  revalidatePath("/connect");
}

// ---------- Akkauntlar ----------

export async function addAccountAction(_: FormState, f: FormData): Promise<FormState> {
  const { ctx } = await requireSession();
  const mode = str(f, "publishMode");
  try {
    const acc = await accounts.addAccount(ctx, {
      username: str(f, "username"),
      chromeProfile: str(f, "chromeProfile") || undefined,
      publishMode: (PUBLISH_MODES as readonly string[]).includes(mode) ? (mode as PublishMode) : "chrome",
    });
    await logs.addLog(ctx, { message: `@${acc.username} akkaunti qo'shildi`, tool: "web" });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/accounts");
  return { ok: "Akkaunt qo'shildi" };
}

export async function switchAccountAction(f: FormData) {
  const { ctx } = await requireSession();
  const acc = await accounts.switchAccount(ctx, { accountId: str(f, "accountId") });
  await logs.addLog(ctx, { message: `Faol akkaunt: @${acc.username}`, tool: "web" });
  revalidatePath("/", "layout");
}

// ---------- Tasdiqlash ----------

export async function resolveApprovalAction(_: FormState, f: FormData): Promise<FormState> {
  const { ctx } = await requireSession();
  const decision = str(f, "decision") === "approve" ? "approve" : "reject";
  try {
    const r = await approvals.resolveApproval(ctx, { taskId: str(f, "taskId"), decision, note: str(f, "note") || undefined, byUser: true });
    await agents.recomputeAgents(ctx);
    await logs.addLog(ctx, {
      message: decision === "approve" ? `Foydalanuvchi tasdiqladi: "${r.task.title}"` : `Rad etildi: "${r.task.title}"`,
      tool: "web",
      data: { taskId: r.task.id },
    });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/tasks");
  return { ok: decision === "approve" ? "Tasdiqlandi. Claude'ga bajarishni ayting." : "Rad etildi" };
}

export async function toggleAgentPauseAction(f: FormData) {
  const { ctx } = await requireSession();
  await agents.setAgentPaused(ctx, str(f, "agentId"), str(f, "paused") === "true");
  revalidatePath("/office");
}
