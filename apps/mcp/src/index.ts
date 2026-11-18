import { createDb } from "@jarvisgram/db";
import { configFromEnv } from "./config";
import { startScheduler } from "./scheduler";
import { createApp, defaultDeps } from "./server";

const config = configFromEnv();
const db = createDb();
const deps = defaultDeps();
const app = createApp(db, config, deps);
const stopScheduler = process.env.SCHEDULER_DISABLED === "1" ? () => {} : startScheduler(db, deps);

const server = app.listen(config.port, () => {
  console.log(`Jarvisgram MCP: ${config.mcpResourceUrl} (port ${config.port})`);
});

const shutdown = () => {
  stopScheduler();
  server.close(() => void db.$disconnect().finally(() => process.exit(0)));
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
