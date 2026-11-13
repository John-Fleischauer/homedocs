import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // One Postgres container for the whole run, with the real migrations applied.
    globalSetup: ["test/setup.ts"],
    env: {
      // Test fixtures; they match no deployment.
      SESSION_SECRET:
        "test-only-session-secret-not-used-anywhere-real-0123456789",
      INTEGRATIONS_KEY:
        "test-only-integrations-key-not-used-anywhere-real-012345",
      PUBLIC_BASE_URL: "https://homedocs.example.test",
    },
    // A cold image pull is slower than the defaults allow.
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
  resolve: {
    alias: { "@": new URL("./", import.meta.url).pathname },
  },
});
