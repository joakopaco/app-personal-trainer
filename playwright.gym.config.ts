import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  outputDir: ".local/playwright-gym",
  testIgnore: [],
  testMatch: [
    "gym-member-templates.spec.ts",
    "gym-responsive.spec.ts",
    "gym-buttons.spec.ts",
    "gym-account-controls.spec.ts",
    "gym-training-errors.spec.ts",
    "gym-parity.spec.ts",
    "gym-draft-recovery.spec.ts",
    "gym-ergonomics.spec.ts",
  ],
  projects: [
    { name: "gym-webkit", use: { ...devices["iPhone 13"] } },
    { name: "gym-chromium", use: { ...devices["Pixel 7"] } },
  ],
});
