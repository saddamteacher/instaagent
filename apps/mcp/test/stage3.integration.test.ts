import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createDb, graph, oauth } from "@jarvisgram/db";
import { makeUser, resetDb } from "@jarvisgram/db/testing";
import { makeConfig } from "../src/config";
import { createApp } from "../src/server";

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

describe("3-bosqich: Chrome oqimi", () => {
  it("prompt e'lon qilingan, yo'riqnomalar beriladi", async () => {
    const c = await connect();
    const { prompts } = await c.client.listPrompts();
    expect(prompts.map((p) => p.name)).toContain("jarvis_buyruq");
    const p = await c.client.getPrompt({ name: "jarvis_buyruq", arguments: { buyruq: "Karusel tayyorla" } });
    expect((p.messages[0]!.content as { text: string }).text).toContain("Karusel tayyorla");
    for (const id of ["verify_account", "read_stats", "publish_post", "reply_comment", "reply_dm"]) {
      const pb = await c.call("chrome_playbook", { id });
      expect(pb.steps.length).toBeGreaterThan(2);
      expect(pb.stopIf.join(" ")).toContain("password");
    }
    await c.client.close();
  });

  it("pauza: ikkinchi harakat retryAfterSeconds bilan rad etiladi", async () => {
    const c = await connect();
    await c.call("account_add", { username: "shop", dailyLimits: { minPauseSec: 120, maxPauseSec: 120 } });
    const t1 = await approvedPublish(c, { caption: "Birinchi" });
    const t2 = await approvedPublish(c, { caption: "Ikkinchi" });
    await c.call("action_begin", { taskId: t1, observedUsername: "shop" });
    await c.call("action_complete", { taskId: t1, ok: true, permalink: "https://www.instagram.com/p/1/" });
    const e = await c.err("action_begin", { taskId: t2, observedUsername: "shop" });
    expect(e).toMatch(/^too_soon: .*"retryAfterSeconds":1[12]\d/);
    await c.client.close();
  });

  it("izoh javobi: faqat o'z postiga, payload aniq matn bilan", async () => {
    const c = await connect();
    await c.call("account_add", { username: "shop" });
    const { task } = await c.call("task_create", { title: "Izoh", role: "commenter", kind: "comment_reply" });
    await c.call("task_update", {
      taskId: task.id,
      status: "awaiting_approval",
      result: {
        targetType: "own_post_comment",
        targetOwner: "shop",
        targetRef: "https://www.instagram.com/p/X/",
        originalText: "Narxi qancha?",
        reply: "Narxini DM'da yubordik 🙌",
      },
    });
    const code = (await db.task.findUniqueOrThrow({ where: { id: task.id } })).approvalCode!;
    await c.call("approval_resolve", { taskId: task.id, decision: "approve", approvalCode: code });
    const b = await c.call("action_begin", { taskId: task.id, observedUsername: "shop" });
    expect(b.playbook).toBe("reply_comment");
    expect(b.textToType).toBe("Narxini DM'da yubordik 🙌");
    expect(b.payload.targetRef).toBe("https://www.instagram.com/p/X/");
    const done = await c.call("action_complete", { taskId: task.id, ok: false, error: "Action blocked", blocked: true });
    expect(done.task.actionError).toBe("Action blocked");
    const acc = await c.call("accounts_list");
    expect(acc.accounts[0].status).toBe("limited");
    await c.client.close();
  });
});

describe("3-bosqich: rasmiy Graph API", () => {
  it("graph_api akkaunt: Chrome orqali emas, graph_publish orqali; token MCP javoblarida yo'q", async () => {
    const c = await connect();
    const { account } = await c.call("account_add", { username: "graph.shop" });
    await graph.connectGraphAccount(c.ctx, graphClient, account.id, "CODE");

    const list = await c.call("accounts_list");
    expect(list.accounts[0].publishMode).toBe("graph_api");
    expect(list.accounts[0].graphConnected).toBe(true);
    expect(JSON.stringify(list)).not.toContain("graphTokenEnc");

    const taskId = await approvedPublish(c, { caption: "Rasmiy nashr", mediaUrl: "https://cdn.example.com/p.jpg" });
    expect(await c.err("action_begin", { taskId, observedUsername: "graph.shop" })).toContain("graph_publish");
    const r = await c.call("graph_publish", { taskId });
    expect(r.permalink).toBe("https://www.instagram.com/p/M9/");
    expect(r.task.status).toBe("done");
    expect(graphCalls.some((x) => x.startsWith("POST") && x.endsWith("/42/media_publish"))).toBe(true);

    const s = await c.call("graph_sync_analytics", { accountId: account.id });
    expect(s.snapshot.followers).toBe(900);
    await c.client.close();
  });

  it("media havolasi https bo'lmasa tasdiqqa yuborilmaydi", async () => {
    const c = await connect();
    await c.call("account_add", { username: "shop" });
    const { task } = await c.call("task_create", { title: "N", role: "smm", kind: "publish" });
    const e = await c.err("task_update", { taskId: task.id, status: "awaiting_approval", result: { caption: "x", mediaUrl: "http://x/a.jpg" } });
    expect(e).toContain("https");
    await c.client.close();
  });
});
