import { createDb } from "@jarvisgram/db";
import { configFromEnv } from "./config";
import { createApp } from "./server";

const config = configFromEnv();
const db = createDb();
const app = createApp(db, config);

const server = app.listen(config.port, () => {
  console.log(`Jarvisgram MCP: ${config.mcpResourceUrl} (port ${config.port})`);
});

const shutdown = () => {
  server.close(() => void db.$disconnect().finally(() => process.exit(0)));
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
