import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  testMatch: ["platform-portal.spec.ts", "gym-account-controls.spec.ts"],
  projects: [{ name: "webkit", use: { ...devices["iPhone 13"] } }],
});
