import {
  CONTENT_TYPES,
  ROLE_GUIDES,
  type ActionPayload,
  type ContentType,
  requiresApproval as kindRequiresApproval,
  type AgentRole,
  type TaskKind,
  type TaskStatus,
} from "@jarvisgram/shared";
import type { Prisma, Task } from "../generated/prisma/client";
import { approvalCode } from "../crypto";
import { DomainError, notFound } from "../errors";
import { notify } from "../events";
import { getAccount } from "./accounts";
import { pickAgent } from "./agents";
import type { Ctx } from "./context";

export interface CreateTaskInput {
  title: string;
  role: AgentRole;
  kind?: TaskKind;
  description?: string;
  /** Berilmasa — faol akkaunt. */
  accountId?: string;
  meetingId?: string;
  contentItemId?: string;
  scheduledAt?: Date;
  /** Takroriy jadvaldan yaratilganda */
  scheduleId?: string;
}

const ACCOUNT_REQUIRED: TaskKind[] = ["publish", "comment_reply", "dm"];

export async function createTask(ctx: Ctx, input: CreateTaskInput) {
  const guide = ROLE_GUIDES[input.role];
  const kind = input.kind ?? guide.allowedKinds[0]!;
  if (!guide.allowedKinds.includes(kind))
    throw new DomainError(
      "invalid_input",
      `${guide.title} roli "${kind}" turidagi vazifani bajara olmaydi. Ruxsat etilgan: ${guide.allowedKinds.join(", ")}`,
    );

  let accountId = input.accountId;
  if (!accountId) {
    const ws = await ctx.db.workspace.findUniqueOrThrow({ where: { id: ctx.workspaceId } });
    accountId = ws.activeAccountId ?? undefined;
  }
  if (accountId) await getAccount(ctx, accountId);
  else if (ACCOUNT_REQUIRED.includes(kind))
    throw new DomainError("invalid_input", `"${kind}" vazifasi uchun akkaunt kerak (accountId yoki faol akkaunt)`);

  if (input.meetingId) {
    const m = await ctx.db.meeting.findFirst({ where: { id: input.meetingId, workspaceId: ctx.workspaceId } });
    if (!m) throw notFound("Majlis");
  }
  if (input.contentItemId) {
    const c = await ctx.db.contentItem.findFirst({ where: { id: input.contentItemId, workspaceId: ctx.workspaceId } });
    if (!c) throw notFound("Kontent");
  }

  const agent = await pickAgent(ctx, input.role);
  const task = await ctx.db.task.create({
    data: {
      workspaceId: ctx.workspaceId,
      title: input.title.trim().slice(0, 200),
      description: input.description?.slice(0, 4000) ?? null,
      role: input.role,
      kind,
      requiresApproval: kindRequiresApproval(kind),
      accountId: accountId ?? null,
      meetingId: input.meetingId ?? null,
      contentItemId: input.contentItemId ?? null,
      scheduleId: input.scheduleId ?? null,
      scheduledAt: input.scheduledAt ?? null,
      agentId: agent?.id ?? null,
    },
  });
  await notify(ctx.db, { workspaceId: ctx.workspaceId, type: "task", refId: task.id, message: task.title });
  return { task, agent };
}

export async function getTask(ctx: Ctx, taskId: string) {
  const t = await ctx.db.task.findFirst({ where: { id: taskId, workspaceId: ctx.workspaceId } });
  if (!t) throw notFound("Vazifa");
  return t;
}

/** task_update orqali ruxsat etilgan o'tishlar. approved/rejected — faqat approval_resolve orqali. */
const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  queued: ["in_progress", "awaiting_approval", "done"],
  in_progress: ["in_progress", "awaiting_approval", "done"],
  awaiting_approval: [],
  // Tasdiqlangan harakat faqat action_begin → action_complete orqali bajariladi (pauza va limitlar)
  approved: [],
  rejected: ["in_progress"],
  done: [],
};

export interface UpdateTaskInput {
  status?: TaskStatus;
  progress?: number;
  result?: Prisma.InputJsonValue;
}

/** Tasdiqqa yuboriladigan aniq harakat: Chrome'da (yoki Graph API orqali) aynan shu bajariladi. */
async function buildPayload(ctx: Ctx, task: Task, result: unknown, username: string): Promise<ActionPayload> {
  const r = (result ?? {}) as Record<string, unknown>;
  if (task.kind === "publish") {
    const item = task.contentItemId
      ? await ctx.db.contentItem.findFirst({ where: { id: task.contentItemId, workspaceId: ctx.workspaceId } })
      : null;
    const str = (v: unknown) => (typeof v === "string" ? v : "");
    const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
    const caption = item?.caption ?? str(r.caption);
    const hashtags = item?.hashtags ?? list(r.hashtags);
    const mediaUrls = item?.mediaUrl ? [item.mediaUrl] : [...list(r.mediaUrls), ...(str(r.mediaUrl) ? [str(r.mediaUrl)] : [])];
    const type = (item?.type ?? (CONTENT_TYPES.includes(r.type as ContentType) ? r.type : "post")) as ContentType;
    const scheduledAt = item?.scheduledAt?.toISOString() ?? (str(r.scheduledAt) || null);
    if (!caption.trim() && !mediaUrls.length)
      throw new DomainError("invalid_input", "Nashr uchun caption yoki media kerak (content_save yoki result.caption)");
    for (const u of mediaUrls)
      if (!/^https:\/\//.test(u)) throw new DomainError("invalid_input", `Media havolasi https bo'lishi kerak: ${u}`);
    const audioUrl = item?.audioUrl ?? (str(r.audioUrl) || null);
    if (audioUrl && !/^https:\/\//.test(audioUrl)) throw new DomainError("invalid_input", `Ovoz havolasi https bo'lishi kerak: ${audioUrl}`);
    return { kind: "publish", type, caption, hashtags, mediaUrls, audioUrl, scheduledAt, contentItemId: item?.id ?? null };
  }
  assertOwnTarget(task, result, username);
  return {
    kind: task.kind as "comment_reply" | "dm",
    targetType: task.kind === "dm" ? "incoming_dm" : "own_post_comment",
    targetOwner: username,
    targetRef: String(r.targetRef ?? ""),
    originalText: String(r.originalText ?? ""),
    reply: String(r.reply),
  };
}

/** Kommentator natijasi faqat o'z postidagi izoh yoki kelgan DM bo'lishi shart. */
function assertOwnTarget(task: Task, result: unknown, username: string) {
  const r = (result ?? {}) as Record<string, unknown>;
  const expectedType = task.kind === "dm" ? "incoming_dm" : "own_post_comment";
  if (r.targetType !== expectedType)
    throw new DomainError(
      "forbidden",
      `Natijada targetType="${expectedType}" bo'lishi shart. Begona postlarga izoh va ommaviy DM taqiqlangan.`,
    );
  const owner = String(r.targetOwner ?? "").replace(/^@/, "").toLowerCase();
  if (owner !== username)
    throw new DomainError(
      "forbidden",
      `targetOwner "@${username}" bo'lishi shart: Kommentator faqat foydalanuvchining o'z postlari va DM'lariga javob qoralaydi.`,
    );
  if (typeof r.reply !== "string" || !r.reply.trim())
    throw new DomainError("invalid_input", "Natijada 'reply' matni bo'lishi kerak");
}

export async function updateTask(ctx: Ctx, taskId: string, input: UpdateTaskInput) {
  const task = await getTask(ctx, taskId);
  const target = input.status ?? task.status;

  if (input.status === "approved" || input.status === "rejected")
    throw new DomainError("forbidden", "Tasdiqlash/rad etish faqat approval_resolve orqali (foydalanuvchi qarori bilan)");

  if (target === "done" && task.requiresApproval)
    throw new DomainError(
      "approval_required",
      task.status === "approved"
        ? "Tasdiqlangan harakat action_begin → (Chrome) → action_complete orqali yakunlanadi."
        : "Bu harakat (nashr/izoh javobi/DM) avval 'Tasdiq kutmoqda'ga tushishi va foydalanuvchi tasdiqlashi kerak. status='awaiting_approval' bilan natijani yuboring.",
    );
  if (input.status && input.status !== task.status && !TRANSITIONS[task.status].includes(input.status))
    throw new DomainError("invalid_transition", `"${task.status}" → "${input.status}" o'tishi mumkin emas`);
  if (input.status === task.status && !TRANSITIONS[task.status].includes(task.status) && input.progress === undefined)
    throw new DomainError("invalid_transition", `Vazifa allaqachon "${task.status}" holatida`);
  if (!input.status && input.progress !== undefined && task.status !== "in_progress" && task.status !== "queued")
    throw new DomainError("invalid_transition", `"${task.status}" holatidagi vazifaning progressi o'zgarmaydi`);


  const now = new Date();
  const data: Prisma.TaskUpdateInput = {};
  if (input.result !== undefined) data.result = input.result;
  if (input.progress !== undefined) data.progress = Math.max(0, Math.min(100, Math.round(input.progress)));

  if (input.status && input.status !== task.status) {
    data.status = input.status;
    if (input.status === "in_progress") {
      data.startedAt = task.startedAt ?? now;
      if (task.status === "rejected") data.progress = input.progress ?? 0;
    }
    if (input.status === "awaiting_approval") {
      const result = input.result ?? task.result;
      if (result === null || result === undefined)
        throw new DomainError("invalid_input", "Tasdiqqa yuborishdan oldin 'result' (qoralama) kerak");
      if (task.requiresApproval) {
        const acc = task.accountId ? await getAccount(ctx, task.accountId) : null;
        if (!acc) throw new DomainError("invalid_input", "Vazifaga akkaunt bog'lanmagan");
        data.payload = (await buildPayload(ctx, task, result, acc.username)) as unknown as Prisma.InputJsonValue;
        data.actionError = null;
      }
      data.startedAt = task.startedAt ?? now;
      data.submittedAt = now;
      data.progress = 100;
      data.approvalCode = approvalCode();
    }
    if (input.status === "done") {
      data.startedAt = task.startedAt ?? now;
      data.completedAt = now;
      data.progress = 100;
    }
  }

  const updated = await ctx.db.task.update({ where: { id: task.id }, data });

  if (updated.contentItemId && input.status === "awaiting_approval" && task.status !== "awaiting_approval")
    await ctx.db.contentItem.update({ where: { id: updated.contentItemId }, data: { status: "awaiting_approval" } });

  await notify(ctx.db, {
    workspaceId: ctx.workspaceId,
    type: "task",
    refId: updated.id,
    message: updated.status === "done" ? "Tayyor!" : updated.status === "awaiting_approval" ? "Tasdiqqa yubordim" : undefined,
  });
  return updated;
}

export function listTasks(
  ctx: Ctx,
  f: { status?: TaskStatus[]; role?: AgentRole; accountId?: string; meetingId?: string; limit?: number } = {},
) {
  return ctx.db.task.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      ...(f.status?.length ? { status: { in: f.status } } : {}),
      ...(f.role ? { role: f.role } : {}),
      ...(f.accountId ? { accountId: f.accountId } : {}),
      ...(f.meetingId ? { meetingId: f.meetingId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(f.limit ?? 50, 200),
    include: { agent: { select: { id: true, name: true, deskNo: true } }, account: { select: { username: true } } },
  });
}

/** Tashqi (MCP) javob uchun: tasdiqlash kodi hech qachon Claude'ga ko'rsatilmaydi. */
export function publicTask<T extends { approvalCode?: string | null }>(t: T): Omit<T, "approvalCode"> {
  const { approvalCode: _omit, ...rest } = t;
  return rest;
}
