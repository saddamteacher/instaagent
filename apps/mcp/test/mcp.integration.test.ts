import { createHash, randomBytes } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createDb, listen, oauth } from "@jarvisgram/db";
import { makeUser, resetDb } from "@jarvisgram/db/testing";
import type { OfficeEvent } from "@jarvisgram/shared";
import { makeConfig } from "../src/config";
import { createApp } from "../src/server";
import { TOOL_NAMES } from "../src/tools";

const db = createDb();
let base = "";
let httpServer: http.Server;

beforeAll(async () => {
  httpServer = http.createServer();
  await new Promise<void>((r) => httpServer.listen(0, "127.0.0.1", r));
  const port = (httpServer.address() as AddressInfo).port;
  base = `http://localhost:${port}`;
  httpServer.on("request", createApp(db, makeConfig({ port, mcpPublicUrl: base, webPublicUrl: "http://localhost:3999" })));
});
afterAll(async () => {
  await new Promise((r) => httpServer.close(r));
  await db.$disconnect();
});
beforeEach(() => resetDb(db));

const b64url = (b: Buffer) => b.toString("base64url");

/** To'liq OAuth oqimi: DCR → /authorize → (veb rozilik) → /token, PKCE S256 bilan. */
async function oauthLogin(userId: string) {
  const redirectUri = "https://claude.ai/api/mcp/auth_callback";
  const reg = await fetch(`${base}/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_name: "Claude", redirect_uris: [redirectUri], token_endpoint_auth_method: "none" }),
  });
  expect(reg.status).toBe(201);
  const client = (await reg.json()) as { client_id: string };

  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const authUrl = new URL(`${base}/authorize`);
  Object.entries({
    response_type: "code",
    client_id: client.client_id,
    redirect_uri: redirectUri,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: "xyz",
    scope: "jarvisgram",
    resource: `${base}/mcp`,
  }).forEach(([k, v]) => authUrl.searchParams.set(k, v));
  const auth = await fetch(authUrl, { redirect: "manual" });
  expect(auth.status).toBe(302);
  const consent = new URL(auth.headers.get("location")!);
  expect(consent.origin + consent.pathname).toBe("http://localhost:3999/oauth/consent");

  // Veb-ilova: foydalanuvchi "Ruxsat berish"ni bosdi
  const back = new URL(await oauth.approveAuthorization(db, consent.searchParams.get("req")!, userId));
  expect(back.searchParams.get("state")).toBe("xyz");

  const tokenRes = await fetch(`${base}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: back.searchParams.get("code")!,
      code_verifier: verifier,
      client_id: client.client_id,
      redirect_uri: redirectUri,
      resource: `${base}/mcp`,
    }),
  });
  expect(tokenRes.status).toBe(200);
  return { ...((await tokenRes.json()) as object), clientId: client.client_id } as {
    access_token: string;
    refresh_token: string;
    clientId: string;
  };
}

async function connect(token: string) {
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }),
  );
  return client;
}

async function call<T = any>(client: Client, name: string, args: Record<string, unknown> = {}) {
  const r = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };
  if (r.isError) throw new Error(r.content[0]!.text);
  return JSON.parse(r.content[0]!.text) as T;
}
async function callErr(client: Client, name: string, args: Record<string, unknown> = {}) {
  const r = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };
  expect(r.isError).toBe(true);
  return r.content[0]!.text;
}

describe("auth", () => {
  it("metadata endpointlari ishlaydi", async () => {
    const as: any = await (await fetch(`${base}/.well-known/oauth-authorization-server`)).json();
    expect(as.issuer).toBe(`${base}/`);
    expect(as.code_challenge_methods_supported).toContain("S256");
    expect(as.registration_endpoint).toBe(`${base}/register`);
    const pr: any = await (await fetch(`${base}/.well-known/oauth-protected-resource/mcp`)).json();
    expect(pr.resource).toBe(`${base}/mcp`);
    expect(pr.authorization_servers).toContain(`${base}/`);
  });

  it("tokensiz 401 va WWW-Authenticate qaytaradi", async () => {
    const r = await fetch(`${base}/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(r.status).toBe(401);
    expect(r.headers.get("www-authenticate")).toContain("resource_metadata=");
    const bad = await fetch(`${base}/mcp`, { method: "POST", headers: { authorization: "Bearer jg_at_soxta" }, body: "{}" });
    expect(bad.status).toBe(401);
  });

  it("noto'g'ri PKCE verifier bilan token berilmaydi", async () => {
    const { user } = await makeUser(db);
    const redirectUri = "https://claude.ai/api/mcp/auth_callback";
    const client = (await (
      await fetch(`${base}/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ redirect_uris: [redirectUri], token_endpoint_auth_method: "none" }),
      })
    ).json()) as { client_id: string };
    const challenge = b64url(createHash("sha256").update("togri").digest());
    const a = await oauth.createAuthorization(db, { clientId: client.client_id, redirectUri, codeChallenge: challenge });
    const code = new URL(await oauth.approveAuthorization(db, a.id, user.id)).searchParams.get("code")!;
    const r = await fetch(`${base}/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code, code_verifier: "notogri", client_id: client.client_id }),
    });
    expect(r.status).toBe(400);
  });

  it("OAuth bilan ulanib, refresh qilib, bekor qilish mumkin", async () => {
    const { user } = await makeUser(db);
    const tok = await oauthLogin(user.id);
    const c = await connect(tok.access_token);
    expect((await call(c, "accounts_list")).accounts).toEqual([]);
    await c.close();

    const ref = await fetch(`${base}/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: tok.refresh_token, client_id: tok.clientId }),
    });
    expect(ref.status).toBe(200);
    const tok2 = (await ref.json()) as { access_token: string };
    const old = await fetch(`${base}/mcp`, { method: "POST", headers: { authorization: `Bearer ${tok.access_token}` }, body: "{}" });
    expect(old.status).toBe(401);

    await fetch(`${base}/revoke`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: tok2.access_token, client_id: tok.clientId }),
    });
    const revoked = await fetch(`${base}/mcp`, { method: "POST", headers: { authorization: `Bearer ${tok2.access_token}` }, body: "{}" });
    expect(revoked.status).toBe(401);
  });
});

describe("MCP asboblari", () => {
  let client: Client;
  let workspaceId: string;

  beforeEach(async () => {
    const { user, workspace } = await makeUser(db);
    workspaceId = workspace.id;
    client = await connect((await oauthLogin(user.id)).access_token);
    return () => client.close();
  });

  it("barcha asboblar JSON schema va tavsif bilan e'lon qilingan", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...TOOL_NAMES].sort());
    for (const name of [
      "accounts_list", "account_add", "account_switch", "task_create", "task_update", "task_list", "agent_roles_get",
      "meeting_start", "meeting_end", "content_calendar_get", "content_save", "analytics_save", "analytics_get",
      "approvals_list", "approval_resolve", "office_state", "log_add",
    ])
      expect(TOOL_NAMES).toContain(name);
    for (const t of tools) {
      expect(t.description!.length).toBeGreaterThan(40);
      expect(t.inputSchema.type).toBe("object");
    }
    const tc = tools.find((t) => t.name === "task_create")!;
    expect(tc.inputSchema.required).toEqual(expect.arrayContaining(["title", "role"]));
    expect(client.getInstructions()).toContain("Jarvis");
  });

  it("to'liq Jarvis oqimi: majlis → vazifalar → ish → tasdiq → bajarildi; har chaqiruv log yozadi", async () => {
    const events: OfficeEvent[] = [];
    const l = listen((e) => e.workspaceId === workspaceId && events.push(e));
    await l.ready;

    const { account } = await call(client, "account_add", { username: "@Mening.Dokonim", chromeProfile: "Do'kon" });
    expect(account.username).toBe("mening.dokonim");
    const sw = await call(client, "account_switch", { username: "mening.dokonim" });
    expect(sw.chromeSteps.join(" ")).toContain("instagram.com/mening.dokonim");

    const { meeting } = await call(client, "meeting_start", { command: "Ertangi Reels'ni tayyorlang" });
    let st = await call(client, "office_state");
    expect(st.meeting.id).toBe(meeting.id);
    expect(st.agents).toHaveLength(13);
    expect(st.agents.every((a: any) => a.state === "meeting")).toBe(true);

    const roles = await call(client, "agent_roles_get");
    expect(roles).toHaveLength(9);
    expect((await call(client, "agent_roles_get", { role: "commenter" })).restrictions.join(" ")).toContain("Begona");

    const script = await call(client, "task_create", { title: "Reels ssenariysi", role: "scriptwriter", meetingId: meeting.id });
    const pub = await call(client, "task_create", { title: "Reels nashri", role: "smm", kind: "publish", meetingId: meeting.id });
    expect(script.assignedTo.name).toBe("Rustam");
    expect(pub.task.requiresApproval).toBe(true);
    expect(pub.task.approvalCode).toBeUndefined();

    const end = await call(client, "meeting_end", { summary: "Ssenariy va nashr" });
    expect(end.tasksCreated).toBe(2);
    st = await call(client, "office_state");
    expect(st.meeting).toBeNull();
    expect(st.agents.find((a: any) => a.name === "Rustam").state).toBe("toDesk");

    await call(client, "task_update", { taskId: script.task.id, status: "in_progress", progress: 50 });
    st = await call(client, "office_state");
    const rustam = st.agents.find((a: any) => a.name === "Rustam");
    expect(rustam.state).toBe("working");
    expect(rustam.task.progress).toBe(50);
    await call(client, "task_update", { taskId: script.task.id, status: "done", result: { hook: "Siz buni bilmagansiz!" } });

    const { contentItem } = await call(client, "content_save", {
      type: "reel",
      caption: "Yangi kolleksiya",
      hashtags: ["moda", "#toshkent"],
      scheduledAt: "2026-11-19T09:00:00+05:00",
      taskId: pub.task.id,
    });
    expect(contentItem.hashtags).toEqual(["#moda", "#toshkent"]);

    expect(await callErr(client, "task_update", { taskId: pub.task.id, status: "done" })).toContain("approval_required");
    await call(client, "task_update", { taskId: pub.task.id, status: "awaiting_approval", result: { caption: "Yangi kolleksiya" } });

    const queue = await call(client, "approvals_list");
    expect(queue).toHaveLength(1);
    expect(queue[0].approvalCode).toBeUndefined();

    expect(await callErr(client, "approval_resolve", { taskId: pub.task.id, decision: "approve" })).toContain("approval_code_invalid");
    const codeFromWeb = (await db.task.findUniqueOrThrow({ where: { id: pub.task.id } })).approvalCode!;
    const ok = await call(client, "approval_resolve", { taskId: pub.task.id, decision: "approve", approvalCode: codeFromWeb });
    expect(ok.task.status).toBe("approved");
    expect(ok.waitSeconds).toBeGreaterThanOrEqual(45);

    await call(client, "task_update", { taskId: pub.task.id, status: "done", result: { permalink: "https://www.instagram.com/reel/abc/" } });
    const cal = await call(client, "content_calendar_get", { from: "2026-11-18T00:00:00Z", to: "2026-11-30T00:00:00Z" });
    expect(cal.items[0].status).toBe("published");
    expect(cal.items[0].permalink).toBe("https://www.instagram.com/reel/abc/");

    await call(client, "analytics_save", { accountId: account.id, followers: 1000, reach: 5000 });
    await call(client, "analytics_save", { accountId: account.id, followers: 1100, reach: 7000 });
    const an = await call(client, "analytics_get", { accountId: account.id });
    expect(an.delta).toEqual({ followers: 100, reach: 2000 });

    await call(client, "log_add", { message: "Chrome'da statistika o'qildi", role: "analyst" });
    const tl = await call(client, "task_list", { status: ["done"] });
    expect(tl).toHaveLength(2);

    // Har bir chaqiruv log yozgan (xatolar ham)
    const logs = await db.logEntry.findMany({ where: { workspaceId } });
    const toolCalls = 26;
    expect(logs.filter((x) => x.tool).length).toBe(toolCalls);
    expect(logs.some((x) => x.actor === "system" && x.message.startsWith("Xato"))).toBe(true);
    expect(logs.some((x) => x.actor === "scriptwriter" && x.message.includes("Tayyor!"))).toBe(true);

    // Jonli hodisalar NOTIFY orqali keldi
    await new Promise((r) => setTimeout(r, 200));
    await l.close();
    const types = new Set(events.map((e) => e.type));
    for (const t of ["log", "task", "meeting", "account", "agents", "content", "analytics"]) expect(types).toContain(t);
  });

  it("Kommentator begona postga javob yoza olmaydi; taqiqlangan tur yo'q", async () => {
    await call(client, "account_add", { username: "shop" });
    const t = await call(client, "task_create", { title: "Izohga javob", role: "commenter", kind: "comment_reply" });
    const err = await callErr(client, "task_update", {
      taskId: t.task.id,
      status: "awaiting_approval",
      result: { targetType: "own_post_comment", targetOwner: "raqobatchi", reply: "Bizga keling!" },
    });
    expect(err).toContain("forbidden");
    const bad = (await client.callTool({ name: "task_create", arguments: { title: "x", role: "commenter", kind: "like" } })) as {
      isError?: boolean;
    };
    expect(bad.isError).toBe(true);
  });

  it("boshqa foydalanuvchining ma'lumotlari ko'rinmaydi", async () => {
    await call(client, "account_add", { username: "birinchi" });
    const other = await makeUser(db);
    const c2 = await connect((await oauthLogin(other.user.id)).access_token);
    expect((await call(c2, "accounts_list")).accounts).toEqual([]);
    await c2.close();
  });
});
