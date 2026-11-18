import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb, users, type Ctx } from "@jarvisgram/db";
export { safeNext } from "./url";

export const SESSION_COOKIE = "jg_session";

export async function currentSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return users.getSession(getDb(), token);
}

/** Himoyalangan sahifalar uchun: sessiya bo'lmasa /login'ga yo'naltiradi. */
export async function requireSession(next?: string) {
  const s = await currentSession();
  if (!s) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  const ctx: Ctx = { db: getDb(), workspaceId: s.workspace.id, actor: "user" };
  return { ...s, ctx };
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export const mcpUrl = () => `${(process.env.MCP_PUBLIC_URL ?? "http://localhost:3001").replace(/\/+$/, "")}/mcp`;
