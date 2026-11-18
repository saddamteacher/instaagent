"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { DomainError, accounts, agents, approvals, billing, commands, content, getDb, graph, logs, oauth, schedules, users } from "@jarvisgram/db";
import { AGENT_ROLES, PUBLISH_MODES, TASK_KINDS, parseLocalDateTime, type AgentRole, type PublishMode, type TaskKind } from "@jarvisgram/shared";
import { TZ, t } from "./i18n";
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
    const editedText = f.has("editedText") ? str(f, "editedText") : undefined;
    const r = await approvals.resolveApproval(ctx, {
      taskId: str(f, "taskId"),
      decision,
      note: str(f, "note") || undefined,
      editedText: decision === "approve" ? editedText : undefined,
      byUser: true,
    });
    await agents.recomputeAgents(ctx);
    await logs.addLog(ctx, {
      message:
        decision === "approve"
          ? `Foydalanuvchi ${editedText !== undefined ? "tahrirlab " : ""}tasdiqladi: "${r.task.title}"`
          : `Rad etildi: "${r.task.title}"`,
      tool: "web",
      data: { taskId: r.task.id },
    });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/tasks");
  return { ok: decision === "approve" ? "Tasdiqlandi. Claude'ga bajarishni ayting." : "Rad etildi" };
}

export async function updateLimitsAction(_: FormState, f: FormData): Promise<FormState> {
  const { ctx } = await requireSession();
  const num = (k: string) => Number(str(f, k));
  try {
    await accounts.updateLimits(ctx, str(f, "accountId"), {
      publish: num("publish"),
      comment_reply: num("comment_reply"),
      dm: num("dm"),
      minPauseSec: num("minPauseSec"),
      maxPauseSec: num("maxPauseSec"),
    });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/accounts");
  return { ok: "Limitlar saqlandi" };
}

export async function disconnectGraphAction(f: FormData) {
  const { ctx } = await requireSession();
  const acc = await graph.disconnectGraph(ctx, str(f, "accountId"));
  await logs.addLog(ctx, { message: `@${acc.username}: Graph API uzildi, Chrome rejimiga qaytdi`, tool: "web" });
  revalidatePath("/accounts");
}

export async function toggleAgentPauseAction(f: FormData) {
  const { ctx } = await requireSession();
  await agents.setAgentPaused(ctx, str(f, "agentId"), str(f, "paused") === "true");
  revalidatePath("/office");
}

// ---------- Kalendar va jadvallar ----------

export async function rescheduleContentAction(_: FormState, f: FormData): Promise<FormState> {
  const { ctx } = await requireSession();
  const raw = str(f, "when");
  const when = raw ? parseLocalDateTime(raw, TZ) : null;
  if (raw && !when) return { error: "Sana noto'g'ri" };
  try {
    const item = await content.rescheduleContent(ctx, str(f, "contentId"), when);
    await logs.addLog(ctx, { message: when ? `Kontent vaqti o'zgartirildi (${raw.replace("T", " ")})` : "Kontent vaqti olib tashlandi", tool: "web", data: { contentItemId: item.id } });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/calendar");
  return { ok: "Saqlandi" };
}

export async function createScheduleAction(_: FormState, f: FormData): Promise<FormState> {
  const { ctx } = await requireSession();
  const role = str(f, "role");
  const kind = str(f, "kind");
  if (!(AGENT_ROLES as readonly string[]).includes(role)) return { error: "Rolni tanlang" };
  try {
    const s = await schedules.createSchedule(ctx, {
      title: str(f, "title"),
      role: role as AgentRole,
      kind: (TASK_KINDS as readonly string[]).includes(kind) ? (kind as TaskKind) : undefined,
      accountId: str(f, "accountId") || undefined,
      weekdays: f.getAll("weekdays").map(Number),
      timeOfDay: str(f, "timeOfDay"),
      timezone: TZ,
    });
    await logs.addLog(ctx, { message: `Jadval yaratildi: "${s.title}" (${schedules.describeCadence(s)})`, tool: "web" });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/calendar");
  return { ok: "Jadval yaratildi" };
}

export async function toggleScheduleAction(f: FormData) {
  const { ctx } = await requireSession();
  await schedules.updateSchedule(ctx, str(f, "scheduleId"), { enabled: str(f, "enabled") === "true" });
  revalidatePath("/calendar");
}

export async function deleteScheduleAction(f: FormData) {
  const { ctx } = await requireSession();
  await schedules.deleteSchedule(ctx, str(f, "scheduleId"));
  revalidatePath("/calendar");
}

export async function graphSyncAction(f: FormData) {
  const { ctx } = await requireSession();
  const cfg = graph.graphConfigFromEnv();
  if (!cfg) return;
  await graph.graphSyncAnalytics(ctx, new graph.GraphClient(cfg), str(f, "accountId"));
  revalidatePath("/analytics");
}

// ---------- Buyruqlar va to'lov ----------

export async function dismissCommandAction(f: FormData) {
  const { ctx } = await requireSession();
  await commands.dismissCommand(ctx, str(f, "commandId"));
  revalidatePath("/office");
}

/** Tarifni sotib olish: buyurtma yaratib, Payme yoki Click sahifasiga yo'naltiradi. */
export async function checkoutAction(f: FormData) {
  const { ctx } = await requireSession();
  const plan = str(f, "plan");
  const provider = str(f, "provider") === "click" ? "click" : "payme";
  if (plan !== "pro" && plan !== "agency") return;
  const web = (process.env.WEB_PUBLIC_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  const p = await billing.createPayment(ctx, { plan, provider, months: Number(str(f, "months")) || 1 });
  const back = `${web}/pricing?order=${p.id}`;
  if (provider === "payme") {
    const cfg = billing.paymeConfigFromEnv();
    if (!cfg) redirect("/pricing?err=payme");
    redirect(billing.paymeCheckoutUrl(cfg, p, back));
  }
  const cfg = billing.clickConfigFromEnv();
  if (!cfg) redirect("/pricing?err=click");
  redirect(billing.clickCheckoutUrl(cfg, p, back));
}
