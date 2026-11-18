import type { Prisma } from "../generated/prisma/client";
import { notify } from "../events";
import type { Ctx } from "./context";

export interface LogInput {
  message: string;
  tool?: string;
  agentId?: string | null;
  /** Standart: ctx.actor. Agent nomidan yozilsa — rol nomi. */
  actor?: string;
  data?: Prisma.InputJsonValue;
  /** Ofisdagi gap bulutchasi (agentId yoki actor="jarvis" ustida). */
  bubble?: string;
}

export async function addLog(ctx: Ctx, input: LogInput) {
  const entry = await ctx.db.logEntry.create({
    data: {
      workspaceId: ctx.workspaceId,
      actor: input.actor ?? ctx.actor,
      agentId: input.agentId ?? null,
      tool: input.tool ?? null,
      message: input.message.slice(0, 2000),
      data: input.data ?? undefined,
    },
  });
  await notify(ctx.db, {
    workspaceId: ctx.workspaceId,
    type: "log",
    refId: entry.id,
    message: entry.message,
    actor: entry.actor,
    agentId: entry.agentId ?? undefined,
    bubble: input.bubble?.slice(0, 80),
  });
  return entry;
}

export function listLogs(ctx: Ctx, opts: { limit?: number; agentId?: string; taskId?: string } = {}) {
  return ctx.db.logEntry.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      ...(opts.agentId ? { agentId: opts.agentId } : {}),
      ...(opts.taskId ? { data: { path: ["taskId"], equals: opts.taskId } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(opts.limit ?? 50, 200),
  });
}
