import {
  DEFAULT_TZ,
  ROLE_GUIDES,
  TIME_RE,
  WEEKDAYS_UZ,
  isPublishPayload,
  nextOccurrence,
  type ActionPayload,
  type AgentRole,
  type TaskKind,
} from "@jarvisgram/shared";
import type { Db } from "../client";
import { DomainError, notFound } from "../errors";
import { notify } from "../events";
import { getAccount } from "./accounts";
import { recomputeAgents } from "./agents";
import type { Ctx } from "./context";
import { graphExecute, type GraphClient } from "./graph";
import { addLog } from "./logs";
import { createTask } from "./tasks";

export interface ScheduleInput {
  title: string;
  role: AgentRole;
  kind?: TaskKind;
  description?: string;
  accountId?: string;
  /** 1..7 (Du..Ya); bo'sh — har kuni */
  weekdays?: number[];
  timeOfDay: string;
  timezone?: string;
}

function validTz(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function validate(i: { role: AgentRole; kind?: TaskKind; weekdays?: number[]; timeOfDay: string; timezone?: string; title: string }) {
  if (!i.title.trim()) throw new DomainError("invalid_input", "Jadval nomi bo'sh");
  if (!TIME_RE.test(i.timeOfDay)) throw new DomainError("invalid_input", "Vaqt HH:MM formatida bo'lsin (masalan 09:00)");
  const wd = [...new Set(i.weekdays ?? [])].sort();
  if (wd.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) throw new DomainError("invalid_input", "Hafta kunlari 1 (Du) … 7 (Ya)");
  const tz = i.timezone ?? DEFAULT_TZ;
  if (!validTz(tz)) throw new DomainError("invalid_input", `Noma'lum vaqt mintaqasi: ${tz}`);
  const guide = ROLE_GUIDES[i.role];
  const kind = i.kind ?? guide.allowedKinds[0]!;
  if (!guide.allowedKinds.includes(kind))
    throw new DomainError("invalid_input", `${guide.title} roli "${kind}" turini bajara olmaydi. Ruxsat: ${guide.allowedKinds.join(", ")}`);
  return { weekdays: wd, tz, kind };
}

/** "Du, Ch 09:00" ko'rinishidagi matn */
export function describeCadence(s: { weekdays: number[]; timeOfDay: string }) {
  const days = s.weekdays.length === 0 || s.weekdays.length === 7 ? "Har kuni" : s.weekdays.map((d) => WEEKDAYS_UZ[d - 1]).join(", ");
  return `${days} ${s.timeOfDay}`;
}

export async function createSchedule(ctx: Ctx, input: ScheduleInput) {
  const { weekdays, tz, kind } = validate(input);
  if (input.accountId) await getAccount(ctx, input.accountId);
  const s = await ctx.db.schedule.create({
    data: {
      workspaceId: ctx.workspaceId,
      title: input.title.trim().slice(0, 200),
      description: input.description?.slice(0, 2000) ?? null,
      role: input.role,
      kind,
      accountId: input.accountId ?? null,
      weekdays,
      timeOfDay: input.timeOfDay,
      timezone: tz,
      nextRunAt: nextOccurrence(weekdays, input.timeOfDay, tz, new Date()),
    },
  });
  await notify(ctx.db, { workspaceId: ctx.workspaceId, type: "task", refId: s.id, message: `Jadval: ${s.title}` });
  return s;
}

export function listSchedules(ctx: Ctx) {
  return ctx.db.schedule.findMany({
    where: { workspaceId: ctx.workspaceId },
    orderBy: [{ enabled: "desc" }, { nextRunAt: "asc" }],
    include: { account: { select: { username: true } } },
  });
}

export async function updateSchedule(
  ctx: Ctx,
  id: string,
  patch: { enabled?: boolean; title?: string; weekdays?: number[]; timeOfDay?: string; description?: string },
) {
  const cur = await ctx.db.schedule.findFirst({ where: { id, workspaceId: ctx.workspaceId } });
  if (!cur) throw notFound("Jadval");
  const merged = {
    title: patch.title ?? cur.title,
    role: cur.role,
    kind: cur.kind,
    weekdays: patch.weekdays ?? cur.weekdays,
    timeOfDay: patch.timeOfDay ?? cur.timeOfDay,
    timezone: cur.timezone,
  };
  const { weekdays } = validate(merged);
  const enabled = patch.enabled ?? cur.enabled;
  return ctx.db.schedule.update({
    where: { id },
    data: {
      title: merged.title.trim().slice(0, 200),
      description: patch.description ?? cur.description,
      weekdays,
      timeOfDay: merged.timeOfDay,
      enabled,
      nextRunAt: enabled ? nextOccurrence(weekdays, merged.timeOfDay, cur.timezone, new Date()) : null,
    },
  });
}

export async function deleteSchedule(ctx: Ctx, id: string) {
  const r = await ctx.db.schedule.deleteMany({ where: { id, workspaceId: ctx.workspaceId } });
  if (!r.count) throw notFound("Jadval");
}

/**
 * Vaqti kelgan jadvallardan vazifa yaratadi (rejalashtiruvchi har daqiqada chaqiradi).
 * Bir nechta server nusxasi bo'lsa ham har bir payt faqat bir marta ishlaydi (nextRunAt bo'yicha "claim").
 * Server uzoq o'chiq bo'lsa — o'tib ketgan paytlar to'planmaydi: bitta vazifa va keyingi kelajak payti.
 */
export async function runDueSchedules(db: Db, now = new Date()) {
  const due = await db.schedule.findMany({ where: { enabled: true, nextRunAt: { lte: now } }, take: 100 });
  const created: string[] = [];
  for (const s of due) {
    const next = nextOccurrence(s.weekdays, s.timeOfDay, s.timezone, now);
    const claim = await db.schedule.updateMany({
      where: { id: s.id, enabled: true, nextRunAt: s.nextRunAt },
      data: { nextRunAt: next, lastRunAt: now },
    });
    if (claim.count !== 1) continue;
    const ctx: Ctx = { db, workspaceId: s.workspaceId, actor: "system" };
    try {
      const { task, agent } = await createTask(ctx, {
        title: s.title,
        role: s.role,
        kind: s.kind,
        description: s.description ?? undefined,
        accountId: s.accountId ?? undefined,
        scheduleId: s.id,
      });
      await recomputeAgents(ctx);
      await addLog(ctx, {
        tool: "scheduler",
        actor: s.role,
        agentId: agent?.id ?? null,
        message: `Rejalashtirilgan vazifa: "${s.title}" (${describeCadence(s)})`,
        data: { taskId: task.id, scheduleId: s.id },
        bubble: "Jadval bo'yicha vazifa!",
      });
      created.push(task.id);
    } catch (e) {
      await addLog(ctx, {
        tool: "scheduler",
        actor: "system",
        message: `Jadval "${s.title}" ishlamadi: ${e instanceof DomainError ? e.message : "ichki xato"}`,
        data: { scheduleId: s.id, ok: false },
      }).catch(() => {});
    }
  }
  return created;
}

const scheduledAtOf = (p: unknown) => {
  const pl = p as ActionPayload | null;
  return pl && isPublishPayload(pl) && pl.scheduledAt ? new Date(pl.scheduledAt) : null;
};

/**
 * Graph API akkauntlari: foydalanuvchi aniq post va vaqtni tasdiqlagan bo'lsa, vaqti kelganda server o'zi nashr qiladi.
 * Hammasi graphExecute orqali — tasdiq, pauza va limit qoidalari bir xil. Xato bo'lgan vazifa avtomatik qayta urinilmaydi.
 */
export async function runDuePublishes(db: Db, client: GraphClient | null, now = new Date()) {
  if (!client) return [];
  const candidates = await db.task.findMany({
    where: {
      status: "approved",
      kind: "publish",
      actionStartedAt: null,
      actionError: null,
      account: { publishMode: "graph_api", graphTokenEnc: { not: null } },
    },
    take: 50,
  });
  const done: string[] = [];
  for (const t of candidates) {
    const at = scheduledAtOf(t.payload);
    if (!at || at > now) continue;
    const ctx: Ctx = { db, workspaceId: t.workspaceId, actor: "system" };
    try {
      await graphExecute(ctx, client, t.id);
      await recomputeAgents(ctx);
      await addLog(ctx, {
        tool: "scheduler",
        actor: t.role,
        agentId: t.agentId,
        message: `Rejalashtirilgan nashr bajarildi: "${t.title}"`,
        data: { taskId: t.id },
        bubble: "Vaqtida joyladim!",
      });
      done.push(t.id);
    } catch (e) {
      // too_soon / limit — keyingi daqiqada qayta ko'riladi (actionError qo'yilmagan bo'lsa)
      if (!(e instanceof DomainError && (e.code === "too_soon" || e.code === "limit_reached"))) {
        await addLog(ctx, {
          tool: "scheduler",
          actor: "system",
          message: `Rejalashtirilgan nashr bajarilmadi: "${t.title}" — ${e instanceof Error ? e.message : "xato"}`,
          data: { taskId: t.id, ok: false },
        }).catch(() => {});
      }
    }
  }
  return done;
}

/** Claude uchun: vaqti kelgan, Jarvis bajarishi kerak bo'lgan ishlar. */
export async function dueList(ctx: Ctx, now = new Date()) {
  const [fromSchedules, approved] = await Promise.all([
    ctx.db.task.findMany({
      where: { workspaceId: ctx.workspaceId, scheduleId: { not: null }, status: { in: ["queued", "in_progress"] } },
      orderBy: { createdAt: "asc" },
      include: { schedule: { select: { title: true, weekdays: true, timeOfDay: true } }, account: { select: { username: true } } },
    }),
    ctx.db.task.findMany({
      where: { workspaceId: ctx.workspaceId, status: "approved", requiresApproval: true },
      orderBy: { approvedAt: "asc" },
      include: { account: { select: { username: true, publishMode: true } } },
    }),
  ]);
  const readyActions = approved.filter((t) => {
    const at = scheduledAtOf(t.payload);
    return !at || at <= now;
  });
  return {
    scheduledTasks: fromSchedules.map((t) => ({
      id: t.id,
      title: t.title,
      role: t.role,
      kind: t.kind,
      status: t.status,
      account: t.account?.username ?? null,
      cadence: t.schedule ? describeCadence(t.schedule) : null,
      createdAt: t.createdAt,
    })),
    readyActions: readyActions.map((t) => ({
      id: t.id,
      title: t.title,
      kind: t.kind,
      account: t.account?.username ?? null,
      via: t.account?.publishMode === "graph_api" ? "graph_publish (server avtomatik)" : "action_begin → Chrome → action_complete",
      lastError: t.actionError,
    })),
  };
}
