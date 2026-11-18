import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: { DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://jarvis:jarvis@localhost:5432/jarvisgram_test" },
    globalSetup: ["../../packages/db/test/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 30000,
  },
});
