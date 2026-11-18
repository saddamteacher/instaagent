import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createDb, graph, oauth } from "@jarvisgram/db";
import { makeUser, resetDb } from "@jarvisgram/db/testing";
import { makeConfig } from "../src/config";
import { createApp } from "../src/server";
import { startScheduler } from "../src/scheduler";

process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");

const db = createDb();
let base = "";
let httpServer: http.Server;
const graphCalls: string[] = [];

/** Soxta Instagram Graph API (tarmoqsiz). */
const fakeFetch = (async (input: string | URL, init?: RequestInit) => {
  const url = String(input);
  graphCalls.push(`${init?.method ?? "GET"} ${url}`);
  const ok = (j: unknown) => new Response(JSON.stringify(j), { status: 200, headers: { "content-type": "application/json" } });
  if (url.endsWith("/oauth/access_token")) return ok({ access_token: "S", user_id: 42 });
  if (url.includes("ig_exchange_token")) return ok({ access_token: "L", expires_in: 5184000 });
  if (url.includes("/me?")) return ok({ user_id: "42", username: "graph.shop", followers_count: 900, follows_count: 10, media_count: 5 });
  if (url.endsWith("/42/media")) return ok({ id: "C1" });
  if (url.includes("/C1?fields=status_code")) return ok({ status_code: "FINISHED" });
  if (url.endsWith("/42/media_publish")) return ok({ id: "M9" });
  if (url.includes("/M9?fields=permalink")) return ok({ permalink: "https://www.instagram.com/p/M9/" });
  return new Response(JSON.stringify({ error: { message: "nomalum" } }), { status: 400 });
}) as typeof fetch;
const graphClient = new graph.GraphClient({ appId: "a", appSecret: "s", redirectUri: "https://web/cb", fetch: fakeFetch, sleep: async () => {} });

beforeAll(async () => {
  httpServer = http.createServer();
  await new Promise<void>((r) => httpServer.listen(0, "127.0.0.1", r));
  const port = (httpServer.address() as AddressInfo).port;
  base = `http://localhost:${port}`;
  httpServer.on(
    "request",
    createApp(db, makeConfig({ port, mcpPublicUrl: base, webPublicUrl: "http://localhost:3999" }), { graph: () => graphClient }),
  );
});
afterAll(async () => {
  await new Promise((r) => httpServer.close(r));
  await db.$disconnect();
});
beforeEach(() => resetDb(db));

/** OAuth tokenini servis orqali olish (HTTP oqimi asosiy testda tekshirilgan). */
async function tokenFor(userId: string) {
  await oauth.saveClient(db, { client_id: `c-${userId}`, redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] });
  const a = await oauth.createAuthorization(db, {
    clientId: `c-${userId}`,
    redirectUri: "https://claude.ai/api/mcp/auth_callback",
    codeChallenge: "x",
    resource: `${base}/mcp`,
  });
  const code = new URL(await oauth.approveAuthorization(db, a.id, userId)).searchParams.get("code")!;
  return (await oauth.exchangeCode(db, { clientId: `c-${userId}`, code })).access_token;
}

async function connect() {
  const u = await makeUser(db);
  const client = new Client({ name: "t", version: "1" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${await tokenFor(u.user.id)}` } },
    }),
  );
  const call = async <T = any>(name: string, args: Record<string, unknown> = {}) => {
    const r = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };
    if (r.isError) throw new Error(r.content[0]!.text);
    return JSON.parse(r.content[0]!.text) as T;
  };
  const err = async (name: string, args: Record<string, unknown>) => {
    const r = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };
    expect(r.isError).toBe(true);
    return r.content[0]!.text;
  };
  return { ...u, client, call, err };
}

/** Tasdiqlangan nashr vazifasi (foydalanuvchi vebda tasdiqlagandek: kod bazadan). */
async function approvedPublish(c: Awaited<ReturnType<typeof connect>>, result: Record<string, unknown>) {
  const { task } = await c.call("task_create", { title: "Nashr", role: "smm", kind: "publish" });
  await c.call("task_update", { taskId: task.id, status: "awaiting_approval", result });
  const code = (await db.task.findUniqueOrThrow({ where: { id: task.id } })).approvalCode!;
  await c.call("approval_resolve", { taskId: task.id, decision: "approve", approvalCode: code });
  return task.id as string;
}

describe("4-bosqich: rejalashtirish", () => {
  it("jadval: yaratish → vaqti keladi → rejalashtiruvchi vazifa yaratadi → due_list → bajarish", async () => {
    const c = await connect();
    await c.call("account_add", { username: "shop" });
    const { schedule, cadence } = await c.call("schedule_create", {
      title: "Haftalik statistika hisoboti",
      role: "analyst",
      kind: "analysis",
      weekdays: [1],
      timeOfDay: "09:00",
    });
    expect(cadence).toBe("Du 09:00");
    expect(new Date(schedule.nextRunAt).getTime()).toBeGreaterThan(Date.now());
    expect(await c.err("schedule_create", { title: "x", role: "analyst", timeOfDay: "24:00" })).toBeTruthy();

    // Vaqt keldi (sinov uchun nextRunAt ni o'tmishga suramiz) — haqiqiy rejalashtiruvchi sikli
    await db.schedule.update({ where: { id: schedule.id }, data: { nextRunAt: new Date(Date.now() - 1000) } });
    const stop = startScheduler(db, { graph: () => graphClient }, 50);
    for (let i = 0; i < 40 && !(await db.task.count({ where: { scheduleId: schedule.id } })); i++) await new Promise((r) => setTimeout(r, 50));
    stop();
    expect(await db.task.count({ where: { scheduleId: schedule.id } })).toBe(1);

    const due = await c.call("due_list");
    expect(due.scheduledTasks).toHaveLength(1);
    expect(due.scheduledTasks[0].role).toBe("analyst");
    const st = await c.call("office_state");
    expect(st.agents.find((a: any) => a.name === "Nodir").state).toBe("toDesk");

    const tid = due.scheduledTasks[0].id;
    await c.call("task_update", { taskId: tid, status: "in_progress", progress: 50 });
    await c.call("task_update", { taskId: tid, status: "done", result: { insights: ["Qamrov +12%"] } });
    expect((await c.call("due_list")).scheduledTasks).toHaveLength(0);

    const off = await c.call("schedule_update", { scheduleId: schedule.id, enabled: false });
    expect(off.schedule.nextRunAt).toBeNull();
    expect((await c.call("schedule_list"))[0].enabled).toBe(false);
    await c.call("schedule_update", { scheduleId: schedule.id, delete: true });
    expect(await c.call("schedule_list")).toEqual([]);
    const logs = await db.logEntry.findMany({ where: { tool: "scheduler" } });
    expect(logs.some((l) => l.message.includes("Haftalik statistika hisoboti"))).toBe(true);
    await c.client.close();
  });

  it("Graph akkaunt: tasdiqlangan rejalashtirilgan nashrni rejalashtiruvchi vaqtida joylaydi", async () => {
    const c = await connect();
    const { account } = await c.call("account_add", { username: "graph.shop" });
    await graph.connectGraphAccount(c.ctx, graphClient, account.id, "CODE");
    const { task } = await c.call("task_create", { title: "Ertalabki post", role: "smm", kind: "publish", accountId: account.id });
    await c.call("content_save", {
      accountId: account.id,
      type: "post",
      caption: "Xayrli tong!",
      mediaUrl: "https://cdn.example.com/m.jpg",
      scheduledAt: new Date(Date.now() - 1000).toISOString(),
      taskId: task.id,
    });
    await c.call("task_update", { taskId: task.id, status: "awaiting_approval", result: {} });
    const code = (await db.task.findUniqueOrThrow({ where: { id: task.id } })).approvalCode!;
    await c.call("approval_resolve", { taskId: task.id, decision: "approve", approvalCode: code });
    const stop = startScheduler(db, { graph: () => graphClient }, 50);
    for (let i = 0; i < 40 && (await db.task.findUniqueOrThrow({ where: { id: task.id } })).status !== "done"; i++)
      await new Promise((r) => setTimeout(r, 50));
    stop();
    const t = await db.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(t.status).toBe("done");
    expect((t.result as { permalink?: string }).permalink).toBe("https://www.instagram.com/p/M9/");
    await c.client.close();
  });
});
