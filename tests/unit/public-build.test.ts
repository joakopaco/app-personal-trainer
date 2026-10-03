import { test, expect } from "vitest";
import { spawnSync } from "node:child_process";

const valid = {
  VERCEL: "1",
  VERCEL_ENV: "production",
  PULSO_TARGET: "production",
  VITE_SUPABASE_URL: "https://pulso-example.supabase.co",
  PULSO_EXPECTED_SUPABASE_HOST: "pulso-example.supabase.co",
  PULSO_PRODUCTION_SUPABASE_HOST: "pulso-example.supabase.co",
  VITE_SUPABASE_ANON_KEY: "sb_publishable_not-a-real-key",
  VITE_TURNSTILE_SITE_KEY: "not-a-real-site-key-for-config-test",
};
function check(overrides: Record<string, string>) {
  return spawnSync(process.execPath, ["scripts/verify-build-env.mjs"], {
    env: { ...process.env, ...valid, ...overrides },
    encoding: "utf8",
  }).status;
}
test("public builds require bot protection and never accept a secret frontend key", () => {
  expect(check({})).toBe(0);
  expect(check({ VITE_TURNSTILE_SITE_KEY: "" })).not.toBe(0);
  expect(
    check({ VITE_TURNSTILE_SITE_KEY: "1x00000000000000000000AA" }),
  ).not.toBe(0);
  expect(
    check({ VITE_SUPABASE_ANON_KEY: "sb_secret_should-never-ship" }),
  ).not.toBe(0);
});
test("a preview cannot connect to the production database", () => {
  expect(check({ VERCEL_ENV: "preview" })).not.toBe(0);
  expect(check({ VERCEL_ENV: "preview", PULSO_TARGET: "staging" })).not.toBe(0);
  expect(
    check({
      VERCEL_ENV: "preview",
      PULSO_TARGET: "staging",
      VITE_SUPABASE_URL: "https://pulso-stage.supabase.co",
      PULSO_EXPECTED_SUPABASE_HOST: "pulso-stage.supabase.co",
    }),
  ).toBe(0);
});
