import { randomInt } from "node:crypto";
import { DomainError } from "../errors";
import { notify } from "../events";
import { readLimits } from "./accounts";
import { startOfUtcDay, type Ctx } from "./context";
import { getTask } from "./tasks";

export function listApprovals(ctx: Ctx, opts: { accountId?: string } = {}) {
  return ctx.db.task.findMany({
    where: { workspaceId: ctx.workspaceId, status: "awaiting_approval", ...(opts.accountId ? { accountId: opts.accountId } : {}) },
    orderBy: { submittedAt: "asc" },
    include: { account: { select: { username: true } }, agent: { select: { name: true } } },
  });
}

export interface ResolveInput {
  taskId: string;
  decision: "approve" | "reject";
  /**
   * Veb-ilovada ko'rsatilgan bir martalik kod. MCP orqali TASDIQLASH uchun majburiy:
   * Claude o'zini o'zi tasdiqlay olmaydi (prompt-injection himoyasi). Rad etish uchun shart emas.
   */
  approvalCode?: string;
  note?: string;
  /** true — foydalanuvchi veb-ilovada o'zi bosdi (sessiya bilan). */
  byUser: boolean;
}

export async function resolveApproval(ctx: Ctx, input: ResolveInput) {
  const task = await getTask(ctx, input.taskId);
  if (task.status !== "awaiting_approval")
    throw new DomainError("invalid_transition", `Vazifa tasdiq kutmayapti (holati: ${task.status})`);

  if (input.decision === "reject") {
    const t = await ctx.db.task.update({
      where: { id: task.id },
      data: { status: "rejected", reviewNote: input.note ?? null, approvalCode: null },
    });
    if (t.contentItemId) await ctx.db.contentItem.update({ where: { id: t.contentItemId }, data: { status: "rejected" } });
    await notify(ctx.db, { workspaceId: ctx.workspaceId, type: "task", refId: t.id, message: "Rad etildi" });
    return { task: t, waitSeconds: 0 };
  }

  if (!input.byUser) {
    const code = input.approvalCode?.trim().toUpperCase();
    if (!code || code !== task.approvalCode)
      throw new DomainError(
        "approval_code_invalid",
        "Tasdiqlash kodi noto'g'ri yoki berilmagan. Foydalanuvchi kodni Jarvisgram veb-ilovasidagi 'Tasdiq kutmoqda' bo'limidan ko'rib aytishi yoki o'sha yerda o'zi tasdiqlashi kerak.",
      );
  }

  let waitSeconds = 0;
  if (task.accountId && task.requiresApproval) {
    const acc = await ctx.db.instagramAccount.findUniqueOrThrow({ where: { id: task.accountId } });
    const limits = readLimits(acc.dailyLimits);
    const limit = limits[task.kind as "publish" | "comment_reply" | "dm"];
    const usedToday = await ctx.db.task.count({
      where: { accountId: acc.id, kind: task.kind, approvedAt: { gte: startOfUtcDay() } },
    });
    if (usedToday >= limit)
      throw new DomainError(
        "limit_reached",
        `@${acc.username} uchun bugungi "${task.kind}" limiti tugadi (${usedToday}/${limit}). Ertaga davom eting yoki limitni sozlamalarda o'zgartiring.`,
      );
    waitSeconds = randomInt(limits.minPauseSec, limits.maxPauseSec + 1);
  }

  const t = await ctx.db.task.update({
    where: { id: task.id },
    data: { status: "approved", approvedAt: new Date(), reviewNote: input.note ?? null, approvalCode: null },
  });
  if (t.contentItemId) await ctx.db.contentItem.update({ where: { id: t.contentItemId }, data: { status: "approved" } });
  await notify(ctx.db, { workspaceId: ctx.workspaceId, type: "task", refId: t.id, message: "Tasdiqlandi" });
  return { task: t, waitSeconds };
}
