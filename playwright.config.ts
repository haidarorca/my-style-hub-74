import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config — E2E regression suite.
 * BASE_URL defaults to the dev server. Override for preview/published runs:
 *   BASE_URL=https://my-style-hub-74.lovable.app bun run test:e2e
 */
const BASE_URL = process.env.BASE_URL ?? "http://localhost:8080";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // tests share auth state — run serially for stability
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: "bun run dev",
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
