import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { AGENT_ROLES, AGENT_STATES, TASK_STATUSES, TASK_KINDS, TOTAL_AGENTS } from "@jarvisgram/shared";
import { createDb, DomainError, accounts, agents, approvals, meetings, office, tasks, users, oauth } from "../src/index";
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
    expect(await code(tasks.updateTask(ctx, task.id, { status: "done" }))).toBe("invalid_transition");
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
    expect(r.waitSeconds).toBeGreaterThanOrEqual(5);
    expect(r.waitSeconds).toBeLessThanOrEqual(9);
    const done = await tasks.updateTask(ctx, task.id, { status: "done", result: { permalink: "https://instagram.com/p/x" } });
    expect(done.status).toBe("done");
  });

  it("kunlik limit ishlaydi", async () => {
    const { ctx, task } = await submitted();
    await approvals.resolveApproval(ctx, { taskId: task.id, decision: "approve", byUser: true });
    const { task: t2 } = await tasks.createTask(ctx, { title: "2", role: "smm", kind: "publish" });
    await tasks.updateTask(ctx, t2.id, { status: "awaiting_approval", result: { caption: "2" } });
    expect(await code(approvals.resolveApproval(ctx, { taskId: t2.id, decision: "approve", byUser: true }))).toBe("limit_reached");
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
