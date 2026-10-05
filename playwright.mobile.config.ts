import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: "mobile-ergonomics.spec.ts",
  projects: [
    { name: "webkit-phone", use: { ...devices["iPhone 13"] } },
    { name: "chromium-phone", use: { ...devices["Pixel 7"] } },
  ],
});
