export interface Config {
  port: number;
  /** MCP serverining tashqi manzili (issuer), masalan https://mcp.jarvisgram.uz */
  mcpPublicUrl: string;
  /** MCP endpoint (resource) = mcpPublicUrl + /mcp */
  mcpResourceUrl: string;
  /** Veb-ilova manzili (OAuth rozilik sahifasi shu yerda) */
  webPublicUrl: string;
}

const trim = (s: string) => s.replace(/\/+$/, "");

export function makeConfig(env: { port?: number; mcpPublicUrl: string; webPublicUrl: string }): Config {
  const mcpPublicUrl = trim(env.mcpPublicUrl);
  return { port: env.port ?? 3001, mcpPublicUrl, mcpResourceUrl: `${mcpPublicUrl}/mcp`, webPublicUrl: trim(env.webPublicUrl) };
}

export function configFromEnv(): Config {
  const port = Number(process.env.PORT ?? 3001);
  return makeConfig({
    port,
    mcpPublicUrl: process.env.MCP_PUBLIC_URL ?? `http://localhost:${port}`,
    webPublicUrl: process.env.WEB_PUBLIC_URL ?? "http://localhost:3000",
  });
}
