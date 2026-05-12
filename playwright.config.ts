import { defineConfig, devices } from "@playwright/test";

const useManagedWebServer = process.env.PLAYWRIGHT_SKIP_WEB_SERVER !== "1";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  webServer: useManagedWebServer
    ? {
        command: "node ./tests/e2e/next-dev-server.mjs",
        url: "http://127.0.0.1:3000",
        reuseExistingServer: !process.env.CI,
        stdout: "ignore",
        stderr: "ignore",
        timeout: 120_000
      }
    : undefined,
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    },
    {
      name: "mobile-safari",
      testMatch: /responsive-smoke\.spec\.ts/,
      use: { ...devices["iPhone 13"] }
    }
  ]
});
