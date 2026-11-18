import { createHash, timingSafeEqual } from "node:crypto";
import { PAID_PLANS, PERIOD_DAYS, PLANS, type Plan, type PlanId } from "@jarvisgram/shared";
import type { Db } from "../client";
import type { Payment } from "../generated/prisma/client";
import { DomainError, notFound } from "../errors";
import { notify } from "../events";
import type { Ctx } from "./context";
import { addLog } from "./logs";

// ---------- Tarif va limitlar ----------

/** Yuqori tarifdan pastrog'iga to'lov qabul qilinmaydi (qolgan muddat yo'qolmasin). */
export const PLAN_RANK: Record<PlanId, number> = { free: 0, pro: 1, agency: 2 };

export async function currentPlan(db: Db, workspaceId: string): Promise<Plan & { periodEnd: Date | null }> {
  const s = await db.subscription.findUnique({ where: { workspaceId } });
  if (s && s.plan !== "free" && s.currentPeriodEnd && s.currentPeriodEnd > new Date())
    return { ...PLANS[s.plan], periodEnd: s.currentPeriodEnd };
  return { ...PLANS.free, periodEnd: null };
}

const upgrade = (what: string) =>
  new DomainError("plan_limit", `${what} Tarifni oshiring: Jarvisgram → Tariflar.`);

export async function assertCanAddAccount(ctx: Ctx) {
  const plan = await currentPlan(ctx.db, ctx.workspaceId);
  const n = await ctx.db.instagramAccount.count({ where: { workspaceId: ctx.workspaceId } });
  if (n >= plan.limits.accounts) throw upgrade(`"${plan.title}" tarifida ko'pi bilan ${plan.limits.accounts} ta akkaunt.`);
}

export async function assertCanAddSchedule(ctx: Ctx) {
  const plan = await currentPlan(ctx.db, ctx.workspaceId);
  const n = await ctx.db.schedule.count({ where: { workspaceId: ctx.workspaceId } });
  if (n >= plan.limits.schedules) throw upgrade(`"${plan.title}" tarifida ko'pi bilan ${plan.limits.schedules} ta takroriy vazifa.`);
}

export async function assertFeature(ctx: Ctx, f: "graphApi" | "voiceAgent") {
  const plan = await currentPlan(ctx.db, ctx.workspaceId);
  if (!plan.limits[f])
    throw upgrade(f === "graphApi" ? "Rasmiy Graph API Pro tarifidan boshlab." : "Ovozli agent Pro tarifidan boshlab.");
}

// ---------- Buyurtma va faollashtirish ----------

export async function createPayment(ctx: Ctx, input: { plan: PlanId; provider: "payme" | "click"; months?: number }) {
  if (!PAID_PLANS.includes(input.plan)) throw new DomainError("invalid_input", "Bu tarif pullik emas");
  const cur = await currentPlan(ctx.db, ctx.workspaceId);
  if (PLAN_RANK[cur.id] > PLAN_RANK[input.plan])
    throw new DomainError(
      "invalid_input",
      `Hozir "${cur.title}" tarifi faol${cur.periodEnd ? ` (${cur.periodEnd.toISOString().slice(0, 10)} gacha)` : ""}. Pastroq tarifni muddat tugagach sotib olish mumkin.`,
    );
  const months = Math.min(12, Math.max(1, Math.round(input.months ?? 1)));
  return ctx.db.payment.create({
    data: {
      workspaceId: ctx.workspaceId,
      plan: input.plan,
      months,
      amount: PLANS[input.plan].priceUzs * 100 * months,
      provider: input.provider,
    },
  });
}

export function listPayments(ctx: Ctx) {
  return ctx.db.payment.findMany({ where: { workspaceId: ctx.workspaceId }, orderBy: { createdAt: "desc" }, take: 20 });
}

/** To'lov tasdiqlandi → obuna muddati uzayadi (shu tarifda bo'lsa davom etadi, boshqasida — hozirdan). */
async function activate(db: Db, p: Payment) {
  const sub = await db.subscription.findUnique({ where: { workspaceId: p.workspaceId } });
  const now = new Date();
  const base = sub && sub.plan === p.plan && sub.currentPeriodEnd && sub.currentPeriodEnd > now ? sub.currentPeriodEnd : now;
  const end = new Date(base.getTime() + p.months * PERIOD_DAYS * 86400_000);
  await db.subscription.upsert({
    where: { workspaceId: p.workspaceId },
    create: { workspaceId: p.workspaceId, plan: p.plan, currentPeriodEnd: end },
    update: { plan: p.plan, currentPeriodEnd: end },
  });
  const ctx: Ctx = { db, workspaceId: p.workspaceId, actor: "system" };
  await addLog(ctx, { tool: "billing", message: `To'lov qabul qilindi: ${PLANS[p.plan].title} (${p.provider}), ${end.toISOString().slice(0, 10)} gacha` });
  await notify(db, { workspaceId: p.workspaceId, type: "account", message: "Tarif yangilandi" });
}

/** To'lov qaytarildi (Payme CancelTransaction state 2 → -2) → muddat qisqaradi. */
async function revoke(db: Db, p: Payment) {
  const sub = await db.subscription.findUnique({ where: { workspaceId: p.workspaceId } });
  if (!sub?.currentPeriodEnd || sub.plan !== p.plan) return;
  const end = new Date(sub.currentPeriodEnd.getTime() - p.months * PERIOD_DAYS * 86400_000);
  await db.subscription.update({ where: { workspaceId: p.workspaceId }, data: { currentPeriodEnd: end } });
  await addLog({ db, workspaceId: p.workspaceId, actor: "system" }, { tool: "billing", message: `To'lov qaytarildi: ${PLANS[p.plan].title}` });
}

// ---------- To'lov sahifasiga yo'naltirish ----------

export interface PaymeConfig {
  merchantId: string;
  key: string;
  /** Basic auth login. Payme hujjatida ko'rsatilmagan; amalda "Paycom". */
  login: string;
  /** https://checkout.paycom.uz (sinov: https://test.paycom.uz) */
  checkoutUrl: string;
}

export interface ClickConfig {
  serviceId: string;
  merchantId: string;
  secretKey: string;
  merchantUserId?: string;
}

export function paymeConfigFromEnv(env = process.env): PaymeConfig | null {
  if (!env.PAYME_MERCHANT_ID || !env.PAYME_KEY) return null;
  return {
    merchantId: env.PAYME_MERCHANT_ID,
    key: env.PAYME_KEY,
    login: env.PAYME_LOGIN || "Paycom",
    checkoutUrl: (env.PAYME_CHECKOUT_URL || "https://checkout.paycom.uz").replace(/\/$/, ""),
  };
}

export function clickConfigFromEnv(env = process.env): ClickConfig | null {
  if (!env.CLICK_SERVICE_ID || !env.CLICK_MERCHANT_ID || !env.CLICK_SECRET_KEY) return null;
  return {
    serviceId: env.CLICK_SERVICE_ID,
    merchantId: env.CLICK_MERCHANT_ID,
    secretKey: env.CLICK_SECRET_KEY,
    merchantUserId: env.CLICK_MERCHANT_USER_ID || undefined,
  };
}

/** Payme checkout: base64("m=..;ac.order_id=..;a=<tiyin>;c=<qaytish>;l=uz") */
export function paymeCheckoutUrl(cfg: PaymeConfig, p: Payment, returnUrl: string) {
  const params = [`m=${cfg.merchantId}`, `ac.order_id=${p.id}`, `a=${p.amount}`, `c=${returnUrl}`, "l=uz"].join(";");
  return `${cfg.checkoutUrl}/${Buffer.from(params, "utf8").toString("base64")}`;
}

/** Click to'lov sahifasi (summa so'mda). */
export function clickCheckoutUrl(cfg: ClickConfig, p: Payment, returnUrl: string) {
  const u = new URL("https://my.click.uz/services/pay");
  u.searchParams.set("service_id", cfg.serviceId);
  u.searchParams.set("merchant_id", cfg.merchantId);
  if (cfg.merchantUserId) u.searchParams.set("merchant_user_id", cfg.merchantUserId);
  u.searchParams.set("amount", (p.amount / 100).toFixed(2));
  u.searchParams.set("transaction_param", p.id);
  u.searchParams.set("return_url", returnUrl);
  return u.toString();
}

// ---------- Payme Merchant API (JSON-RPC) ----------

const PAYME_TIMEOUT_MS = 43_200_000; // 12 soat

type L10n = { ru: string; uz: string; en: string };
const M = {
  auth: { ru: "Недостаточно привилегий", uz: "Ruxsat yetarli emas", en: "Insufficient privileges" },
  method: { ru: "Метод не найден", uz: "Usul topilmadi", en: "Method not found" },
  request: { ru: "Неверный запрос", uz: "So'rov noto'g'ri", en: "Invalid request" },
  order: { ru: "Заказ не найден", uz: "Buyurtma topilmadi", en: "Order not found" },
  orderState: { ru: "Заказ уже оплачен или отменён", uz: "Buyurtma to'langan yoki bekor qilingan", en: "Order already paid or cancelled" },
  busy: { ru: "Заказ ожидает оплаты другой транзакцией", uz: "Buyurtma boshqa tranzaksiya bilan band", en: "Order is reserved by another transaction" },
  amount: { ru: "Неверная сумма", uz: "Summa noto'g'ri", en: "Invalid amount" },
  txn: { ru: "Транзакция не найдена", uz: "Tranzaksiya topilmadi", en: "Transaction not found" },
  state: { ru: "Невозможно выполнить операцию", uz: "Amalni bajarib bo'lmaydi", en: "Unable to perform operation" },
  system: { ru: "Системная ошибка", uz: "Tizim xatosi", en: "System error" },
} satisfies Record<string, L10n>;

class PaymeError extends Error {
  constructor(
    public code: number,
    public msg: L10n,
    public data?: unknown,
  ) {
    super(msg.en);
  }
}

type RpcResponse = { id: unknown; result?: unknown; error?: { code: number; message: L10n; data?: unknown } };

function authOk(header: string | null | undefined, cfg: PaymeConfig) {
  const m = /^Basic\s+(.+)$/i.exec(header ?? "");
  if (!m) return false;
  const decoded = Buffer.from(m[1]!, "base64").toString("utf8");
  const expected = `${cfg.login}:${cfg.key}`;
  const a = Buffer.from(decoded);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const ms = (d: bigint | null | undefined) => (d === null || d === undefined ? 0 : Number(d));

async function paymeOrder(db: Db, account: unknown, amount: unknown) {
  const orderId = (account as { order_id?: unknown } | null)?.order_id;
  if (typeof orderId !== "string") throw new PaymeError(-31050, M.order, "order_id");
  const p = await db.payment.findUnique({ where: { id: orderId } });
  if (!p || p.provider !== "payme") throw new PaymeError(-31050, M.order, "order_id");
  if (typeof amount !== "number" || amount !== p.amount) throw new PaymeError(-31001, M.amount);
  if (p.status === "paid" || p.status === "cancelled" || p.status === "failed") throw new PaymeError(-31051, M.orderState, "order_id");
  return p;
}

async function paymeByTxn(db: Db, id: unknown) {
  if (typeof id !== "string") throw new PaymeError(-31003, M.txn);
  const p = await db.payment.findUnique({ where: { provider_providerTxnId: { provider: "payme", providerTxnId: id } } });
  if (!p) throw new PaymeError(-31003, M.txn);
  return p;
}

async function paymeTimeoutCancel(db: Db, p: Payment) {
  await db.payment.update({
    where: { id: p.id },
    data: { paymeState: -1, paymeReason: 4, paymeCancelTime: BigInt(Date.now()), status: "cancelled" },
  });
}

/**
 * Payme Merchant API ishlovchisi. Har doim HTTP 200 bilan qaytariladigan JSON obyektini beradi.
 * Hujjat: https://developer.help.paycom.uz/protokol-merchant-api/
 */
export async function handlePayme(db: Db, cfg: PaymeConfig, body: unknown, authHeader: string | null | undefined): Promise<RpcResponse> {
  const req = (body ?? {}) as { id?: unknown; method?: unknown; params?: Record<string, unknown> };
  const id = req.id ?? null;
  try {
    if (!authOk(authHeader, cfg)) throw new PaymeError(-32504, M.auth);
    if (typeof req.method !== "string" || typeof req.params !== "object" || req.params === null) throw new PaymeError(-32600, M.request);
    const P = req.params;
    const now = Date.now();

    switch (req.method) {
      case "CheckPerformTransaction": {
        const p = await paymeOrder(db, P.account, P.amount);
        if (p.paymeState === 1) throw new PaymeError(-31099, M.busy, "order_id");
        return { id, result: { allow: true } };
      }
      case "CreateTransaction": {
        if (typeof P.id !== "string" || typeof P.time !== "number") throw new PaymeError(-32600, M.request);
        const existing = await db.payment.findUnique({ where: { provider_providerTxnId: { provider: "payme", providerTxnId: P.id } } });
        if (existing) {
          if (existing.paymeState !== 1) throw new PaymeError(-31008, M.state);
          if (now - ms(existing.paymeCreateTime) > PAYME_TIMEOUT_MS) {
            await paymeTimeoutCancel(db, existing);
            throw new PaymeError(-31008, M.state);
          }
          return { id, result: { create_time: ms(existing.paymeCreateTime), transaction: existing.id, state: 1 } };
        }
        const p = await paymeOrder(db, P.account, P.amount);
        if (p.providerTxnId && p.paymeState === 1) throw new PaymeError(-31099, M.busy, "order_id");
        const claimed = await db.payment.updateMany({
          where: { id: p.id, providerTxnId: null },
          data: { providerTxnId: P.id, paymeTime: BigInt(P.time), paymeCreateTime: BigInt(now), paymeState: 1, status: "pending" },
        });
        if (claimed.count !== 1) throw new PaymeError(-31099, M.busy, "order_id");
        return { id, result: { create_time: now, transaction: p.id, state: 1 } };
      }
      case "PerformTransaction": {
        const p = await paymeByTxn(db, P.id);
        if (p.paymeState === 2) return { id, result: { transaction: p.id, perform_time: ms(p.paymePerformTime), state: 2 } };
        if (p.paymeState !== 1) throw new PaymeError(-31008, M.state);
        if (now - ms(p.paymeCreateTime) > PAYME_TIMEOUT_MS) {
          await paymeTimeoutCancel(db, p);
          throw new PaymeError(-31008, M.state);
        }
        const done = await db.payment.updateMany({
          where: { id: p.id, paymeState: 1 },
          data: { paymeState: 2, paymePerformTime: BigInt(now), status: "paid", paidAt: new Date(now) },
        });
        if (done.count === 1) await activate(db, p);
        const fresh = await db.payment.findUniqueOrThrow({ where: { id: p.id } });
        return { id, result: { transaction: p.id, perform_time: ms(fresh.paymePerformTime), state: 2 } };
      }
      case "CancelTransaction": {
        const p = await paymeByTxn(db, P.id);
        const reason = typeof P.reason === "number" ? P.reason : null;
        if (p.paymeState === -1 || p.paymeState === -2)
          return { id, result: { transaction: p.id, cancel_time: ms(p.paymeCancelTime), state: p.paymeState } };
        const state = p.paymeState === 2 ? -2 : -1;
        const upd = await db.payment.updateMany({
          where: { id: p.id, paymeState: p.paymeState },
          data: { paymeState: state, paymeReason: reason, paymeCancelTime: BigInt(now), status: "cancelled" },
        });
        if (upd.count === 1 && state === -2) await revoke(db, p);
        const fresh = await db.payment.findUniqueOrThrow({ where: { id: p.id } });
        return { id, result: { transaction: p.id, cancel_time: ms(fresh.paymeCancelTime), state: fresh.paymeState } };
      }
      case "CheckTransaction": {
        const p = await paymeByTxn(db, P.id);
        return {
          id,
          result: {
            create_time: ms(p.paymeCreateTime),
            perform_time: ms(p.paymePerformTime),
            cancel_time: ms(p.paymeCancelTime),
            transaction: p.id,
            state: p.paymeState,
            reason: p.paymeReason ?? null,
          },
        };
      }
      case "GetStatement": {
        if (typeof P.from !== "number" || typeof P.to !== "number") throw new PaymeError(-32600, M.request);
        const list = await db.payment.findMany({
          where: { provider: "payme", providerTxnId: { not: null }, paymeTime: { gte: BigInt(P.from), lte: BigInt(P.to) } },
          orderBy: { paymeTime: "asc" },
        });
        return {
          id,
          result: {
            transactions: list.map((p) => ({
              id: p.providerTxnId,
              time: ms(p.paymeTime),
              amount: p.amount,
              account: { order_id: p.id },
              create_time: ms(p.paymeCreateTime),
              perform_time: ms(p.paymePerformTime),
              cancel_time: ms(p.paymeCancelTime),
              transaction: p.id,
              state: p.paymeState,
              reason: p.paymeReason ?? null,
            })),
          },
        };
      }
      default:
        throw new PaymeError(-32601, M.method, req.method);
    }
  } catch (e) {
    if (e instanceof PaymeError) return { id, error: { code: e.code, message: e.msg, ...(e.data !== undefined ? { data: e.data } : {}) } };
    console.error("[payme]", e);
    return { id, error: { code: -32400, message: M.system } };
  }
}

// ---------- Click SHOP API (Prepare / Complete) ----------

export const md5 = (s: string) => createHash("md5").update(s).digest("hex");

const CLICK_FIELDS = ["click_trans_id", "service_id", "click_paydoc_id", "merchant_trans_id", "amount", "action", "error", "error_note", "sign_time", "sign_string"];

export function clickSign(secretKey: string, p: Record<string, string>) {
  return md5(
    `${p.click_trans_id}${p.service_id}${secretKey}${p.merchant_trans_id}${p.action === "1" ? (p.merchant_prepare_id ?? "") : ""}${p.amount}${p.action}${p.sign_time}`,
  );
}

/**
 * Click Prepare (action=0) va Complete (action=1). Parametrlar form-urlencoded keladi.
 * Imzo: md5(click_trans_id + service_id + SECRET_KEY + merchant_trans_id + [merchant_prepare_id] + amount + action + sign_time)
 */
export async function handleClick(db: Db, cfg: ClickConfig, params: Record<string, string>, expectedAction: 0 | 1) {
  try {
    return await handleClickInner(db, cfg, params, expectedAction);
  } catch (e) {
    // Click har doim JSON javob kutadi — kutilmagan xatoda ham
    console.error("[click]", e);
    return { click_trans_id: params.click_trans_id ?? null, merchant_trans_id: params.merchant_trans_id ?? null, error: -7, error_note: "Failed to update user" };
  }
}

async function handleClickInner(db: Db, cfg: ClickConfig, params: Record<string, string>, expectedAction: 0 | 1) {
  const base = { click_trans_id: params.click_trans_id ?? null, merchant_trans_id: params.merchant_trans_id ?? null };
  const fail = (error: number, error_note: string) => ({ ...base, error, error_note });

  if (CLICK_FIELDS.some((f) => params[f] === undefined) || (params.action === "1" && !params.merchant_prepare_id))
    return fail(-8, "Error in request from click");
  if (params.service_id !== cfg.serviceId) return fail(-8, "Error in request from click");
  const expected = clickSign(cfg.secretKey, params);
  const given = (params.sign_string ?? "").toLowerCase();
  if (given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) return fail(-1, "SIGN CHECK FAILED!");
  if (params.action !== String(expectedAction)) return fail(-3, "Action not found");

  const p = await db.payment.findUnique({ where: { id: params.merchant_trans_id! } });
  if (!p || p.provider !== "click") return fail(-5, "User does not exist");
  if (Math.abs(p.amount / 100 - Number(params.amount)) > 0.01) return fail(-2, "Incorrect parameter amount");
  if (p.status === "paid") return fail(-4, "Already paid");
  if (p.status === "cancelled" || p.status === "failed") return fail(-9, "Transaction cancelled");

  if (expectedAction === 0) {
    if (p.providerTxnId && p.providerTxnId !== params.click_trans_id) return fail(-4, "Already paid");
    const used = await db.payment.findUnique({ where: { provider_providerTxnId: { provider: "click", providerTxnId: params.click_trans_id! } } });
    if (used && used.id !== p.id) return fail(-6, "Transaction does not exist");
    await db.payment.update({ where: { id: p.id }, data: { providerTxnId: params.click_trans_id, status: "pending" } });
    return { ...base, merchant_prepare_id: p.seq, error: 0, error_note: "Success" };
  }

  if (String(p.seq) !== params.merchant_prepare_id || p.providerTxnId !== params.click_trans_id) return fail(-6, "Transaction does not exist");
  if (Number(params.error) < 0) {
    await db.payment.update({ where: { id: p.id }, data: { status: "cancelled" } });
    return fail(-9, "Transaction cancelled");
  }
  const done = await db.payment.updateMany({ where: { id: p.id, status: "pending" }, data: { status: "paid", paidAt: new Date() } });
  if (done.count === 1) await activate(db, p);
  return { ...base, merchant_confirm_id: p.seq, error: 0, error_note: "Success" };
}

export async function getPayment(ctx: Ctx, id: string) {
  const p = await ctx.db.payment.findFirst({ where: { id, workspaceId: ctx.workspaceId } });
  if (!p) throw notFound("To'lov");
  return p;
}
