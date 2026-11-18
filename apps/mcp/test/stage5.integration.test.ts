import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { commands, createDb, graph, oauth } from "@jarvisgram/db";
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

async function connect(plan: "free" | "pro" | "agency" = "agency") {
  const u = await makeUser(db, "Test", plan);
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

describe("5-bosqich: ovozli buyruq va tariflar", () => {
  it("veb-ofisdagi (ovozli) buyruq → due_list → majlis → bajarildi", async () => {
    const c = await connect();
    await c.call("account_add", { username: "shop" });
    const cmd = await commands.createCommand(c.ctx, { text: "Ertangi Reels'ni tayyorlang", source: "voice" });
    const due = await c.call("due_list");
    expect(due.commands).toEqual([expect.objectContaining({ id: cmd.id, text: "Ertangi Reels'ni tayyorlang", source: "voice" })]);
    const { meeting } = await c.call("meeting_start", { command: cmd.text, commandId: cmd.id });
    expect(await c.err("meeting_start", { command: "x", commandId: cmd.id })).toContain("invalid_transition");
    await c.call("meeting_end", {});
    expect((await db.command.findUniqueOrThrow({ where: { id: cmd.id } })).status).toBe("done");
    expect((await c.call("due_list")).commands).toEqual([]);
    expect(meeting.command).toBe("Ertangi Reels'ni tayyorlang");
    await c.client.close();
  });

  it("voiceover audioUrl tasdiq payload'iga tushadi", async () => {
    const c = await connect();
    await c.call("account_add", { username: "shop" });
    const { task } = await c.call("task_create", { title: "Reels", role: "smm", kind: "publish" });
    await c.call("content_save", {
      type: "reel",
      caption: "Sahna ortida",
      mediaUrl: "https://cdn.example.com/r.mp4",
      audioUrl: "https://cdn.example.com/voice.mp3",
      taskId: task.id,
    });
    const r = await c.call("task_update", { taskId: task.id, status: "awaiting_approval", result: {} });
    expect(r.task.payload.audioUrl).toBe("https://cdn.example.com/voice.mp3");
    expect(await c.err("content_save", { type: "reel", caption: "x", audioUrl: "http://x/v.mp3" })).toBeTruthy();
    await c.client.close();
  });

  it("bepul tarif limiti MCP orqali ham ishlaydi", async () => {
    const c = await connect("free");
    await c.call("account_add", { username: "bir" });
    const e = await c.err("account_add", { username: "ikki" });
    expect(e).toMatch(/^plan_limit: .*Tarif/);
    await c.client.close();
  });
});
