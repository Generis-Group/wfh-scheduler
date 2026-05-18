import { defineConfig, devices } from "@playwright/test";

const npmRunDev = process.env.npm_execpath
  ? `"${process.execPath}" "${process.env.npm_execpath}" run dev`
  : process.platform === "win32"
    ? "npm.cmd run dev"
    : "npm run dev";

export default defineConfig({
  testDir: "./test/e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry"
  },
  webServer: {
    command: npmRunDev,
    url: "http://127.0.0.1:3000",
    reuseExistingServer: true,
    timeout: 120_000
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], channel: "chrome" }
    }
  ]
});
