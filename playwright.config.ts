import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "output/playwright/test-results",
  timeout: 90_000,
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "output/playwright/report" }]
  ],
  use: {
    // Keep Playwright auto-artifacts off and rely on manually captured trace.zip only.
    screenshot: "off",
    video: "off",
    trace: "off"
  },
  webServer: {
    command:
      "pnpm --filter @localterm/renderer exec vite preview --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    timeout: 120_000,
    reuseExistingServer: true
  }
});
