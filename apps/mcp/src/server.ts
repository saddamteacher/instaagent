import express, { type Request, type Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { oauth, type Ctx, type Db } from "@jarvisgram/db";
import { JarvisgramOAuthProvider } from "./auth";
import type { Config } from "./config";
import { SERVER_INSTRUCTIONS } from "./instructions";
import { registerTools } from "./tools";

export const SERVER_INFO = { name: "jarvisgram", title: "Jarvisgram", version: "0.1.0" };

export function buildMcpServer(getCtx: () => Ctx) {
  const server = new McpServer(SERVER_INFO, { instructions: SERVER_INSTRUCTIONS, capabilities: { logging: {} } });
  registerTools(server, getCtx);
  return server;
}

export function createApp(db: Db, config: Config) {
  const app = express();
  app.set("trust proxy", 1); // Render proksi ortida
  app.disable("x-powered-by");

  const provider = new JarvisgramOAuthProvider(db, config);
  const resourceUrl = new URL(config.mcpResourceUrl);

  app.use(
    mcpAuthRouter({
      provider,
      issuerUrl: new URL(config.mcpPublicUrl),
      resourceServerUrl: resourceUrl,
      scopesSupported: [oauth.OAUTH_SCOPE],
      resourceName: "Jarvisgram",
      serviceDocumentationUrl: new URL(`${config.webPublicUrl}/connect`),
    }),
  );

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true });
  });

  const bearer = requireBearerAuth({
    verifier: provider,
    requiredScopes: [oauth.OAUTH_SCOPE],
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(resourceUrl),
    expectedResource: resourceUrl,
  });

  // Stateless Streamable HTTP: har so'rovga yangi server+transport (gorizontal masshtab uchun qulay).
  app.post("/mcp", bearer, express.json({ limit: "1mb" }), async (req: Request, res: Response) => {
    const workspaceId = req.auth?.extra?.workspaceId;
    if (typeof workspaceId !== "string") {
      res.status(401).json({ error: "invalid_token" });
      return;
    }
    const server = buildMcpServer(() => ({ db, workspaceId, actor: "jarvis" }));
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (e) {
      console.error("[mcp]", e);
      if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null });
    }
  });

  const notAllowed = (_req: Request, res: Response) => {
    res.status(405).set("Allow", "POST").json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null });
  };
  app.get("/mcp", notAllowed);
  app.delete("/mcp", notAllowed);

  return app;
}
