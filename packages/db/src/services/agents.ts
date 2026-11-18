import type { AgentRole, AgentState } from "@jarvisgram/shared";
import { notFound } from "../errors";
import { notify } from "../events";
import type { Ctx } from "./context";

const OPEN = ["queued", "in_progress"] as const;

/**
 * Agent holati haqiqiy yozuvlardan hisoblanadi (tasodifiy emas):
 *  - ochiq majlis bor → hamma "meeting"
 *  - in_progress vazifasi bor → "working"
 *  - faqat queued vazifasi bor → "toDesk" (stoliga ketmoqda)
 *  - aks holda → "chill"
 */
export function deriveState(input: {
  meetingActive: boolean;
  hasInProgress: boolean;
  hasQueued: boolean;
}): AgentState {
  if (input.meetingActive) return "meeting";
  if (input.hasInProgress) return "working";
  if (input.hasQueued) return "toDesk";
  return "chill";
}

export async function recomputeAgents(ctx: Ctx) {
  const [agents, meeting, open] = await Promise.all([
    ctx.db.agent.findMany({ where: { workspaceId: ctx.workspaceId } }),
    ctx.db.meeting.findFirst({ where: { workspaceId: ctx.workspaceId, endedAt: null } }),
    ctx.db.task.findMany({
      where: { workspaceId: ctx.workspaceId, status: { in: [...OPEN] }, agentId: { not: null } },
      orderBy: { createdAt: "asc" },
      select: { id: true, agentId: true, status: true },
    }),
  ]);

  let changed = 0;
  for (const a of agents) {
    const mine = open.filter((t) => t.agentId === a.id);
    const inProgress = mine.find((t) => t.status === "in_progress");
    const current = inProgress ?? mine[0] ?? null;
    const state = deriveState({
      meetingActive: !!meeting,
      hasInProgress: !!inProgress,
      hasQueued: mine.length > 0,
    });
    if (state !== a.state || (current?.id ?? null) !== a.currentTaskId) {
      await ctx.db.agent.update({ where: { id: a.id }, data: { state, currentTaskId: current?.id ?? null } });
      changed++;
    }
  }
  if (changed) await notify(ctx.db, { workspaceId: ctx.workspaceId, type: "agents" });
  return changed;
}

/** Rol bo'yicha eng bo'sh (to'xtatilmagan) agentni tanlaydi. */
export async function pickAgent(ctx: Ctx, role: AgentRole) {
  const agents = await ctx.db.agent.findMany({
    where: { workspaceId: ctx.workspaceId, role, paused: false },
    orderBy: { slot: "asc" },
    include: { _count: { select: { tasks: { where: { status: { in: [...OPEN] } } } } } },
  });
  if (!agents.length) return null;
  return agents.reduce((best, a) => (a._count.tasks < best._count.tasks ? a : best));
}

export function listAgents(ctx: Ctx) {
  return ctx.db.agent.findMany({ where: { workspaceId: ctx.workspaceId }, orderBy: { deskNo: "asc" } });
}

export async function setAgentPaused(ctx: Ctx, agentId: string, paused: boolean) {
  const a = await ctx.db.agent.findFirst({ where: { id: agentId, workspaceId: ctx.workspaceId } });
  if (!a) throw notFound("Agent");
  return ctx.db.agent.update({ where: { id: a.id }, data: { paused } });
}
