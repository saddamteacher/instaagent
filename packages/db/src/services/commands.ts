import { DomainError, notFound } from "../errors";
import { notify } from "../events";
import type { Ctx } from "./context";
import { addLog } from "./logs";

/**
 * Buyruqlar qutisi: foydalanuvchi veb-ofisda matn yoki ovoz (ElevenLabs agent) orqali bergan buyruqlar.
 * Bular — foydalanuvchining o'z so'zi; Jarvis ularni olib majlis chaqiradi. Instagram'da hech narsa bajarilmaydi.
 */
export async function createCommand(ctx: Ctx, input: { text: string; source: "web" | "voice" }) {
  const text = input.text.trim().replace(/\s+/g, " ");
  if (text.length < 3) throw new DomainError("invalid_input", "Buyruq juda qisqa");
  if (text.length > 1000) throw new DomainError("invalid_input", "Buyruq 1000 belgidan oshmasin");
  const open = await ctx.db.command.count({ where: { workspaceId: ctx.workspaceId, status: "new" } });
  if (open >= 20) throw new DomainError("limit_reached", "Qutida 20 ta bajarilmagan buyruq bor — avval ularni Claude'ga bajartiring");
  const ws = await ctx.db.workspace.findUniqueOrThrow({ where: { id: ctx.workspaceId } });
  const c = await ctx.db.command.create({
    data: { workspaceId: ctx.workspaceId, text, source: input.source, accountId: ws.activeAccountId },
  });
  await addLog(ctx, {
    tool: "commands",
    actor: "user",
    message: `${input.source === "voice" ? "Ovozli" : "Yozma"} buyruq: "${text}"`,
    data: { commandId: c.id },
    bubble: undefined,
  });
  await notify(ctx.db, { workspaceId: ctx.workspaceId, type: "log", refId: c.id, actor: "jarvis", bubble: "Buyruq qabul qilindi!" });
  return c;
}

export function inbox(ctx: Ctx) {
  return ctx.db.command.findMany({ where: { workspaceId: ctx.workspaceId, status: "new" }, orderBy: { createdAt: "asc" } });
}

export function recentCommands(ctx: Ctx, limit = 10) {
  return ctx.db.command.findMany({ where: { workspaceId: ctx.workspaceId }, orderBy: { createdAt: "desc" }, take: limit });
}

/** Buyruq hali olinmaganini tekshiradi (majlis ochishdan OLDIN chaqiriladi). */
export async function assertNewCommand(ctx: Ctx, commandId: string) {
  const c = await ctx.db.command.findFirst({ where: { id: commandId, workspaceId: ctx.workspaceId } });
  if (!c) throw notFound("Buyruq");
  if (c.status !== "new") throw new DomainError("invalid_transition", "Bu buyruq allaqachon olingan");
  return c;
}

/** Majlis boshlanganda buyruq "olindi" bo'ladi. */
export async function takeCommand(ctx: Ctx, commandId: string, meetingId: string) {
  await assertNewCommand(ctx, commandId);
  const r = await ctx.db.command.updateMany({
    where: { id: commandId, workspaceId: ctx.workspaceId, status: "new" },
    data: { status: "taken", meetingId, takenAt: new Date() },
  });
  if (r.count !== 1) throw new DomainError("invalid_transition", "Bu buyruq allaqachon olingan");
}

/** Majlis tugaganda unga bog'langan buyruqlar bajarildi deb belgilanadi. */
export async function finishForMeeting(ctx: Ctx, meetingId: string) {
  await ctx.db.command.updateMany({ where: { workspaceId: ctx.workspaceId, meetingId, status: "taken" }, data: { status: "done" } });
}

export async function dismissCommand(ctx: Ctx, commandId: string) {
  const r = await ctx.db.command.updateMany({
    where: { id: commandId, workspaceId: ctx.workspaceId, status: "new" },
    data: { status: "dismissed" },
  });
  if (!r.count) throw notFound("Buyruq");
}
