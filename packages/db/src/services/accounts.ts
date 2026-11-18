import { DEFAULT_DAILY_LIMITS, type AccountStatus, type DailyLimits, type PublishMode } from "@jarvisgram/shared";
import { DomainError, notFound } from "../errors";
import { notify } from "../events";
import type { Ctx } from "./context";

const USERNAME_RE = /^[a-z0-9._]{1,30}$/;

export function normalizeUsername(raw: string) {
  const u = raw
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^@/, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
  if (!USERNAME_RE.test(u)) throw new DomainError("invalid_input", `Instagram username noto'g'ri: "${raw}"`);
  return u;
}

export function readLimits(json: unknown): DailyLimits {
  const j = (json && typeof json === "object" ? json : {}) as Partial<DailyLimits>;
  return { ...DEFAULT_DAILY_LIMITS, ...j };
}

/** Tashqariga (MCP javoblari) chiqarish uchun: maxfiy maydonlarsiz. */
export function publicAccount<T extends { graphTokenEnc?: string | null }>(a: T) {
  const { graphTokenEnc, ...rest } = a;
  return { ...rest, graphConnected: !!graphTokenEnc };
}

export function listAccounts(ctx: Ctx) {
  return ctx.db.instagramAccount.findMany({ where: { workspaceId: ctx.workspaceId }, orderBy: { createdAt: "asc" } });
}

export async function getAccount(ctx: Ctx, accountId: string) {
  const acc = await ctx.db.instagramAccount.findFirst({ where: { id: accountId, workspaceId: ctx.workspaceId } });
  if (!acc) throw notFound("Akkaunt");
  return acc;
}

export async function findAccount(ctx: Ctx, ref: { accountId?: string; username?: string }) {
  if (ref.accountId) return getAccount(ctx, ref.accountId);
  if (ref.username) {
    const acc = await ctx.db.instagramAccount.findFirst({
      where: { workspaceId: ctx.workspaceId, username: normalizeUsername(ref.username) },
    });
    if (!acc) throw notFound(`@${ref.username} akkaunti`);
    return acc;
  }
  throw new DomainError("invalid_input", "accountId yoki username kerak");
}

export async function addAccount(
  ctx: Ctx,
  input: { username: string; chromeProfile?: string; publishMode?: PublishMode; dailyLimits?: Partial<DailyLimits> },
) {
  const username = normalizeUsername(input.username);
  const exists = await ctx.db.instagramAccount.findFirst({ where: { workspaceId: ctx.workspaceId, username } });
  if (exists) throw new DomainError("conflict", `@${username} allaqachon qo'shilgan`);
  const limits = readLimits(input.dailyLimits);
  if (limits.minPauseSec > limits.maxPauseSec)
    throw new DomainError("invalid_input", "minPauseSec maxPauseSec dan katta bo'lmasin");

  const acc = await ctx.db.instagramAccount.create({
    data: {
      workspaceId: ctx.workspaceId,
      username,
      chromeProfile: input.chromeProfile?.trim() || null,
      publishMode: input.publishMode ?? "chrome",
      dailyLimits: limits,
    },
  });
  const ws = await ctx.db.workspace.findUniqueOrThrow({ where: { id: ctx.workspaceId } });
  if (!ws.activeAccountId) await ctx.db.workspace.update({ where: { id: ws.id }, data: { activeAccountId: acc.id } });
  await notify(ctx.db, { workspaceId: ctx.workspaceId, type: "account", refId: acc.id, message: `@${username} qo'shildi` });
  return acc;
}

export async function updateLimits(ctx: Ctx, accountId: string, input: Partial<DailyLimits>) {
  const acc = await getAccount(ctx, accountId);
  const next = { ...readLimits(acc.dailyLimits), ...input };
  for (const [k, v] of Object.entries(next))
    if (!Number.isInteger(v) || v < 0) throw new DomainError("invalid_input", `${k} manfiy bo'lmagan butun son bo'lsin`);
  if (next.minPauseSec < 10) throw new DomainError("invalid_input", "Pauza kamida 10 soniya bo'lsin");
  if (next.minPauseSec > next.maxPauseSec) throw new DomainError("invalid_input", "Minimal pauza maksimaldan katta bo'lmasin");
  if (next.publish > 50) throw new DomainError("invalid_input", "Instagram 24 soatda 50 tadan ortiq nashrga ruxsat bermaydi");
  return ctx.db.instagramAccount.update({ where: { id: acc.id }, data: { dailyLimits: next } });
}

export async function switchAccount(ctx: Ctx, ref: { accountId?: string; username?: string }) {
  const acc = await findAccount(ctx, ref);
  await ctx.db.workspace.update({ where: { id: ctx.workspaceId }, data: { activeAccountId: acc.id } });
  await notify(ctx.db, { workspaceId: ctx.workspaceId, type: "account", refId: acc.id, message: `Faol akkaunt: @${acc.username}` });
  return acc;
}

export async function setAccountStatus(ctx: Ctx, accountId: string, status: AccountStatus, observedUsername?: string) {
  const current = await getAccount(ctx, accountId);
  if (status === "connected") {
    if (!observedUsername)
      throw new DomainError("invalid_input", "connected uchun observedUsername kerak: Chrome'da ko'rgan username'ingiz");
    let seen = observedUsername;
    try {
      seen = normalizeUsername(observedUsername);
    } catch {
      /* noto'g'ri format — solishtirishda mos kelmaydi */
    }
    if (seen !== current.username)
      throw new DomainError("forbidden", `Chrome'da @${seen} ochiq, kutilgan @${current.username}. Avval to'g'ri akkauntga o'ting.`);
  }
  const acc = await ctx.db.instagramAccount.update({
    where: { id: accountId },
    data: { status, lastCheckedAt: new Date() },
  });
  await notify(ctx.db, { workspaceId: ctx.workspaceId, type: "account", refId: acc.id, message: `@${acc.username}: ${status}` });
  return acc;
}

export async function getActiveAccount(ctx: Ctx) {
  const ws = await ctx.db.workspace.findUniqueOrThrow({ where: { id: ctx.workspaceId } });
  if (!ws.activeAccountId) return null;
  return ctx.db.instagramAccount.findUnique({ where: { id: ws.activeAccountId } });
}

/** Claude in Chrome uchun akkauntga o'tish yo'riqnomasi. MCP o'zi Instagramga kirmaydi. */
export function chromeSwitchInstructions(acc: { username: string; chromeProfile: string | null }) {
  return [
    acc.chromeProfile
      ? `Chrome'da "${acc.chromeProfile}" profili ochiq ekanini tekshiring (profilni foydalanuvchi o'zi tanlaydi).`
      : "Chrome profili ko'rsatilmagan — foydalanuvchidan qaysi profilda ishlashni so'rang.",
    `Claude in Chrome orqali https://www.instagram.com/${acc.username}/ sahifasini oching.`,
    `Yuqori o'ng burchakdagi profil ${acc.username} ekanini tasdiqlang. Boshqa akkaunt bo'lsa — Instagram'ning "Switch accounts" menyusidan o'ting.`,
    "Kirish (login) so'ralsa: parolni HECH QACHON yozmang va so'ramang — foydalanuvchiga o'zi kirishini ayting, keyin account_status bilan holatni 'needs_login' qiling.",
    "Hammasi joyida bo'lsa holatni 'connected' deb belgilang.",
  ];
}
