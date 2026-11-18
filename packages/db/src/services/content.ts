import type { ContentType } from "@jarvisgram/shared";
import { DomainError, notFound } from "../errors";
import { notify } from "../events";
import { getAccount } from "./accounts";
import type { Ctx } from "./context";

export interface SaveContentInput {
  /** Berilsa — mavjud qoralamani yangilaydi. */
  id?: string;
  accountId?: string;
  taskId?: string;
  type: ContentType;
  caption: string;
  hashtags?: string[];
  mediaUrl?: string;
  scheduledAt?: Date | null;
}

const normTag = (t: string) => "#" + t.trim().replace(/^#+/, "").replace(/\s+/g, "");

export async function saveContent(ctx: Ctx, input: SaveContentInput) {
  let accountId = input.accountId;
  if (!accountId)
    accountId = (await ctx.db.workspace.findUniqueOrThrow({ where: { id: ctx.workspaceId } })).activeAccountId ?? undefined;
  if (!accountId) throw new DomainError("invalid_input", "Kontent uchun akkaunt kerak");
  await getAccount(ctx, accountId);
  if (input.caption.length > 2200) throw new DomainError("invalid_input", "Caption 2200 belgidan oshmasin");
  const hashtags = [...new Set((input.hashtags ?? []).filter((t) => t.trim()).map(normTag))];
  if (hashtags.length > 30) throw new DomainError("invalid_input", "Instagram 30 tadan ortiq xeshtegga ruxsat bermaydi");

  const data = {
    accountId,
    taskId: input.taskId ?? null,
    type: input.type,
    caption: input.caption,
    hashtags,
    mediaUrl: input.mediaUrl ?? null,
    scheduledAt: input.scheduledAt ?? null,
  };

  let item;
  if (input.id) {
    const existing = await ctx.db.contentItem.findFirst({ where: { id: input.id, workspaceId: ctx.workspaceId } });
    if (!existing) throw notFound("Kontent");
    if (!["draft", "rejected"].includes(existing.status))
      throw new DomainError("invalid_transition", `"${existing.status}" holatidagi kontentni tahrirlab bo'lmaydi`);
    item = await ctx.db.contentItem.update({ where: { id: existing.id }, data: { ...data, status: "draft" } });
  } else {
    item = await ctx.db.contentItem.create({ data: { ...data, workspaceId: ctx.workspaceId } });
  }
  if (input.taskId) {
    const t = await ctx.db.task.findFirst({ where: { id: input.taskId, workspaceId: ctx.workspaceId } });
    if (!t) throw notFound("Vazifa");
    await ctx.db.task.update({ where: { id: t.id }, data: { contentItemId: item.id } });
  }
  await notify(ctx.db, { workspaceId: ctx.workspaceId, type: "content", refId: item.id });
  return item;
}

export function contentCalendar(ctx: Ctx, f: { from: Date; to: Date; accountId?: string }) {
  return ctx.db.contentItem.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      ...(f.accountId ? { accountId: f.accountId } : {}),
      OR: [{ scheduledAt: { gte: f.from, lte: f.to } }, { scheduledAt: null, status: { in: ["draft", "awaiting_approval"] } }],
    },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
    include: { account: { select: { username: true } } },
  });
}
