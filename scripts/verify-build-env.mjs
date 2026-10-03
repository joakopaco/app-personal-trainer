import { loadEnv } from "vite";
const env = { ...loadEnv("production", "apps/web", ""), ...process.env };
if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY)
  throw Error(
    "Configure the public Supabase URL/key before building. For local use run scripts/setup-local.mjs.",
  );
const url = new URL(env.VITE_SUPABASE_URL),
  key = env.VITE_SUPABASE_ANON_KEY;
if (key.startsWith("sb_secret_"))
  throw Error("A secret Supabase key must never enter the frontend.");
if (key.split(".").length === 3) {
  const payload = JSON.parse(Buffer.from(key.split(".")[1], "base64url"));
  if (payload.role !== "anon")
    throw Error("The frontend requires an anon/publishable key.");
}
if (env.VERCEL) {
  if (
    !env.VITE_TURNSTILE_SITE_KEY ||
    /^[123]x0{10}/.test(env.VITE_TURNSTILE_SITE_KEY)
  )
    throw Error(
      "A real Turnstile site key is required for public deployments; enable server-side CAPTCHA in Supabase too.",
    );
  if (
    url.protocol !== "https:" ||
    url.hostname !== env.PULSO_EXPECTED_SUPABASE_HOST
  )
    throw Error(
      "Vercel requires the explicitly approved Supabase hostname over HTTPS.",
    );
  if (!["staging", "production"].includes(env.PULSO_TARGET))
    throw Error("Set PULSO_TARGET to staging or production.");
  if (
    env.VERCEL_ENV === "preview" &&
    (!env.PULSO_PRODUCTION_SUPABASE_HOST ||
      url.hostname === env.PULSO_PRODUCTION_SUPABASE_HOST ||
      env.PULSO_TARGET === "production")
  )
    throw Error("Previews must be isolated from production.");
}
console.log("Public build configuration verified; no secret keys exposed.");
