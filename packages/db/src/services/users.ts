import { AGENT_ROSTER } from "@jarvisgram/shared";
import type { Db } from "../client";
import { hashPassword, randomToken, sha256, verifyPassword } from "../crypto";
import { DomainError } from "../errors";

const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Yangi workspace + 13 ta agent (stollar 1..13). */
export async function createWorkspace(db: Db, ownerId: string, name: string) {
  return db.workspace.create({
    data: {
      ownerId,
      name,
      agents: { create: AGENT_ROSTER.map((a) => ({ role: a.role, slot: a.slot, name: a.name, deskNo: a.deskNo })) },
    },
  });
}

export async function signUp(db: Db, input: { email: string; password: string; name?: string }) {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new DomainError("invalid_input", "Email noto'g'ri");
  if (input.password.length < 8) throw new DomainError("invalid_input", "Parol kamida 8 belgidan iborat bo'lsin");
  if (await db.user.findUnique({ where: { email } }))
    throw new DomainError("conflict", "Bu email bilan hisob allaqachon mavjud");

  const user = await db.user.create({
    data: { email, name: input.name?.trim() || null, passwordHash: await hashPassword(input.password) },
  });
  const workspace = await createWorkspace(db, user.id, input.name?.trim() ? `${input.name.trim()} ofisi` : "Mening ofisim");
  return { user, workspace };
}

export async function authenticate(db: Db, email: string, password: string) {
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) return null;
  return user;
}

/** Sessiya yaratadi va cookie'ga yoziladigan ochiq tokenni qaytaradi (bazada faqat xeshi). */
export async function createSession(db: Db, userId: string) {
  const token = randomToken("jg_s_");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.session.create({ data: { userId, tokenHash: sha256(token), expiresAt } });
  return { token, expiresAt };
}

export async function getSession(db: Db, token: string | undefined | null) {
  if (!token) return null;
  const s = await db.session.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!s || s.expiresAt < new Date()) return null;
  const workspace = await getPrimaryWorkspace(db, s.userId);
  if (!workspace) return null;
  return { user: s.user, workspace };
}

export async function deleteSession(db: Db, token: string) {
  await db.session.deleteMany({ where: { tokenHash: sha256(token) } });
}

export function getPrimaryWorkspace(db: Db, userId: string) {
  return db.workspace.findFirst({ where: { ownerId: userId }, orderBy: { createdAt: "asc" } });
}
