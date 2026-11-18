import type { Response } from "express";
import type { OAuthServerProvider, AuthorizationParams } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { InvalidGrantError, InvalidTokenError, InvalidTargetError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type {
  OAuthClientInformationFull,
  OAuthTokenRevocationRequest,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { DomainError, oauth, type Db } from "@jarvisgram/db";
import type { Config } from "./config";

const sameResource = (a: string, b: string) => a.replace(/#.*$/, "").replace(/\/$/, "") === b.replace(/#.*$/, "").replace(/\/$/, "");

/**
 * Jarvisgram OAuth 2.1 provayderi. Protokol (metadata, DCR, PKCE) — MCP SDK,
 * foydalanuvchi kirishi va roziligi — veb-ilovadagi /oauth/consent sahifasi.
 */
export class JarvisgramOAuthProvider implements OAuthServerProvider {
  constructor(
    private db: Db,
    private config: Config,
  ) {}

  get clientsStore(): OAuthRegisteredClientsStore {
    return {
      getClient: async (id) => (await oauth.getClient(this.db, id)) as OAuthClientInformationFull | undefined,
      registerClient: async (client) => {
        const full = client as OAuthClientInformationFull;
        await oauth.saveClient(this.db, full as unknown as oauth.ClientInfo);
        return full;
      },
    };
  }

  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void> {
    if (params.resource && !sameResource(params.resource.href, this.config.mcpResourceUrl)) {
      const u = new URL(params.redirectUri);
      u.searchParams.set("error", "invalid_target");
      if (params.state) u.searchParams.set("state", params.state);
      res.redirect(u.toString());
      return;
    }
    const a = await oauth.createAuthorization(this.db, {
      clientId: client.client_id,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      state: params.state,
      scopes: params.scopes,
      resource: params.resource?.href ?? this.config.mcpResourceUrl,
    });
    res.redirect(`${this.config.webPublicUrl}/oauth/consent?req=${encodeURIComponent(a.id)}`);
  }

  async challengeForAuthorizationCode(client: OAuthClientInformationFull, code: string): Promise<string> {
    try {
      return await oauth.challengeForCode(this.db, client.client_id, code);
    } catch (e) {
      throw e instanceof DomainError ? new InvalidGrantError(e.message) : e;
    }
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    code: string,
    _verifier?: string,
    redirectUri?: string,
    resource?: URL,
  ): Promise<OAuthTokens> {
    if (resource && !sameResource(resource.href, this.config.mcpResourceUrl)) throw new InvalidTargetError("Noma'lum resource");
    try {
      return await oauth.exchangeCode(this.db, { clientId: client.client_id, code, redirectUri, resource: resource?.href });
    } catch (e) {
      throw e instanceof DomainError ? new InvalidGrantError(e.message) : e;
    }
  }

  async exchangeRefreshToken(client: OAuthClientInformationFull, refreshToken: string, scopes?: string[]): Promise<OAuthTokens> {
    try {
      return await oauth.exchangeRefresh(this.db, { clientId: client.client_id, refreshToken, scopes });
    } catch (e) {
      throw e instanceof DomainError ? new InvalidGrantError(e.message) : e;
    }
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const t = await oauth.verifyAccessToken(this.db, token);
    if (!t) throw new InvalidTokenError("Token yaroqsiz yoki muddati o'tgan");
    return {
      token,
      clientId: t.clientId,
      scopes: t.scopes,
      expiresAt: Math.floor(t.expiresAt.getTime() / 1000),
      resource: new URL(t.resource ?? this.config.mcpResourceUrl),
      extra: { userId: t.userId, workspaceId: t.workspaceId },
    };
  }

  async revokeToken(client: OAuthClientInformationFull, req: OAuthTokenRevocationRequest): Promise<void> {
    await oauth.revokeToken(this.db, client.client_id, req.token);
  }
}
