import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { accounts, approvals, content, createDb, DomainError, graph, schedules, tasks } from "../src/index";
import { makeUser, resetDb } from "../src/testing";

const db = createDb();
afterAll(() => db.$disconnect());
beforeEach(() => resetDb(db));
process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString("base64");

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "ok";
  } catch (e) {
    if (e instanceof DomainError) return e.code;
    throw e;
  }
};

describe("takroriy jadvallar", () => {
  it("yaratish: keyingi payt hisoblanadi, noto'g'ri qiymatlar rad etiladi", async () => {
    const { ctx } = await makeUser(db);
    const s = await schedules.createSchedule(ctx, { title: "Haftalik hisobot", role: "analyst", kind: "analysis", weekdays: [1], timeOfDay: "09:00" });
    expect(s.nextRunAt!.getTime()).toBeGreaterThan(Date.now());
    expect(schedules.describeCadence(s)).toBe("Du 09:00");
    expect(await code(schedules.createSchedule(ctx, { title: "x", role: "analyst", timeOfDay: "9:00" }))).toBe("invalid_input");
    expect(await code(schedules.createSchedule(ctx, { title: "x", role: "analyst", weekdays: [8], timeOfDay: "09:00" }))).toBe("invalid_input");
    expect(await code(schedules.createSchedule(ctx, { title: "x", role: "analyst", kind: "publish", timeOfDay: "09:00" }))).toBe("invalid_input");
    expect(await code(schedules.createSchedule(ctx, { title: "x", role: "analyst", timeOfDay: "09:00", timezone: "Mars/Olympus" }))).toBe("invalid_input");
  });

  it("vaqti kelganda bitta vazifa yaratadi; qayta chaqirilsa takrorlanmaydi; o'tib ketganlar to'planmaydi", async () => {
    const { ctx, workspace } = await makeUser(db);
    const s = await schedules.createSchedule(ctx, { title: "Trendlar", role: "trendHunter", timeOfDay: "10:00" });
    // Server 3 kun o'chiq bo'lgandek
    await db.schedule.update({ where: { id: s.id }, data: { nextRunAt: new Date(Date.now() - 3 * 86400_000) } });
    const now = new Date();
    const [a, b] = await Promise.all([schedules.runDueSchedules(db, now), schedules.runDueSchedules(db, now)]);
    expect(a.length + b.length).toBe(1);
    const t = await db.task.findFirstOrThrow({ where: { workspaceId: workspace.id } });
    expect([t.title, t.role, t.scheduleId, t.status]).toEqual(["Trendlar", "trendHunter", s.id, "queued"]);
    const after = await db.schedule.findUniqueOrThrow({ where: { id: s.id } });
    expect(after.nextRunAt!.getTime()).toBeGreaterThan(now.getTime());
    expect(await schedules.runDueSchedules(db, now)).toEqual([]);
    const due = await schedules.dueList(ctx);
    expect(due.scheduledTasks).toHaveLength(1);
    expect(due.scheduledTasks[0]!.cadence).toBe("Har kuni 10:00");
  });

  it("o'chirilgan jadval ishlamaydi; yoqilganda keyingi payt qayta hisoblanadi", async () => {
    const { ctx } = await makeUser(db);
    const s = await schedules.createSchedule(ctx, { title: "x", role: "copywriter", timeOfDay: "10:00" });
    const off = await schedules.updateSchedule(ctx, s.id, { enabled: false });
    expect(off.nextRunAt).toBeNull();
    expect(await schedules.runDueSchedules(db, new Date(Date.now() + 7 * 86400_000))).toEqual([]);
    const on = await schedules.updateSchedule(ctx, s.id, { enabled: true, timeOfDay: "18:30", weekdays: [5, 6] });
    expect(schedules.describeCadence(on)).toBe("Ju, Sh 18:30");
    expect(on.nextRunAt).not.toBeNull();
    const other = await makeUser(db);
    expect(await code(schedules.deleteSchedule(other.ctx, s.id))).toBe("not_found");
    await schedules.deleteSchedule(ctx, s.id);
  });
});

describe("rejalashtirilgan nashr", () => {
  const fake = (calls: string[]) =>
    new graph.GraphClient({
      appId: "a",
      appSecret: "s",
      redirectUri: "https://w/cb",
      sleep: async () => {},
      fetch: (async (input: string | URL) => {
        const url = String(input);
        calls.push(url);
        const ok = (j: unknown) => new Response(JSON.stringify(j), { status: 200 });
        if (url.endsWith("/oauth/access_token")) return ok({ access_token: "S", user_id: 5 });
        if (url.includes("ig_exchange_token")) return ok({ access_token: "L", expires_in: 5184000 });
        if (url.includes("/me?")) return ok({ user_id: "5", username: "shop" });
        if (url.endsWith("/5/media")) return ok({ id: "C" });
        if (url.includes("/C?")) return ok({ status_code: "FINISHED" });
        if (url.endsWith("/5/media_publish")) return ok({ id: "M" });
        if (url.includes("/M?")) return ok({ permalink: "https://www.instagram.com/p/M/" });
        return new Response("{}", { status: 400 });
      }) as typeof fetch,
    });

  async function approvedAt(when: Date, mode: "graph" | "chrome") {
    const u = await makeUser(db);
    const calls: string[] = [];
    const client = fake(calls);
    const acc = await accounts.addAccount(u.ctx, { username: "shop" });
    if (mode === "graph") await graph.connectGraphAccount(u.ctx, client, acc.id, "C");
    const { task } = await tasks.createTask(u.ctx, { title: "Post", role: "smm", kind: "publish" });
    const item = await content.saveContent(u.ctx, { type: "post", caption: "Salom", mediaUrl: "https://cdn.x/a.jpg", scheduledAt: when, taskId: task.id });
    await tasks.updateTask(u.ctx, task.id, { status: "awaiting_approval", result: {} });
    await approvals.resolveApproval(u.ctx, { taskId: task.id, decision: "approve", byUser: true });
    return { ...u, client, calls, taskId: task.id, itemId: item.id };
  }

  it("Graph akkaunt: vaqti kelguncha kutadi, kelganda server o'zi nashr qiladi", async () => {
    const { client, calls, taskId, itemId, ctx } = await approvedAt(new Date(Date.now() + 3600_000), "graph");
    expect(await schedules.runDuePublishes(db, client)).toEqual([]);
    expect(calls.some((c) => c.endsWith("/media_publish"))).toBe(false);
    // Kalendardan vaqtni hozirga ko'chirish → payload ham yangilanadi
    await content.rescheduleContent(ctx, itemId, new Date(Date.now() - 60_000));
    expect(await schedules.runDuePublishes(db, client)).toEqual([taskId]);
    const t = await db.task.findUniqueOrThrow({ where: { id: taskId } });
    expect(t.status).toBe("done");
    expect((await db.contentItem.findUniqueOrThrow({ where: { id: itemId } })).status).toBe("published");
    expect(await code(content.rescheduleContent(ctx, itemId, null))).toBe("invalid_transition");
  });

  it("Chrome akkaunt: server nashr qilmaydi, Claude uchun 'vaqti keldi' ro'yxatida chiqadi", async () => {
    const { client, calls, taskId, ctx } = await approvedAt(new Date(Date.now() - 60_000), "chrome");
    expect(await schedules.runDuePublishes(db, client)).toEqual([]);
    expect(calls.filter((c) => c.includes("/media"))).toEqual([]);
    const due = await schedules.dueList(ctx);
    expect(due.readyActions.map((x) => x.id)).toEqual([taskId]);
    expect(due.readyActions[0]!.via).toContain("action_begin");
  });
});
