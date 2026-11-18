import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { AGENT_ROLES, AGENT_STATES, TASK_STATUSES, TASK_KINDS, TOTAL_AGENTS } from "@jarvisgram/shared";
import { createDb, DomainError, accounts, actions, agents, approvals, graph, meetings, office, tasks, users, oauth } from "../src/index";
import { AgentRole, AgentState, TaskStatus, TaskKind } from "../src/generated/prisma/enums";
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

describe("enum sinxronligi", () => {
  it("shared va Prisma enumlari bir xil", () => {
    expect(Object.values(AgentRole).sort()).toEqual([...AGENT_ROLES].sort());
    expect(Object.values(AgentState).sort()).toEqual([...AGENT_STATES].sort());
    expect(Object.values(TaskStatus).sort()).toEqual([...TASK_STATUSES].sort());
    expect(Object.values(TaskKind).sort()).toEqual([...TASK_KINDS].sort());
  });
});

describe("ro'yxatdan o'tish", () => {
  it("13 agentli workspace yaratadi, parol xeshlanadi", async () => {
    const { user, workspace } = await users.signUp(db, { email: "A@Test.uz", password: "parol12345" });
    expect(user.email).toBe("a@test.uz");
    expect(user.passwordHash).not.toContain("parol12345");
    const list = await db.agent.findMany({ where: { workspaceId: workspace.id } });
    expect(list).toHaveLength(TOTAL_AGENTS);
    expect(TOTAL_AGENTS).toBe(13);
    expect(await users.authenticate(db, "a@test.uz", "parol12345")).not.toBeNull();
    expect(await users.authenticate(db, "a@test.uz", "notogri")).toBeNull();
    expect(await code(users.signUp(db, { email: "a@test.uz", password: "parol12345" }))).toBe("conflict");
  });

  it("sessiya tokeni ishlaydi va o'chiriladi", async () => {
    const { user } = await makeUser(db);
    const s = await users.createSession(db, user.id);
    expect((await users.getSession(db, s.token))?.user.id).toBe(user.id);
    await users.deleteSession(db, s.token);
    expect(await users.getSession(db, s.token)).toBeNull();
  });
});

describe("akkauntlar", () => {
  it("username normallashtiriladi, birinchisi faol bo'ladi", async () => {
    const { ctx } = await makeUser(db);
    const a = await accounts.addAccount(ctx, { username: "https://instagram.com/My.Shop/" });
    expect(a.username).toBe("my.shop");
    expect((await accounts.getActiveAccount(ctx))?.id).toBe(a.id);
    expect(await code(accounts.addAccount(ctx, { username: "@my.shop" }))).toBe("conflict");
    expect(await code(accounts.addAccount(ctx, { username: "yomon ism!" }))).toBe("invalid_input");
    const b = await accounts.addAccount(ctx, { username: "second" });
    await accounts.switchAccount(ctx, { username: "second" });
    expect((await accounts.getActiveAccount(ctx))?.id).toBe(b.id);
  });

  it("boshqa workspace akkauntiga kira olmaydi", async () => {
    const one = await makeUser(db);
    const two = await makeUser(db);
    const a = await accounts.addAccount(one.ctx, { username: "shop" });
    expect(await code(accounts.switchAccount(two.ctx, { accountId: a.id }))).toBe("not_found");
    expect(await code(tasks.createTask(two.ctx, { title: "x", role: "copywriter", accountId: a.id }))).toBe("not_found");
  });
});

describe("vazifa holatlari va agentlar", () => {
  it("agent holati haqiqiy yozuvlardan hisoblanadi", async () => {
    const { ctx } = await makeUser(db);
    await accounts.addAccount(ctx, { username: "shop" });
    const m = await meetings.startMeeting(ctx, { command: "Ertangi Reels" });
    await agents.recomputeAgents(ctx);
    let st = await office.officeState(ctx);
    expect(st.agents.every((a) => a.state === "meeting")).toBe(true);
    expect(st.meeting?.id).toBe(m.id);

    const { task, agent } = await tasks.createTask(ctx, { title: "Hook yoz", role: "copywriter", meetingId: m.id });
    await meetings.endMeeting(ctx, {});
    await agents.recomputeAgents(ctx);
    st = await office.officeState(ctx);
    expect(st.agents.find((a) => a.id === agent!.id)?.state).toBe("toDesk");
    expect(st.agents.filter((a) => a.state === "chill")).toHaveLength(12);

    await tasks.updateTask(ctx, task.id, { status: "in_progress", progress: 40 });
    await agents.recomputeAgents(ctx);
    st = await office.officeState(ctx);
    const me = st.agents.find((a) => a.id === agent!.id)!;
    expect(me.state).toBe("working");
    expect(me.task?.progress).toBe(40);

    await tasks.updateTask(ctx, task.id, { status: "done", result: { caption: "..." } });
    await agents.recomputeAgents(ctx);
    st = await office.officeState(ctx);
    expect(st.agents.find((a) => a.id === agent!.id)?.state).toBe("chill");
  });

  it("ikkinchi vazifa bo'sh agentga tushadi", async () => {
    const { ctx } = await makeUser(db);
    const a = await tasks.createTask(ctx, { title: "1", role: "copywriter" });
    const b = await tasks.createTask(ctx, { title: "2", role: "copywriter" });
    expect(a.agent!.id).not.toBe(b.agent!.id);
  });

  it("rolga mos bo'lmagan tur rad etiladi", async () => {
    const { ctx } = await makeUser(db);
    await accounts.addAccount(ctx, { username: "shop" });
    expect(await code(tasks.createTask(ctx, { title: "x", role: "copywriter", kind: "publish" }))).toBe("invalid_input");
    expect(await code(tasks.createTask(ctx, { title: "x", role: "trendHunter", kind: "comment_reply" }))).toBe("invalid_input");
  });

  it("nashr vazifasi tasdiqsiz done bo'lmaydi; approved/rejected task_update orqali taqiqlangan", async () => {
    const { ctx } = await makeUser(db);
    await accounts.addAccount(ctx, { username: "shop" });
    const { task } = await tasks.createTask(ctx, { title: "Nashr", role: "smm", kind: "publish" });
    expect(task.requiresApproval).toBe(true);
    await tasks.updateTask(ctx, task.id, { status: "in_progress" });
    expect(await code(tasks.updateTask(ctx, task.id, { status: "done" }))).toBe("approval_required");
    expect(await code(tasks.updateTask(ctx, task.id, { status: "approved" }))).toBe("forbidden");
    expect(await code(tasks.updateTask(ctx, task.id, { status: "awaiting_approval" }))).toBe("invalid_input");
    const sub = await tasks.updateTask(ctx, task.id, { status: "awaiting_approval", result: { caption: "Salom" } });
    expect(sub.approvalCode).toMatch(/^[A-Z2-9]{6}$/);
    expect(await code(tasks.updateTask(ctx, task.id, { status: "done" }))).toBe("approval_required");
  });
});

describe("tasdiqlash", () => {
  async function submitted(kind: "publish" | "comment_reply" = "publish") {
    const u = await makeUser(db);
    await accounts.addAccount(u.ctx, { username: "shop", dailyLimits: { publish: 1, minPauseSec: 5, maxPauseSec: 9 } });
    const role = kind === "publish" ? "smm" : "commenter";
    const { task } = await tasks.createTask(u.ctx, { title: "t", role, kind });
    const result =
      kind === "publish"
        ? { caption: "Salom" }
        : { targetType: "own_post_comment", targetOwner: "shop", targetRef: "p/1", originalText: "?", reply: "Rahmat!" };
    const sub = await tasks.updateTask(u.ctx, task.id, { status: "awaiting_approval", result });
    return { ...u, task: sub };
  }

  it("MCP (Claude) kodsiz tasdiqlay olmaydi, kod bilan — oladi; kod bir martalik", async () => {
    const { ctx, task } = await submitted();
    expect(await code(approvals.resolveApproval(ctx, { taskId: task.id, decision: "approve", byUser: false }))).toBe(
      "approval_code_invalid",
    );
    expect(
      await code(approvals.resolveApproval(ctx, { taskId: task.id, decision: "approve", approvalCode: "AAAAAA", byUser: false })),
    ).toBe("approval_code_invalid");
    const r = await approvals.resolveApproval(ctx, {
      taskId: task.id,
      decision: "approve",
      approvalCode: task.approvalCode!.toLowerCase(),
      byUser: false,
    });
    expect(r.task.status).toBe("approved");
    expect(r.task.approvalCode).toBeNull();
    expect(r.task.payload).toMatchObject({ kind: "publish", caption: "Salom" });
    // Tasdiqlangan harakat task_update bilan yakunlanmaydi — faqat action_begin/action_complete
    expect(await code(tasks.updateTask(ctx, task.id, { status: "done" }))).toBe("approval_required");
  });

  it("foydalanuvchi matnni tahrirlab tasdiqlaydi; Claude tahrirlay olmaydi", async () => {
    const { ctx, task } = await submitted();
    expect(
      await code(
        approvals.resolveApproval(ctx, { taskId: task.id, decision: "approve", approvalCode: task.approvalCode!, editedText: "x", byUser: false }),
      ),
    ).toBe("forbidden");
    const r = await approvals.resolveApproval(ctx, { taskId: task.id, decision: "approve", editedText: "Yangi matn", byUser: true });
    expect(r.task.payload).toMatchObject({ caption: "Yangi matn" });
  });

  it("rad etish kodsiz mumkin, keyin qayta ishlash", async () => {
    const { ctx, task } = await submitted();
    const r = await approvals.resolveApproval(ctx, { taskId: task.id, decision: "reject", note: "Qisqaroq", byUser: false });
    expect(r.task.status).toBe("rejected");
    const again = await tasks.updateTask(ctx, task.id, { status: "in_progress" });
    expect(again.progress).toBe(0);
  });

  it("Kommentator faqat o'z postiga javob qoralaydi", async () => {
    const { ctx } = await submitted("comment_reply");
    const { task } = await tasks.createTask(ctx, { title: "begona", role: "commenter", kind: "comment_reply" });
    const bad = { targetType: "own_post_comment", targetOwner: "begona_akkaunt", reply: "Zo'r!" };
    expect(await code(tasks.updateTask(ctx, task.id, { status: "awaiting_approval", result: bad }))).toBe("forbidden");
    const bad2 = { targetType: "other_post", targetOwner: "shop", reply: "Zo'r!" };
    expect(await code(tasks.updateTask(ctx, task.id, { status: "awaiting_approval", result: bad2 }))).toBe("forbidden");
  });
});

describe("OAuth", () => {
  it("kod bir marta almashtiriladi, refresh rotatsiya qilinadi", async () => {
    const { user, workspace } = await makeUser(db);
    await oauth.saveClient(db, { client_id: "c1", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"], client_name: "Claude" });
    const a = await oauth.createAuthorization(db, {
      clientId: "c1",
      redirectUri: "https://claude.ai/api/mcp/auth_callback",
      codeChallenge: "abc",
      state: "s1",
    });
    expect((await oauth.getPendingAuthorization(db, a.id))?.clientName).toBe("Claude");
    const redirect = new URL(await oauth.approveAuthorization(db, a.id, user.id));
    expect(redirect.searchParams.get("state")).toBe("s1");
    const c = redirect.searchParams.get("code")!;
    expect(await oauth.challengeForCode(db, "c1", c)).toBe("abc");
    expect(await code(oauth.exchangeCode(db, { clientId: "boshqa", code: c }))).toBe("unauthorized");
    const tok = await oauth.exchangeCode(db, { clientId: "c1", code: c });
    expect(await code(oauth.exchangeCode(db, { clientId: "c1", code: c }))).toBe("unauthorized");
    expect((await oauth.verifyAccessToken(db, tok.access_token))?.workspaceId).toBe(workspace.id);
    const tok2 = await oauth.exchangeRefresh(db, { clientId: "c1", refreshToken: tok.refresh_token });
    expect(await oauth.verifyAccessToken(db, tok.access_token)).toBeNull();
    expect(await oauth.verifyAccessToken(db, tok2.access_token)).not.toBeNull();
    expect(await code(oauth.exchangeRefresh(db, { clientId: "c1", refreshToken: tok.refresh_token }))).toBe("unauthorized");
  });
});

describe("bajarish: action_begin / action_complete", () => {
  async function approved(opts: { limits?: Record<string, number>; result?: Record<string, unknown>; kind?: "publish" | "comment_reply" } = {}) {
    const u = await makeUser(db);
    const acc = await accounts.addAccount(u.ctx, { username: "shop", dailyLimits: { publish: 2, minPauseSec: 30, maxPauseSec: 60, ...opts.limits } });
    await db.instagramAccount.update({ where: { id: acc.id }, data: { status: "connected" } });
    const kind = opts.kind ?? "publish";
    const { task } = await tasks.createTask(u.ctx, { title: "t", role: kind === "publish" ? "smm" : "commenter", kind });
    await tasks.updateTask(u.ctx, task.id, {
      status: "awaiting_approval",
      result: (opts.result ?? (kind === "publish"
        ? { caption: "Salom", hashtags: ["#a"] }
        : { targetType: "own_post_comment", targetOwner: "shop", targetRef: "https://www.instagram.com/p/x/", originalText: "Narxi?", reply: "DM'ga yozing" })) as never,
    });
    await approvals.resolveApproval(u.ctx, { taskId: task.id, decision: "approve", byUser: true });
    return { ...u, acc, taskId: task.id };
  }
  const unpause = (id: string) => db.instagramAccount.update({ where: { id }, data: { nextActionAfter: null } });

  it("aniq matnni qaytaradi; noto'g'ri akkaunt, tasdiqsiz vazifa rad etiladi", async () => {
    const { ctx, taskId } = await approved();
    expect(await code(actions.beginAction(ctx, { taskId, via: "chrome" }))).toBe("invalid_input");
    expect(await code(actions.beginAction(ctx, { taskId, via: "chrome", observedUsername: "boshqa" }))).toBe("forbidden");
    expect(await code(actions.beginAction(ctx, { taskId, via: "graph_api" }))).toBe("forbidden");
    const b = await actions.beginAction(ctx, { taskId, via: "chrome", observedUsername: "@Shop" });
    expect(b.textToType).toBe("Salom\n\n#a");
    expect(b.playbook).toBe("publish_post");
    expect(b.nextActionInSeconds).toBeGreaterThanOrEqual(30);
    expect(await code(actions.beginAction(ctx, { taskId, via: "chrome", observedUsername: "shop" }))).toBe("conflict");
    expect(await code(actions.completeAction(ctx, { taskId, ok: true, permalink: "https://evil.com/x" }))).toBe("invalid_input");
    const done = await actions.completeAction(ctx, { taskId, ok: true, permalink: "https://www.instagram.com/p/abc/" });
    expect(done.status).toBe("done");
    expect((done.result as Record<string, unknown>).permalink).toBe("https://www.instagram.com/p/abc/");
  });

  it("tasodifiy pauza va kunlik limit serverda majburlanadi", async () => {
    const { ctx, taskId, acc } = await approved({ limits: { publish: 2 } });
    await actions.beginAction(ctx, { taskId, via: "chrome", observedUsername: "shop" });
    await actions.completeAction(ctx, { taskId, ok: true });
    const mk = async (title: string) => {
      const { task } = await tasks.createTask(ctx, { title, role: "smm", kind: "publish" });
      await tasks.updateTask(ctx, task.id, { status: "awaiting_approval", result: { caption: title } });
      await approvals.resolveApproval(ctx, { taskId: task.id, decision: "approve", byUser: true });
      return task.id;
    };
    const t2 = await mk("2");
    try {
      await actions.beginAction(ctx, { taskId: t2, via: "chrome", observedUsername: "shop" });
      throw new Error("pauza ishlamadi");
    } catch (e) {
      expect((e as DomainError).code).toBe("too_soon");
      expect((e as DomainError).details?.retryAfterSeconds).toBeGreaterThan(0);
    }
    await unpause(acc.id);
    await actions.beginAction(ctx, { taskId: t2, via: "chrome", observedUsername: "shop" });
    await actions.completeAction(ctx, { taskId: t2, ok: true });
    const t3 = await mk("3");
    await unpause(acc.id);
    expect(await code(actions.beginAction(ctx, { taskId: t3, via: "chrome", observedUsername: "shop" }))).toBe("limit_reached");
  });

  it("rejalashtirilgan vaqt kelmaguncha bajarilmaydi", async () => {
    const future = new Date(Date.now() + 3600_000).toISOString();
    const { ctx, taskId } = await approved({ result: { caption: "x", scheduledAt: future } });
    expect(await code(actions.beginAction(ctx, { taskId, via: "chrome", observedUsername: "shop" }))).toBe("not_yet");
  });

  it("Instagram bloklasa akkaunt 'limited' bo'ladi va keyingi harakatlar to'xtaydi", async () => {
    const { ctx, taskId, acc } = await approved();
    await actions.beginAction(ctx, { taskId, via: "chrome", observedUsername: "shop" });
    const t = await actions.completeAction(ctx, { taskId, ok: false, error: "Action blocked", blocked: true });
    expect(t.status).toBe("approved");
    expect(t.actionError).toBe("Action blocked");
    expect((await db.instagramAccount.findUniqueOrThrow({ where: { id: acc.id } })).status).toBe("limited");
    await unpause(acc.id);
    expect(await code(actions.beginAction(ctx, { taskId, via: "chrome", observedUsername: "shop" }))).toBe("forbidden");
  });

  it("account_status=connected faqat Chrome'da to'g'ri akkaunt ko'rilganda", async () => {
    const { ctx, acc } = await approved();
    expect(await code(accounts.setAccountStatus(ctx, acc.id, "connected"))).toBe("invalid_input");
    expect(await code(accounts.setAccountStatus(ctx, acc.id, "connected", "begona"))).toBe("forbidden");
    expect((await accounts.setAccountStatus(ctx, acc.id, "connected", "@shop")).status).toBe("connected");
  });
});

describe("Graph API", () => {
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

  /** Soxta Graph API: qaysi so'rovlar kelganini yozib boradi. */
  function fakeGraph(username = "shop") {
    const calls: { method: string; url: string; body: string; auth: string | null }[] = [];
    let n = 0;
    const f = (async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? String(init.body) : "";
      const auth = new Headers(init?.headers).get("authorization");
      calls.push({ method: init?.method ?? "GET", url, body, auth });
      const ok = (j: unknown) => new Response(JSON.stringify(j), { status: 200, headers: { "content-type": "application/json" } });
      if (url.endsWith("/oauth/access_token")) return ok({ access_token: "SHORT", user_id: 1789 });
      if (url.includes("/access_token?grant_type=ig_exchange_token")) return ok({ access_token: "LONG", expires_in: 5184000 });
      if (url.includes("/me?")) return ok({ user_id: "1789", username, followers_count: 1200, follows_count: 80, media_count: 41 });
      if (url.endsWith("/1789/media")) return ok({ id: `C${++n}` });
      if (/\/C\d+\?fields=status_code/.test(url)) return ok({ status_code: "FINISHED" });
      if (url.endsWith("/1789/media_publish")) return ok({ id: "M1" });
      if (url.includes("/M1?fields=permalink")) return ok({ permalink: "https://www.instagram.com/p/GRAPH1/" });
      if (url.endsWith("/555/replies")) return ok({ id: "R1" });
      return new Response(JSON.stringify({ error: { message: "unknown " + url } }), { status: 400 });
    }) as typeof fetch;
    const client = new graph.GraphClient({ appId: "app", appSecret: "sec", redirectUri: "https://web/cb", fetch: f, sleep: async () => {} });
    return { client, calls };
  }

  it("ulash: token shifrlanadi, boshqa username bilan ulab bo'lmaydi", async () => {
    const u = await makeUser(db);
    const acc = await accounts.addAccount(u.ctx, { username: "shop" });
    expect(await code(graph.connectGraphAccount(u.ctx, fakeGraph("begona").client, acc.id, "CODE"))).toBe("forbidden");
    const { client, calls } = fakeGraph();
    const c = await graph.connectGraphAccount(u.ctx, client, acc.id, "CODE");
    expect(c.publishMode).toBe("graph_api");
    expect(c.igUserId).toBe("1789");
    expect(c.graphTokenEnc).not.toContain("LONG");
    expect(calls[0]!.body).toContain("code=CODE");
    expect(client.authorizeUrl("st")).toContain("scope=instagram_business_basic%2Cinstagram_business_content_publish");
  });

  it("nashr: tasdiqdan keyin konteyner → media_publish → permalink; Bearer token", async () => {
    const u = await makeUser(db);
    const acc = await accounts.addAccount(u.ctx, { username: "shop", dailyLimits: { minPauseSec: 30, maxPauseSec: 30 } });
    const { client, calls } = fakeGraph();
    await graph.connectGraphAccount(u.ctx, client, acc.id, "CODE");
    const { task } = await tasks.createTask(u.ctx, { title: "Nashr", role: "smm", kind: "publish" });
    await tasks.updateTask(u.ctx, task.id, {
      status: "awaiting_approval",
      result: { caption: "Yangi kolleksiya", hashtags: ["#moda"], mediaUrl: "https://cdn.example.com/a.jpg" },
    });
    expect(await code(graph.graphExecute(u.ctx, client, task.id))).toBe("approval_required");
    await approvals.resolveApproval(u.ctx, { taskId: task.id, decision: "approve", byUser: true });
    const done = await graph.graphExecute(u.ctx, client, task.id);
    expect(done.status).toBe("done");
    expect((done.result as Record<string, unknown>).permalink).toBe("https://www.instagram.com/p/GRAPH1/");
    const create = calls.find((c) => c.url.endsWith("/1789/media"))!;
    expect(create.url).toContain("/v26.0/");
    expect(create.auth).toBe("Bearer LONG");
    expect(new URLSearchParams(create.body).get("image_url")).toBe("https://cdn.example.com/a.jpg");
    expect(new URLSearchParams(create.body).get("caption")).toBe("Yangi kolleksiya\n\n#moda");
    expect(calls.some((c) => c.url.endsWith("/media_publish") && c.body.includes("creation_id=C1"))).toBe(true);
  });

  it("statistika Graph API'dan olinadi", async () => {
    const u = await makeUser(db);
    const acc = await accounts.addAccount(u.ctx, { username: "shop" });
    const { client } = fakeGraph();
    await graph.connectGraphAccount(u.ctx, client, acc.id, "CODE");
    const s = await graph.graphSyncAnalytics(u.ctx, client, acc.id);
    expect([s.followers, s.following, s.posts, s.source]).toEqual([1200, 80, 41, "graph_api"]);
  });
});
