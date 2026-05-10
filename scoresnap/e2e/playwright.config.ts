import path from "node:path";

import { defineConfig } from "@playwright/test";

export default defineConfig({
  // Config lives in e2e/; specs are e2e/**/*.spec.ts
  testDir: ".",
  testMatch: "**/*.spec.ts",
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: "http://localhost:8081",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    viewport: { width: 390, height: 844 }, // iPhone 14 dimensions
  },
  webServer: {
    command: "npx expo start --web --port 8081",
    cwd: path.join(__dirname, ".."),
    port: 8081,
    timeout: 60000,
    reuseExistingServer: !process.env.CI,
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
