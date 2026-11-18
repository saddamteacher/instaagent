import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** Test bazasiga migratsiyalarni qo'llaydi. */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://jarvis:jarvis@localhost:5432/jarvisgram_test";
  execSync("pnpm exec prisma migrate deploy", {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
}
