import express, { type Request, type Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { z } from "zod";
import { graph, oauth, type Ctx, type Db } from "@jarvisgram/db";
import { JarvisgramOAuthProvider } from "./auth";
import type { Config } from "./config";
import { SERVER_INSTRUCTIONS } from "./instructions";
import { registerTools, type ToolDeps } from "./tools";

export const SERVER_INFO = { name: "jarvisgram", title: "Jarvisgram", version: "0.1.0" };

export function buildMcpServer(getCtx: () => Ctx, deps: ToolDeps) {
  const server = new McpServer(SERVER_INFO, { instructions: SERVER_INSTRUCTIONS, capabilities: { logging: {} } });
  registerTools(server, getCtx, deps);
  // Claude Desktop'da "+" → Jarvisgram → jarvis_buyruq: buyruqni to'g'ri ish tartibi bilan boshlaydi
  server.registerPrompt(
    "jarvis_buyruq",
    {
      title: "Jarvisga buyruq",
      description: "Jarvisgram ofisiga yangi buyruq: majlis, vazifalar, bajarish va tasdiq",
      argsSchema: { buyruq: z.string().describe("Masalan: ertangi Reels'ni tayyorlang") },
    },
    ({ buyruq }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Jarvis, Jarvisgram ofisida yangi buyruq: "${buyruq}".\nIsh tartibi: office_state → meeting_start → agent_roles_get → task_create (har rol uchun) → meeting_end → vazifalarni bajarish (task_update) → nashr/izoh/DM'ni awaiting_approval ga yuborish. Men tasdiqlagandan keyingina action_begin → Chrome → action_complete. Menga o'zbek tilida qisqa hisobot ber.`,
          },
        },
      ],
    }),
  );
  return server;
}

export function createApp(db: Db, config: Config, deps: ToolDeps = defaultDeps()) {
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
    const server = buildMcpServer(() => ({ db, workspaceId, actor: "jarvis" }), deps);
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

/** Graph API mijozi env'dan (INSTAGRAM_APP_ID/SECRET/REDIRECT_URI); sozlanmagan bo'lsa null. */
export function defaultDeps(): ToolDeps {
  const cfg = graph.graphConfigFromEnv();
  const client = cfg ? new graph.GraphClient(cfg) : null;
  return { graph: () => client };
}
