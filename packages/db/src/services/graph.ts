import { isPublishPayload, type ActionPayload, type PublishPayload } from "@jarvisgram/shared";
import { decryptSecret, encryptSecret } from "../crypto";
import { DomainError } from "../errors";
import { notify } from "../events";
import { beginAction, completeAction } from "./actions";
import { getAccount } from "./accounts";
import { saveSnapshot } from "./analytics";
import type { Ctx } from "./context";

/**
 * Rasmiy Instagram API (Instagram Login, graph.instagram.com).
 * Hujjat: https://developers.facebook.com/docs/instagram-platform/content-publishing/
 * Nashr: konteyner yaratish → (video bo'lsa status_code FINISHED kutish) → media_publish.
 * Talab: professional (biznes/creator) akkaunt, ommaviy https media havolasi.
 */
export interface GraphConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
  /** Standart: v26.0 */
  version?: string;
  graphBase?: string;
  apiBase?: string;
  authBase?: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export const GRAPH_SCOPES = ["instagram_business_basic", "instagram_business_content_publish", "instagram_business_manage_comments"];

export function graphConfigFromEnv(env = process.env): GraphConfig | null {
  if (!env.INSTAGRAM_APP_ID || !env.INSTAGRAM_APP_SECRET || !env.INSTAGRAM_REDIRECT_URI) return null;
  return {
    appId: env.INSTAGRAM_APP_ID,
    appSecret: env.INSTAGRAM_APP_SECRET,
    redirectUri: env.INSTAGRAM_REDIRECT_URI,
    version: env.IG_GRAPH_VERSION || "v26.0",
    graphBase: env.IG_GRAPH_BASE || undefined,
    apiBase: env.IG_API_BASE || undefined,
    authBase: env.IG_AUTH_BASE || undefined,
  };
}

export class GraphClient {
  private f: typeof fetch;
  private v: string;
  private graph: string;
  private api: string;
  private auth: string;
  readonly sleep: (ms: number) => Promise<void>;

  constructor(private cfg: GraphConfig) {
    this.f = cfg.fetch ?? fetch;
    this.v = cfg.version ?? "v26.0";
    this.graph = (cfg.graphBase ?? "https://graph.instagram.com").replace(/\/$/, "");
    this.api = (cfg.apiBase ?? "https://api.instagram.com").replace(/\/$/, "");
    this.auth = (cfg.authBase ?? "https://www.instagram.com").replace(/\/$/, "");
    this.sleep = cfg.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  authorizeUrl(state: string) {
    const u = new URL(`${this.auth}/oauth/authorize`);
    u.searchParams.set("client_id", this.cfg.appId);
    u.searchParams.set("redirect_uri", this.cfg.redirectUri);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("scope", GRAPH_SCOPES.join(","));
    u.searchParams.set("state", state);
    return u.toString();
  }

  private async json<T>(res: Response): Promise<T> {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || body.error) {
      const err = (body.error ?? {}) as Record<string, unknown>;
      const msg = String(err.message ?? body.error_message ?? res.statusText ?? "Graph API xatosi");
      throw new DomainError("upstream", `Instagram API: ${msg}`, { status: res.status, code: err.code, subcode: err.error_subcode });
    }
    return body as T;
  }

  private get<T>(path: string, token: string, params: Record<string, string> = {}) {
    const u = new URL(`${this.graph}/${this.v}/${path}`);
    for (const [k, val] of Object.entries(params)) u.searchParams.set(k, val);
    return this.f(u, { headers: { Authorization: `Bearer ${token}` } }).then((r) => this.json<T>(r));
  }

  private post<T>(path: string, token: string, params: Record<string, string>) {
    return this.f(`${this.graph}/${this.v}/${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params),
    }).then((r) => this.json<T>(r));
  }

  /** code → qisqa muddatli token → uzoq muddatli (≈60 kun) token */
  async exchangeCode(code: string) {
    const short = await this.f(`${this.api}/oauth/access_token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.cfg.appId,
        client_secret: this.cfg.appSecret,
        grant_type: "authorization_code",
        redirect_uri: this.cfg.redirectUri,
        code,
      }),
    }).then((r) => this.json<{ access_token: string; user_id: string | number }>(r));
    const u = new URL(`${this.graph}/access_token`);
    u.searchParams.set("grant_type", "ig_exchange_token");
    u.searchParams.set("client_secret", this.cfg.appSecret);
    u.searchParams.set("access_token", short.access_token);
    const long = await this.f(u).then((r) => this.json<{ access_token: string; expires_in: number }>(r));
    return { accessToken: long.access_token, expiresIn: long.expires_in, userId: String(short.user_id) };
  }

  async refresh(token: string) {
    const u = new URL(`${this.graph}/refresh_access_token`);
    u.searchParams.set("grant_type", "ig_refresh_token");
    u.searchParams.set("access_token", token);
    const r = await this.f(u).then((x) => this.json<{ access_token: string; expires_in: number }>(x));
    return { accessToken: r.access_token, expiresIn: r.expires_in };
  }

  me(token: string) {
    return this.get<{ user_id?: string; id?: string; username: string; followers_count?: number; follows_count?: number; media_count?: number }>(
      "me",
      token,
      { fields: "user_id,username,followers_count,follows_count,media_count" },
    );
  }

  /** Nashr. Natija: media id va permalink. */
  async publish(igUserId: string, token: string, p: PublishPayload, caption: string) {
    const isVideo = (u: string) => /\.(mp4|mov|m4v)(\?|$)/i.test(u);
    const mediaParams = (u: string): Record<string, string> => (isVideo(u) ? { video_url: u } : { image_url: u });
    if (!p.mediaUrls.length) throw new DomainError("invalid_input", "Graph API orqali nashr uchun ommaviy media havolasi kerak");

    let creationId: string;
    if (p.type === "carousel" && p.mediaUrls.length > 1) {
      const children: string[] = [];
      for (const u of p.mediaUrls.slice(0, 10)) {
        const c = await this.post<{ id: string }>(`${igUserId}/media`, token, {
          ...mediaParams(u),
          ...(isVideo(u) ? { media_type: "VIDEO" } : {}),
          is_carousel_item: "true",
        });
        await this.waitReady(c.id, token);
        children.push(c.id);
      }
      creationId = (await this.post<{ id: string }>(`${igUserId}/media`, token, { media_type: "CAROUSEL", children: children.join(","), caption })).id;
    } else {
      const u = p.mediaUrls[0]!;
      const params: Record<string, string> =
        p.type === "reel"
          ? { media_type: "REELS", video_url: u, caption }
          : p.type === "story"
            ? { media_type: "STORIES", ...mediaParams(u) }
            : { ...mediaParams(u), ...(isVideo(u) ? { media_type: "VIDEO" } : {}), caption };
      creationId = (await this.post<{ id: string }>(`${igUserId}/media`, token, params)).id;
    }
    await this.waitReady(creationId, token);
    const media = await this.post<{ id: string }>(`${igUserId}/media_publish`, token, { creation_id: creationId });
    const info = await this.get<{ permalink?: string }>(media.id, token, { fields: "permalink" }).catch(() => ({ permalink: undefined }));
    return { mediaId: media.id, permalink: info.permalink };
  }

  /** Konteyner tayyor bo'lguncha kutish (video uchun). */
  private async waitReady(containerId: string, token: string, tries = 30) {
    for (let i = 0; i < tries; i++) {
      const s = await this.get<{ status_code?: string }>(containerId, token, { fields: "status_code" });
      if (!s.status_code || s.status_code === "FINISHED" || s.status_code === "PUBLISHED") return;
      if (s.status_code === "ERROR" || s.status_code === "EXPIRED")
        throw new DomainError("upstream", `Instagram media konteyneri: ${s.status_code}`);
      await this.sleep(2000);
    }
    throw new DomainError("upstream", "Instagram media konteyneri tayyor bo'lmadi (vaqt tugadi)");
  }

  replyToComment(commentId: string, token: string, message: string) {
    return this.post<{ id: string }>(`${commentId}/replies`, token, { message });
  }
}

// ---------- Servislar ----------

/** OAuth callback: tokenni olib, akkauntga bog'laydi. Username mos kelishi shart. */
export async function connectGraphAccount(ctx: Ctx, client: GraphClient, accountId: string, code: string) {
  const acc = await getAccount(ctx, accountId);
  const tok = await client.exchangeCode(code);
  const me = await client.me(tok.accessToken);
  if (me.username.toLowerCase() !== acc.username)
    throw new DomainError(
      "forbidden",
      `Instagram'da @${me.username} bilan kirildi, lekin bu akkaunt @${acc.username}. To'g'ri akkaunt bilan qayta ulang.`,
    );
  const updated = await ctx.db.instagramAccount.update({
    where: { id: acc.id },
    data: {
      igUserId: String(me.user_id ?? me.id ?? tok.userId),
      graphTokenEnc: encryptSecret(tok.accessToken),
      graphTokenExpiresAt: new Date(Date.now() + tok.expiresIn * 1000),
      graphConnectedAt: new Date(),
      publishMode: "graph_api",
      status: "connected",
      lastCheckedAt: new Date(),
    },
  });
  await notify(ctx.db, { workspaceId: ctx.workspaceId, type: "account", refId: acc.id, message: `@${acc.username}: Graph API ulandi` });
  return updated;
}

export async function disconnectGraph(ctx: Ctx, accountId: string) {
  const acc = await getAccount(ctx, accountId);
  return ctx.db.instagramAccount.update({
    where: { id: acc.id },
    data: { igUserId: null, graphTokenEnc: null, graphTokenExpiresAt: null, graphConnectedAt: null, publishMode: "chrome" },
  });
}

/** Token muddati 7 kundan kam qolsa — yangilaydi. */
async function tokenFor(ctx: Ctx, client: GraphClient, accountId: string) {
  const acc = await getAccount(ctx, accountId);
  if (!acc.graphTokenEnc || !acc.igUserId)
    throw new DomainError("forbidden", `@${acc.username} Graph API'ga ulanmagan. Akkauntlar sahifasidan ulang.`);
  let token = decryptSecret(acc.graphTokenEnc);
  if (acc.graphTokenExpiresAt && acc.graphTokenExpiresAt.getTime() - Date.now() < 7 * 86400_000) {
    const r = await client.refresh(token);
    token = r.accessToken;
    await ctx.db.instagramAccount.update({
      where: { id: acc.id },
      data: { graphTokenEnc: encryptSecret(token), graphTokenExpiresAt: new Date(Date.now() + r.expiresIn * 1000) },
    });
  }
  return { acc, token, igUserId: acc.igUserId };
}

/** Tasdiqlangan vazifani server orqali bajaradi (xuddi shu pauza/limit/tasdiq qoidalari bilan). */
export async function graphExecute(ctx: Ctx, client: GraphClient, taskId: string) {
  const begun = await beginAction(ctx, { taskId, via: "graph_api" });
  try {
    const { token, igUserId } = await tokenFor(ctx, client, begun.account.id);
    const p = begun.payload as ActionPayload;
    let permalink: string | undefined;
    if (isPublishPayload(p)) {
      permalink = (await client.publish(igUserId, token, p, begun.textToType)).permalink;
    } else if (p.kind === "comment_reply") {
      if (!/^\d+$/.test(p.targetRef))
        throw new DomainError("invalid_input", "Graph API orqali javob uchun targetRef izoh id bo'lishi kerak");
      await client.replyToComment(p.targetRef, token, begun.textToType);
    } else {
      throw new DomainError("unsupported", "DM javoblari hozircha faqat Claude in Chrome orqali (Graph API'da Messaging alohida ruxsat talab qiladi)");
    }
    return await completeAction(ctx, { taskId, ok: true, permalink });
  } catch (e) {
    await completeAction(ctx, { taskId, ok: false, error: e instanceof Error ? e.message : String(e) }).catch(() => {});
    throw e;
  }
}

export async function graphSyncAnalytics(ctx: Ctx, client: GraphClient, accountId: string) {
  const { acc, token } = await tokenFor(ctx, client, accountId);
  const me = await client.me(token);
  return saveSnapshot(ctx, {
    accountId: acc.id,
    followers: me.followers_count,
    following: me.follows_count,
    posts: me.media_count,
    source: "graph_api",
    raw: { username: me.username },
  });
}
