import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";

// UI journeys in both phone engines; API/security/load checks run in the base suite.
export default defineConfig({
  ...base,
  outputDir: ".local/playwright-audit",
  testIgnore: [],
  testMatch: [
    "final-audit-regressions.spec.ts",
    "mobile-ergonomics.spec.ts",
    "agenda-calendar.spec.ts",
    "exercise-favorites.spec.ts",
    "frontend-navigation.spec.ts",
    "gym-buttons.spec.ts",
    "gym-account-controls.spec.ts",
    "gym-parity.spec.ts",
    "gym-ergonomics.spec.ts",
    "gym-training-errors.spec.ts",
    "gym-draft-recovery.spec.ts",
    "routine-palette.spec.ts",
    "routine-activation-guidance.spec.ts",
    "student-draft-separation.spec.ts",
    "student-details.spec.ts",
    "visual-workflow.spec.ts",
  ],
  projects: [
    { name: "audit-webkit", use: { ...devices["iPhone 13"] } },
    { name: "audit-chromium", use: { ...devices["Pixel 7"] } },
  ],
});
