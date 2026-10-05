import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: ["gym-responsive.spec.ts"],
  projects: [
    { name: "gym-webkit", use: { ...devices["iPhone 13"] } },
    { name: "gym-chromium", use: { ...devices["Pixel 7"] } },
  ],
});
