import { randomInt } from "node:crypto";
import {
  PLAYBOOK_FOR_KIND,
  isPublishPayload,
  payloadText,
  type ActionPayload,
  type PublishMode,
} from "@jarvisgram/shared";
import type { Prisma } from "../generated/prisma/client";
import { DomainError } from "../errors";
import { notify } from "../events";
import { normalizeUsername, readLimits } from "./accounts";
import { startOfUtcDay, type Ctx } from "./context";
import { getTask } from "./tasks";

/** action_begin dan keyin shu vaqt ichida action_complete kelmasa — qayta boshlash mumkin. */
export const ACTION_LEASE_MS = 15 * 60 * 1000;

export interface BeginInput {
  taskId: string;
  /** Chrome'da hozir ochiq turgan akkaunt (Claude ko'rgan). Chrome rejimida majburiy. */
  observedUsername?: string;
  /** Kim bajaradi: Claude in Chrome yoki server (Graph API) */
  via: PublishMode;
}

/**
 * Tasdiqlangan harakatni boshlash. Hamma qoidalar shu yerda, bajarishdan OLDIN tekshiriladi:
 * tasdiq, akkaunt holati, Chrome'dagi akkaunt, rejalashtirilgan vaqt, tasodifiy pauza va kunlik limit.
 * Muvaffaqiyatli bo'lsa keyingi harakat uchun yangi tasodifiy pauza belgilanadi.
 */
export async function beginAction(ctx: Ctx, input: BeginInput) {
  const task = await getTask(ctx, input.taskId);
  if (!task.requiresApproval) throw new DomainError("invalid_input", "Bu vazifa Instagram harakati emas");
  if (task.status !== "approved")
    throw new DomainError(
      task.status === "awaiting_approval" ? "approval_required" : "invalid_transition",
      task.status === "awaiting_approval"
        ? "Foydalanuvchi hali tasdiqlamagan. Avval tasdiq kerak."
        : `Vazifa bajarishga tayyor emas (holati: ${task.status})`,
    );
  const payload = task.payload as ActionPayload | null;
  if (!payload || !task.accountId) throw new DomainError("invalid_input", "Vazifada tasdiqlangan payload yoki akkaunt yo'q");

  const acc = await ctx.db.instagramAccount.findUniqueOrThrow({ where: { id: task.accountId } });
  if (acc.status === "limited")
    throw new DomainError("forbidden", `@${acc.username} cheklangan holatda. Instagram cheklovi tugaguncha harakat qilinmaydi.`);
  if (acc.status === "needs_login" || acc.status === "disconnected")
    throw new DomainError("forbidden", `@${acc.username} uchun avval kirish kerak (foydalanuvchi o'zi kiradi).`);
  if (input.via !== acc.publishMode)
    throw new DomainError(
      "forbidden",
      acc.publishMode === "graph_api"
        ? `@${acc.username} rasmiy Graph API rejimida: graph_publish asbobidan foydalaning.`
        : `@${acc.username} Chrome rejimida: Claude in Chrome orqali action_begin bilan bajaring.`,
    );
  if (input.via === "chrome") {
    if (!input.observedUsername)
      throw new DomainError("invalid_input", "observedUsername kerak: Chrome'da ochiq akkauntni tekshiring (verify_account).");
    let seen: string;
    try {
      seen = normalizeUsername(input.observedUsername);
    } catch {
      seen = input.observedUsername;
    }
    if (seen !== acc.username)
      throw new DomainError(
        "forbidden",
        `Chrome'da @${seen} ochiq, lekin vazifa @${acc.username} uchun. Avval to'g'ri akkauntga o'ting (verify_account).`,
      );
  }

  const now = new Date();
  if (isPublishPayload(payload) && payload.scheduledAt && new Date(payload.scheduledAt) > now) {
    const retryAfterSeconds = Math.ceil((new Date(payload.scheduledAt).getTime() - now.getTime()) / 1000);
    throw new DomainError("not_yet", `Nashr ${payload.scheduledAt} ga rejalashtirilgan.`, { retryAfterSeconds });
  }
  if (task.actionStartedAt && now.getTime() - task.actionStartedAt.getTime() < ACTION_LEASE_MS)
    throw new DomainError("conflict", "Bu harakat allaqachon bajarilmoqda. Tugagach action_complete yuboring.");
  if (acc.nextActionAfter && acc.nextActionAfter > now) {
    const retryAfterSeconds = Math.ceil((acc.nextActionAfter.getTime() - now.getTime()) / 1000);
    throw new DomainError(
      "too_soon",
      `Harakatlar orasidagi tasodifiy pauza: ${retryAfterSeconds} soniyadan keyin qayta urinib ko'ring.`,
      { retryAfterSeconds },
    );
  }

  const limits = readLimits(acc.dailyLimits);
  const kind = task.kind as "publish" | "comment_reply" | "dm";
  const used = await usedToday(ctx, acc.id, kind);
  if (used >= limits[kind])
    throw new DomainError(
      "limit_reached",
      `@${acc.username} uchun bugungi "${kind}" limiti tugadi (${used}/${limits[kind]}). Ertaga davom eting yoki limitni sozlamalarda o'zgartiring.`,
    );

  const pause = randomInt(limits.minPauseSec, limits.maxPauseSec + 1);
  // Poyga holatidan himoya: faqat hali boshlanmagan (yoki lease muddati o'tgan) vazifa
  const claimed = await ctx.db.task.updateMany({
    where: {
      id: task.id,
      status: "approved",
      OR: [{ actionStartedAt: null }, { actionStartedAt: { lt: new Date(now.getTime() - ACTION_LEASE_MS) } }],
    },
    data: { actionStartedAt: now, actionError: null },
  });
  if (claimed.count !== 1) throw new DomainError("conflict", "Bu harakat allaqachon bajarilmoqda.");
  await ctx.db.instagramAccount.update({
    where: { id: acc.id },
    data: { lastActionAt: now, nextActionAfter: new Date(now.getTime() + pause * 1000) },
  });
  await notify(ctx.db, { workspaceId: ctx.workspaceId, type: "task", refId: task.id, message: "Bajarilmoqda" });

  return {
    taskId: task.id,
    kind,
    account: { id: acc.id, username: acc.username, publishMode: acc.publishMode },
    payload,
    /** Instagram'ga yoziladigan aniq matn — hech narsa qo'shilmaydi va o'zgartirilmaydi */
    textToType: payloadText(payload),
    playbook: PLAYBOOK_FOR_KIND[kind],
    usedToday: used + 1,
    dailyLimit: limits[kind],
    nextActionInSeconds: pause,
  };
}

/** Bugun boshlangan (bajarilgan yoki bajarilayotgan) harakatlar soni. */
export function usedToday(ctx: Ctx, accountId: string, kind: "publish" | "comment_reply" | "dm") {
  return ctx.db.task.count({ where: { accountId, kind, actionStartedAt: { gte: startOfUtcDay() } } });
}

export interface CompleteInput {
  taskId: string;
  ok: boolean;
  permalink?: string;
  error?: string;
  /** Instagram harakatni blokladi / cheklov ko'rsatdi */
  blocked?: boolean;
}

export async function completeAction(ctx: Ctx, input: CompleteInput) {
  const task = await getTask(ctx, input.taskId);
  if (task.status !== "approved" || !task.actionStartedAt || task.actionStartedAt.getTime() <= Date.now() - ACTION_LEASE_MS)
    throw new DomainError("invalid_transition", "Avval action_begin chaqirilishi kerak");

  if (!input.ok) {
    const t = await ctx.db.task.update({
      where: { id: task.id },
      // actionStartedAt saqlanadi: urinish bugungi limitga kiradi; lease tugagach qayta urinish mumkin
      data: { actionError: (input.error ?? "Noma'lum xato").slice(0, 1000), actionStartedAt: new Date(Date.now() - ACTION_LEASE_MS) },
    });
    if (input.blocked && task.accountId)
      await ctx.db.instagramAccount.update({ where: { id: task.accountId }, data: { status: "limited", lastCheckedAt: new Date() } });
    await notify(ctx.db, { workspaceId: ctx.workspaceId, type: "task", refId: t.id, message: "Bajarilmadi" });
    return t;
  }

  if (input.permalink && !/^https:\/\/(www\.)?instagram\.com\//.test(input.permalink))
    throw new DomainError("invalid_input", "permalink instagram.com havolasi bo'lishi kerak");
  const prev = (task.result && typeof task.result === "object" ? task.result : {}) as Record<string, unknown>;
  const now = new Date();
  const t = await ctx.db.task.update({
    where: { id: task.id },
    data: {
      status: "done",
      completedAt: now,
      progress: 100,
      actionError: null,
      result: { ...prev, ...(input.permalink ? { permalink: input.permalink } : {}), executedAt: now.toISOString() } as Prisma.InputJsonValue,
    },
  });
  if (t.contentItemId && t.kind === "publish")
    await ctx.db.contentItem.update({
      where: { id: t.contentItemId },
      data: { status: "published", permalink: input.permalink ?? null },
    });
  await notify(ctx.db, { workspaceId: ctx.workspaceId, type: "task", refId: t.id, message: "Tayyor!" });
  return t;
}
