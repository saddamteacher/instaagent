import { ROLE_GUIDES, TASK_STATUSES, TOTAL_DESKS, type TaskStatus } from "@jarvisgram/shared";
import type { Ctx } from "./context";
import { getActiveMeeting } from "./meetings";

/**
 * Ofis simulyatsiyasi uchun yagona holat manbai. Render qatlami (2D canvas yoki
 * keyinroq three.js) faqat shu obyektni o'qiydi.
 */
export async function officeState(ctx: Ctx, opts: { logLimit?: number } = {}) {
  const [ws, agents, meeting, grouped, logs, accounts] = await Promise.all([
    ctx.db.workspace.findUniqueOrThrow({ where: { id: ctx.workspaceId } }),
    ctx.db.agent.findMany({ where: { workspaceId: ctx.workspaceId }, orderBy: { deskNo: "asc" } }),
    getActiveMeeting(ctx),
    ctx.db.task.groupBy({ by: ["status"], where: { workspaceId: ctx.workspaceId }, _count: { _all: true } }),
    ctx.db.logEntry.findMany({
      where: { workspaceId: ctx.workspaceId },
      orderBy: { createdAt: "desc" },
      take: opts.logLimit ?? 15,
    }),
    ctx.db.instagramAccount.findMany({ where: { workspaceId: ctx.workspaceId }, orderBy: { createdAt: "asc" } }),
  ]);

  const taskIds = agents.map((a) => a.currentTaskId).filter((x): x is string => !!x);
  const tasks = taskIds.length
    ? await ctx.db.task.findMany({
        where: { id: { in: taskIds } },
        select: { id: true, title: true, status: true, progress: true, kind: true, accountId: true },
      })
    : [];
  const byId = new Map(tasks.map((t) => [t.id, t]));

  const counts = Object.fromEntries(TASK_STATUSES.map((s) => [s, 0])) as Record<TaskStatus, number>;
  for (const g of grouped) counts[g.status] = g._count._all;

  const active = accounts.find((a) => a.id === ws.activeAccountId) ?? null;
  return {
    workspace: { id: ws.id, name: ws.name },
    activeAccount: active && { id: active.id, username: active.username, status: active.status },
    accounts: accounts.map((a) => ({ id: a.id, username: a.username, status: a.status, publishMode: a.publishMode })),
    meeting: meeting && { id: meeting.id, command: meeting.command, startedAt: meeting.startedAt.toISOString() },
    desks: TOTAL_DESKS,
    agents: agents.map((a) => {
      const t = a.currentTaskId ? byId.get(a.currentTaskId) : undefined;
      return {
        id: a.id,
        name: a.name,
        role: a.role,
        roleTitle: ROLE_GUIDES[a.role].title,
        state: a.state,
        deskNo: a.deskNo,
        paused: a.paused,
        task: t ? { id: t.id, title: t.title, status: t.status, progress: t.progress, kind: t.kind } : null,
      };
    }),
    taskCounts: counts,
    pendingApprovals: counts.awaiting_approval,
    recentLogs: logs.map((l) => ({ id: l.id, actor: l.actor, tool: l.tool, message: l.message, at: l.createdAt.toISOString() })),
    generatedAt: new Date().toISOString(),
  };
}

export type OfficeState = Awaited<ReturnType<typeof officeState>>;
