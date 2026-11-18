import { DomainError, notFound } from "../errors";
import { notify } from "../events";
import { getAccount } from "./accounts";
import type { Ctx } from "./context";

export function getActiveMeeting(ctx: Ctx) {
  return ctx.db.meeting.findFirst({ where: { workspaceId: ctx.workspaceId, endedAt: null }, orderBy: { startedAt: "desc" } });
}

/** Yangi majlis. Ochiq qolgan oldingi majlis avtomatik yopiladi. */
export async function startMeeting(ctx: Ctx, input: { command: string; accountId?: string }) {
  if (!input.command.trim()) throw new DomainError("invalid_input", "Buyruq matni bo'sh");
  let accountId = input.accountId;
  if (accountId) await getAccount(ctx, accountId);
  else accountId = (await ctx.db.workspace.findUniqueOrThrow({ where: { id: ctx.workspaceId } })).activeAccountId ?? undefined;

  await ctx.db.meeting.updateMany({ where: { workspaceId: ctx.workspaceId, endedAt: null }, data: { endedAt: new Date() } });
  const m = await ctx.db.meeting.create({
    data: { workspaceId: ctx.workspaceId, command: input.command.trim().slice(0, 2000), accountId: accountId ?? null },
  });
  await notify(ctx.db, { workspaceId: ctx.workspaceId, type: "meeting", refId: m.id, message: m.command });
  return m;
}

export async function endMeeting(ctx: Ctx, input: { meetingId?: string; summary?: string }) {
  const m = input.meetingId
    ? await ctx.db.meeting.findFirst({ where: { id: input.meetingId, workspaceId: ctx.workspaceId } })
    : await getActiveMeeting(ctx);
  if (!m) throw notFound("Ochiq majlis");
  if (m.endedAt) throw new DomainError("invalid_transition", "Majlis allaqachon yakunlangan");
  const ended = await ctx.db.meeting.update({
    where: { id: m.id },
    data: { endedAt: new Date(), summary: input.summary?.slice(0, 4000) ?? null },
  });
  await notify(ctx.db, { workspaceId: ctx.workspaceId, type: "meeting", refId: m.id, message: "Majlis tugadi" });
  return ended;
}
