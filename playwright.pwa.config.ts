import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/pwa",
  outputDir: "test-results-pwa",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:4176", trace: "retain-on-failure" },
  webServer: {
    command: "npm run preview --workspace apps/web -- --port 4176 --strictPort",
    url: "http://127.0.0.1:4176",
    reuseExistingServer: false,
  },
});
