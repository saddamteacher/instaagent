import { isPublishPayload, type ActionPayload } from "@jarvisgram/shared";
import type { Prisma } from "../generated/prisma/client";
import { DomainError } from "../errors";
import { notify } from "../events";
import type { Ctx } from "./context";
import { getTask } from "./tasks";

export function listApprovals(ctx: Ctx, opts: { accountId?: string } = {}) {
  return ctx.db.task.findMany({
    where: { workspaceId: ctx.workspaceId, status: "awaiting_approval", ...(opts.accountId ? { accountId: opts.accountId } : {}) },
    orderBy: { submittedAt: "asc" },
    include: { account: { select: { username: true, publishMode: true } }, agent: { select: { name: true } } },
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
  /** Foydalanuvchi tahrirlagan caption / javob matni (faqat veb-ilova) */
  editedText?: string;
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
    return { task: t };
  }

  if (!input.byUser) {
    const code = input.approvalCode?.trim().toUpperCase();
    if (!code || code !== task.approvalCode)
      throw new DomainError(
        "approval_code_invalid",
        "Tasdiqlash kodi noto'g'ri yoki berilmagan. Foydalanuvchi kodni Jarvisgram veb-ilovasidagi 'Tasdiq kutmoqda' bo'limidan ko'rib aytishi yoki o'sha yerda o'zi tasdiqlashi kerak.",
      );
  }

  // Foydalanuvchi veb-ilovada matnni tahrirlagan bo'lsa — tasdiqlangan payload shu matn bilan
  let payload = task.payload as ActionPayload | null;
  if (input.editedText !== undefined && payload) {
    if (!input.byUser) throw new DomainError("forbidden", "Matnni faqat foydalanuvchi veb-ilovada tahrirlay oladi");
    const text = input.editedText.trim();
    if (!text) throw new DomainError("invalid_input", "Matn bo'sh bo'lmasin");
    payload = isPublishPayload(payload) ? { ...payload, caption: text } : { ...payload, reply: text };
  }

  const t = await ctx.db.task.update({
    where: { id: task.id },
    data: {
      status: "approved",
      approvedAt: new Date(),
      reviewNote: input.note ?? null,
      approvalCode: null,
      ...(payload ? { payload: payload as unknown as Prisma.InputJsonValue } : {}),
    },
  });
  if (t.contentItemId) await ctx.db.contentItem.update({ where: { id: t.contentItemId }, data: { status: "approved" } });
  await notify(ctx.db, { workspaceId: ctx.workspaceId, type: "task", refId: t.id, message: "Tasdiqlandi" });
  return { task: t };
}
