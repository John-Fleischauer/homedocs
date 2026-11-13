import { defineConfig, devices } from "@playwright/test";
import { AUTH_FILE, E2E_PORT } from "./e2e/world";

/*
 * Browser tests: the app as the family uses it — on a phone — against a fresh
 * database (e2e/serve.ts). `pnpm e2e`. The domain rules stay in Vitest; these
 * walk the journeys homedocs exists for, check pages for accessibility, and
 * check the shared guide from the outside.
 */
export default defineConfig({
  testDir: "e2e",
  // One server and one database: the journeys build on each other's data.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  // `next dev` compiles a page the first time it is asked for.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://localhost:${E2E_PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /setup\.ts/ },
    {
      name: "phone",
      use: { ...devices["Pixel 7"], storageState: AUTH_FILE },
      dependencies: ["setup"],
      testIgnore: /phone\.spec\.ts/,
    },
    {
      // The standards' phone check (design.md): WebKit at 360px, because Chromium misses
      // layout differences WebKit shares with Safari (a native date field's width). After
      // the journeys, so the screens have something in them. Playwright's WebKit is not
      // iOS Safari: iOS's own controls still need a look on a phone.
      name: "webkit-phone",
      use: {
        ...devices["iPhone 13"],
        viewport: { width: 360, height: 780 },
        storageState: AUTH_FILE,
      },
      dependencies: ["phone"],
      testMatch: /phone\.spec\.ts/,
    },
  ],
  webServer: {
    command: "pnpm tsx e2e/serve.ts",
    url: `http://localhost:${E2E_PORT}/api/health`,
    timeout: 240_000,
    reuseExistingServer: false,
    stdout: process.env.E2E_SERVER_LOG ? "pipe" : "ignore",
    stderr: "pipe",
  },
});
