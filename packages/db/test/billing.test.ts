import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { accounts, billing, commands, createDb, DomainError, schedules } from "../src/index";
import { makeUser, resetDb } from "../src/testing";

const db = createDb();
afterAll(() => db.$disconnect());
beforeEach(() => resetDb(db));

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "ok";
  } catch (e) {
    if (e instanceof DomainError) return e.code;
    throw e;
  }
};

const PAYME: billing.PaymeConfig = { merchantId: "m123", key: "SECRET", login: "Paycom", checkoutUrl: "https://checkout.paycom.uz" };
const AUTH = "Basic " + Buffer.from("Paycom:SECRET").toString("base64");
const rpc = (method: string, params: Record<string, unknown>, auth = AUTH) =>
  billing.handlePayme(db, PAYME, { id: 1, method, params }, auth) as Promise<any>;

describe("tarif limitlari", () => {
  it("bepul tarif: 1 akkaunt, 2 jadval, Graph yo'q; to'lovdan keyin ochiladi", async () => {
    const { ctx } = await makeUser(db, "Free", "free");
    expect((await billing.currentPlan(db, ctx.workspaceId)).id).toBe("free");
    await accounts.addAccount(ctx, { username: "bir" });
    expect(await code(accounts.addAccount(ctx, { username: "ikki" }))).toBe("plan_limit");
    await schedules.createSchedule(ctx, { title: "a", role: "analyst", timeOfDay: "09:00" });
    await schedules.createSchedule(ctx, { title: "b", role: "analyst", timeOfDay: "10:00" });
    expect(await code(schedules.createSchedule(ctx, { title: "c", role: "analyst", timeOfDay: "11:00" }))).toBe("plan_limit");
    expect(await code(billing.assertFeature(ctx, "graphApi"))).toBe("plan_limit");

    // Payme orqali Pro sotib olish
    const p = await billing.createPayment(ctx, { plan: "pro", provider: "payme" });
    expect(p.amount).toBe(149_000 * 100);
    await rpc("CreateTransaction", { id: "t".repeat(24), time: Date.now(), amount: p.amount, account: { order_id: p.id } });
    await rpc("PerformTransaction", { id: "t".repeat(24) });
    const plan = await billing.currentPlan(db, ctx.workspaceId);
    expect(plan.id).toBe("pro");
    expect(plan.periodEnd!.getTime()).toBeGreaterThan(Date.now() + 29 * 86400_000);
    await accounts.addAccount(ctx, { username: "ikki" });
    await billing.assertFeature(ctx, "graphApi");
  });

  it("faol yuqori tarifda pastrog'ini sotib olib bo'lmaydi", async () => {
    const { ctx } = await makeUser(db, "A", "agency");
    expect(await code(billing.createPayment(ctx, { plan: "pro", provider: "payme" }))).toBe("invalid_input");
    expect((await billing.createPayment(ctx, { plan: "agency", provider: "click", months: 3 })).amount).toBe(449_000 * 100 * 3);
  });

  it("muddat tugasa bepul tarifga qaytadi; shu tarifni qayta to'lash muddatni uzaytiradi", async () => {
    const { ctx } = await makeUser(db, "X", "free");
    await db.subscription.create({ data: { workspaceId: ctx.workspaceId, plan: "pro", currentPeriodEnd: new Date(Date.now() - 1000) } });
    expect((await billing.currentPlan(db, ctx.workspaceId)).id).toBe("free");
    await db.subscription.update({ where: { workspaceId: ctx.workspaceId }, data: { currentPeriodEnd: new Date(Date.now() + 10 * 86400_000) } });
    const p = await billing.createPayment(ctx, { plan: "pro", provider: "payme" });
    await rpc("CreateTransaction", { id: "u".repeat(24), time: Date.now(), amount: p.amount, account: { order_id: p.id } });
    await rpc("PerformTransaction", { id: "u".repeat(24) });
    const end = (await billing.currentPlan(db, ctx.workspaceId)).periodEnd!.getTime();
    expect(end).toBeGreaterThan(Date.now() + 39 * 86400_000);
  });
});

describe("Payme Merchant API", () => {
  async function order() {
    const { ctx } = await makeUser(db, "P", "free");
    return { ctx, p: await billing.createPayment(ctx, { plan: "pro", provider: "payme" }) };
  }

  it("auth, noma'lum usul, noto'g'ri buyurtma va summa", async () => {
    const { p } = await order();
    expect((await rpc("CheckPerformTransaction", { amount: p.amount, account: { order_id: p.id } }, "Basic " + Buffer.from("Paycom:xato").toString("base64"))).error.code).toBe(-32504);
    expect((await rpc("CheckPerformTransaction", { amount: p.amount, account: { order_id: p.id } }, "")).error.code).toBe(-32504);
    expect((await rpc("Boshqa", {})).error).toMatchObject({ code: -32601, data: "Boshqa" });
    const nf = await rpc("CheckPerformTransaction", { amount: p.amount, account: { order_id: "yoq" } });
    expect(nf.error).toMatchObject({ code: -31050, data: "order_id" });
    expect(nf.error.message).toHaveProperty("uz");
    expect((await rpc("CheckPerformTransaction", { amount: p.amount - 100, account: { order_id: p.id } })).error.code).toBe(-31001);
    expect(await rpc("CheckPerformTransaction", { amount: p.amount, account: { order_id: p.id } })).toEqual({ id: 1, result: { allow: true } });
  });

  it("Create → (takror) → Perform → (takror) → CheckTransaction → GetStatement → Cancel (qaytarish)", async () => {
    const { ctx, p } = await order();
    const tid = "a".repeat(24);
    const time = Date.now();
    const c1 = await rpc("CreateTransaction", { id: tid, time, amount: p.amount, account: { order_id: p.id } });
    expect(c1.result).toMatchObject({ transaction: p.id, state: 1 });
    const c2 = await rpc("CreateTransaction", { id: tid, time, amount: p.amount, account: { order_id: p.id } });
    expect(c2.result).toEqual(c1.result); // sandbox ikki marta yuboradi — javob bir xil
    // Boshqa tranzaksiya shu buyurtmani band qila olmaydi
    expect((await rpc("CreateTransaction", { id: "b".repeat(24), time, amount: p.amount, account: { order_id: p.id } })).error.code).toBe(-31099);
    expect((await rpc("CheckPerformTransaction", { amount: p.amount, account: { order_id: p.id } })).error.code).toBe(-31099);

    const pf1 = await rpc("PerformTransaction", { id: tid });
    expect(pf1.result).toMatchObject({ transaction: p.id, state: 2 });
    expect(await rpc("PerformTransaction", { id: tid })).toEqual(pf1);
    expect((await billing.currentPlan(db, ctx.workspaceId)).id).toBe("pro");

    const ct = await rpc("CheckTransaction", { id: tid });
    expect(ct.result).toMatchObject({ transaction: p.id, state: 2, cancel_time: 0, reason: null });
    expect(ct.result.perform_time).toBeGreaterThan(0);
    const st = await rpc("GetStatement", { from: time - 1000, to: time + 1000 });
    expect(st.result.transactions).toHaveLength(1);
    expect(st.result.transactions[0]).toMatchObject({ id: tid, time, amount: p.amount, account: { order_id: p.id }, state: 2 });
    expect((await rpc("GetStatement", { from: 0, to: 1 })).result.transactions).toEqual([]);

    const cancel = await rpc("CancelTransaction", { id: tid, reason: 5 });
    expect(cancel.result).toMatchObject({ transaction: p.id, state: -2 });
    expect(await rpc("CancelTransaction", { id: tid, reason: 5 })).toEqual(cancel);
    expect((await rpc("CheckTransaction", { id: tid })).result).toMatchObject({ state: -2, reason: 5 });
    expect((await billing.currentPlan(db, ctx.workspaceId)).id).toBe("free"); // muddat qaytarildi
    expect((await rpc("PerformTransaction", { id: tid })).error.code).toBe(-31008);
    expect((await rpc("CheckTransaction", { id: "z".repeat(24) })).error.code).toBe(-31003);
  });

  it("12 soatlik timeout: tranzaksiya -1 (sabab 4) bo'ladi, bajarilmaydi", async () => {
    const { p } = await order();
    const tid = "c".repeat(24);
    await rpc("CreateTransaction", { id: tid, time: Date.now(), amount: p.amount, account: { order_id: p.id } });
    await db.payment.update({ where: { id: p.id }, data: { paymeCreateTime: BigInt(Date.now() - 43_200_001) } });
    expect((await rpc("PerformTransaction", { id: tid })).error.code).toBe(-31008);
    expect((await rpc("CheckTransaction", { id: tid })).result).toMatchObject({ state: -1, reason: 4 });
    // Bajarilmagan tranzaksiyani bekor qilish (1 → -1)
    const { p: p2 } = await order();
    await rpc("CreateTransaction", { id: "d".repeat(24), time: Date.now(), amount: p2.amount, account: { order_id: p2.id } });
    expect((await rpc("CancelTransaction", { id: "d".repeat(24), reason: 3 })).result.state).toBe(-1);
  });

  it("checkout havolasi base64 parametrlar bilan", async () => {
    const { p } = await order();
    const url = billing.paymeCheckoutUrl(PAYME, p, "https://web/pricing");
    const decoded = Buffer.from(url.replace("https://checkout.paycom.uz/", ""), "base64").toString();
    expect(decoded).toBe(`m=m123;ac.order_id=${p.id};a=${p.amount};c=https://web/pricing;l=uz`);
  });
});

describe("Click SHOP API", () => {
  const CLICK: billing.ClickConfig = { serviceId: "777", merchantId: "888", secretKey: "CLICKSECRET" };
  const signed = (p: Record<string, string>): Record<string, string> => ({ ...p, sign_string: billing.clickSign(CLICK.secretKey, p) });

  async function order() {
    const { ctx } = await makeUser(db, "C", "free");
    const pay = await billing.createPayment(ctx, { plan: "agency", provider: "click" });
    const base = {
      click_trans_id: "5001",
      service_id: "777",
      click_paydoc_id: "9001",
      merchant_trans_id: pay.id,
      amount: (pay.amount / 100).toFixed(2),
      error: "0",
      error_note: "Success",
      sign_time: "2026-11-18 12:00:00",
    };
    return { ctx, pay, base };
  }

  it("imzo, summa, buyurtma va action tekshiruvlari", async () => {
    const { base } = await order();
    expect((await billing.handleClick(db, CLICK, { ...signed({ ...base, action: "0" }), sign_string: "x".repeat(32) }, 0)).error).toBe(-1);
    expect((await billing.handleClick(db, CLICK, signed({ ...base, action: "0", amount: "1.00" }), 0)).error).toBe(-2);
    expect((await billing.handleClick(db, CLICK, signed({ ...base, action: "0", merchant_trans_id: "yoq" }), 0)).error).toBe(-5);
    expect((await billing.handleClick(db, CLICK, signed({ ...base, action: "1", merchant_prepare_id: "1" }), 0)).error).toBe(-3);
    const { sign_time: _, ...missing } = signed({ ...base, action: "0" });
    expect((await billing.handleClick(db, CLICK, missing as Record<string, string>, 0)).error).toBe(-8);
  });

  it("Prepare → Complete → tarif faol; takroriy Complete -4", async () => {
    const { ctx, pay, base } = await order();
    const prep = await billing.handleClick(db, CLICK, signed({ ...base, action: "0" }), 0);
    expect(prep).toMatchObject({ error: 0, click_trans_id: "5001", merchant_trans_id: pay.id, merchant_prepare_id: pay.seq });
    expect((await billing.handleClick(db, CLICK, signed({ ...base, action: "1", merchant_prepare_id: "999999" }), 1)).error).toBe(-6);
    const comp = await billing.handleClick(db, CLICK, signed({ ...base, action: "1", merchant_prepare_id: String(pay.seq) }), 1);
    expect(comp).toMatchObject({ error: 0, merchant_confirm_id: pay.seq });
    expect((await billing.currentPlan(db, ctx.workspaceId)).id).toBe("agency");
    expect((await billing.handleClick(db, CLICK, signed({ ...base, action: "1", merchant_prepare_id: String(pay.seq) }), 1)).error).toBe(-4);
  });

  it("boshqa buyurtmada ishlatilgan click_trans_id rad etiladi (server yiqilmaydi)", async () => {
    const a = await order();
    await billing.handleClick(db, CLICK, signed({ ...a.base, action: "0" }), 0);
    const { ctx } = await makeUser(db, "D", "free");
    const pay2 = await billing.createPayment(ctx, { plan: "agency", provider: "click" });
    const r = await billing.handleClick(db, CLICK, signed({ ...a.base, merchant_trans_id: pay2.id, action: "0" }), 0);
    expect(r.error).toBe(-6);
  });

  it("Click Complete'da xato (error<0) — to'lov bekor, tarif o'zgarmaydi", async () => {
    const { ctx, pay, base } = await order();
    await billing.handleClick(db, CLICK, signed({ ...base, action: "0" }), 0);
    const comp = await billing.handleClick(db, CLICK, signed({ ...base, action: "1", merchant_prepare_id: String(pay.seq), error: "-5017" }), 1);
    expect(comp.error).toBe(-9);
    expect((await db.payment.findUniqueOrThrow({ where: { id: pay.id } })).status).toBe("cancelled");
    expect((await billing.currentPlan(db, ctx.workspaceId)).id).toBe("free");
  });

  it("to'lov sahifasi havolasi", async () => {
    const { pay } = await order();
    const u = new URL(billing.clickCheckoutUrl(CLICK, pay, "https://web/pricing"));
    expect(u.origin + u.pathname).toBe("https://my.click.uz/services/pay");
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ service_id: "777", merchant_id: "888", amount: "449000.00", transaction_param: pay.id });
  });
});

describe("buyruqlar qutisi", () => {
  it("yaratish, ro'yxat, olish va bekor qilish", async () => {
    const { ctx } = await makeUser(db);
    await accounts.addAccount(ctx, { username: "shop" });
    expect(await code(commands.createCommand(ctx, { text: "ok", source: "web" }))).toBe("invalid_input");
    const c = await commands.createCommand(ctx, { text: "  Ertangi   Reels'ni  tayyorlang ", source: "voice" });
    expect(c.text).toBe("Ertangi Reels'ni tayyorlang");
    expect(c.accountId).not.toBeNull();
    const due = await schedules.dueList(ctx);
    expect(due.commands.map((x) => x.id)).toEqual([c.id]);
    const m = await db.meeting.create({ data: { workspaceId: ctx.workspaceId, command: c.text } });
    await commands.takeCommand(ctx, c.id, m.id);
    expect(await code(commands.takeCommand(ctx, c.id, m.id))).toBe("invalid_transition");
    expect((await schedules.dueList(ctx)).commands).toEqual([]);
    await commands.finishForMeeting(ctx, m.id);
    expect((await db.command.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("done");
    const c2 = await commands.createCommand(ctx, { text: "Hisobot chiqaring", source: "web" });
    await commands.dismissCommand(ctx, c2.id);
    expect((await commands.inbox(ctx)).length).toBe(0);
  });
});
