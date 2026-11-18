import type { Db } from "../client";
import { randomToken, sha256 } from "../crypto";
import { DomainError } from "../errors";
import { getPrimaryWorkspace } from "./users";

/**
 * OAuth 2.1 avtorizatsiya serveri ma'lumotlari (MCP konnektori uchun).
 * Protokol qismi (metadata, DCR, PKCE tekshiruvi) apps/mcp'da MCP SDK orqali,
 * foydalanuvchi roziligi esa apps/web'dagi /oauth/consent sahifasida.
 */

export const OAUTH_SCOPE = "jarvisgram";
const AUTH_REQUEST_TTL_MS = 10 * 60 * 1000;
export const ACCESS_TOKEN_TTL_S = 3600;
const REFRESH_TOKEN_TTL_S = 30 * 24 * 3600;

/** RFC 7591 klient ma'lumoti (SDK'ning OAuthClientInformationFull bilan mos). */
export type ClientInfo = { client_id: string; redirect_uris: string[]; client_name?: string } & Record<string, unknown>;

export async function saveClient(db: Db, info: ClientInfo) {
  await db.oAuthClient.create({ data: { id: info.client_id, metadata: JSON.parse(JSON.stringify(info)) } });
  return info;
}

export async function getClient(db: Db, clientId: string): Promise<ClientInfo | undefined> {
  const c = await db.oAuthClient.findUnique({ where: { id: clientId } });
  return c ? (c.metadata as ClientInfo) : undefined;
}

export async function createAuthorization(
  db: Db,
  p: { clientId: string; redirectUri: string; codeChallenge: string; state?: string; scopes?: string[]; resource?: string },
) {
  return db.oAuthAuthorization.create({
    data: {
      clientId: p.clientId,
      redirectUri: p.redirectUri,
      codeChallenge: p.codeChallenge,
      state: p.state ?? null,
      scopes: p.scopes?.length ? p.scopes : [OAUTH_SCOPE],
      resource: p.resource ?? null,
      expiresAt: new Date(Date.now() + AUTH_REQUEST_TTL_MS),
    },
  });
}

export async function getPendingAuthorization(db: Db, id: string) {
  const a = await db.oAuthAuthorization.findUnique({ where: { id }, include: { client: true } });
  if (!a || a.status !== "pending" || a.expiresAt < new Date()) return null;
  const meta = a.client.metadata as ClientInfo;
  return { ...a, clientName: meta.client_name ?? a.clientId };
}

function redirectWith(uri: string, params: Record<string, string | null | undefined>) {
  const u = new URL(uri);
  for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v);
  return u.toString();
}

/** Foydalanuvchi "Ruxsat berish"ni bosdi: kod yaratiladi va klientga qaytish manzili beriladi. */
export async function approveAuthorization(db: Db, id: string, userId: string) {
  const a = await getPendingAuthorization(db, id);
  if (!a) throw new DomainError("not_found", "Avtorizatsiya so'rovi topilmadi yoki muddati o'tgan");
  const ws = await getPrimaryWorkspace(db, userId);
  if (!ws) throw new DomainError("not_found", "Workspace topilmadi");
  const code = randomToken("jg_c_");
  await db.oAuthAuthorization.update({
    where: { id },
    data: { status: "approved", userId, workspaceId: ws.id, codeHash: sha256(code), expiresAt: new Date(Date.now() + AUTH_REQUEST_TTL_MS) },
  });
  return redirectWith(a.redirectUri, { code, state: a.state });
}

export async function denyAuthorization(db: Db, id: string) {
  const a = await getPendingAuthorization(db, id);
  if (!a) throw new DomainError("not_found", "Avtorizatsiya so'rovi topilmadi yoki muddati o'tgan");
  await db.oAuthAuthorization.update({ where: { id }, data: { status: "denied" } });
  return redirectWith(a.redirectUri, { error: "access_denied", error_description: "Foydalanuvchi rad etdi", state: a.state });
}

async function findApprovedCode(db: Db, clientId: string, code: string) {
  const a = await db.oAuthAuthorization.findUnique({ where: { codeHash: sha256(code) } });
  if (!a || a.clientId !== clientId || a.status !== "approved" || a.expiresAt < new Date())
    throw new DomainError("unauthorized", "Avtorizatsiya kodi yaroqsiz");
  return a;
}

export async function challengeForCode(db: Db, clientId: string, code: string) {
  return (await findApprovedCode(db, clientId, code)).codeChallenge;
}

export interface TokenPair {
  access_token: string;
  token_type: "bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
}

async function issueTokens(
  db: Db,
  p: { clientId: string; userId: string; workspaceId: string; scopes: string[]; resource: string | null },
): Promise<TokenPair> {
  const access = randomToken("jg_at_");
  const refresh = randomToken("jg_rt_");
  await db.oAuthToken.create({
    data: {
      accessTokenHash: sha256(access),
      refreshTokenHash: sha256(refresh),
      clientId: p.clientId,
      userId: p.userId,
      workspaceId: p.workspaceId,
      scopes: p.scopes,
      resource: p.resource,
      expiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL_S * 1000),
      refreshExpiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_S * 1000),
    },
  });
  return { access_token: access, token_type: "bearer", expires_in: ACCESS_TOKEN_TTL_S, refresh_token: refresh, scope: p.scopes.join(" ") };
}

export async function exchangeCode(db: Db, p: { clientId: string; code: string; redirectUri?: string; resource?: string }) {
  const a = await findApprovedCode(db, p.clientId, p.code);
  if (p.redirectUri && p.redirectUri !== a.redirectUri) throw new DomainError("unauthorized", "redirect_uri mos emas");
  if (p.resource && a.resource && p.resource !== a.resource) throw new DomainError("unauthorized", "resource mos emas");
  // Bir martalik: poyga holatida ikkinchi almashtirish muvaffaqiyatsiz bo'ladi.
  const used = await db.oAuthAuthorization.updateMany({ where: { id: a.id, status: "approved" }, data: { status: "used" } });
  if (used.count !== 1) throw new DomainError("unauthorized", "Avtorizatsiya kodi allaqachon ishlatilgan");
  return issueTokens(db, { clientId: a.clientId, userId: a.userId!, workspaceId: a.workspaceId!, scopes: a.scopes, resource: a.resource });
}

export async function exchangeRefresh(db: Db, p: { clientId: string; refreshToken: string; scopes?: string[] }) {
  const t = await db.oAuthToken.findUnique({ where: { refreshTokenHash: sha256(p.refreshToken) } });
  if (!t || t.clientId !== p.clientId || t.revokedAt || (t.refreshExpiresAt && t.refreshExpiresAt < new Date()))
    throw new DomainError("unauthorized", "Refresh token yaroqsiz");
  if (p.scopes?.some((s) => !t.scopes.includes(s))) throw new DomainError("unauthorized", "Ruxsat etilmagan scope");
  // Rotatsiya: eski juftlik bekor qilinadi.
  await db.oAuthToken.update({ where: { id: t.id }, data: { revokedAt: new Date() } });
  return issueTokens(db, { clientId: t.clientId, userId: t.userId, workspaceId: t.workspaceId, scopes: p.scopes ?? t.scopes, resource: t.resource });
}

export async function verifyAccessToken(db: Db, token: string) {
  const t = await db.oAuthToken.findUnique({ where: { accessTokenHash: sha256(token) } });
  if (!t || t.revokedAt || t.expiresAt < new Date()) return null;
  return t;
}

export async function revokeToken(db: Db, clientId: string, token: string) {
  const h = sha256(token);
  await db.oAuthToken.updateMany({
    where: { clientId, OR: [{ accessTokenHash: h }, { refreshTokenHash: h }], revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Veb-ilova: foydalanuvchining ulangan MCP klientlari. */
export function listConnections(db: Db, userId: string) {
  return db.oAuthToken.findMany({
    where: { userId, revokedAt: null, refreshExpiresAt: { gt: new Date() } },
    include: { client: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function revokeConnection(db: Db, userId: string, tokenId: string) {
  await db.oAuthToken.updateMany({ where: { id: tokenId, userId }, data: { revokedAt: new Date() } });
}
