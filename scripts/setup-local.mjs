import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
const status = JSON.parse(
  execFileSync(
    process.execPath,
    ["node_modules/supabase/dist/supabase.js", "status", "-o", "json"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  ),
);
const url = status.API_URL;
if (new URL(url).hostname !== "127.0.0.1")
  throw Error("Only the local Supabase instance is permitted");
const admin = createClient(url, status.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const credentials = [];
const { data: existing, error } = await admin.auth.admin.listUsers();
if (error) throw error;
for (const email of ["entrenador@pulso.local", "otro@pulso.local"]) {
  const password = randomBytes(20).toString("base64url") + "aA1!";
  const old = existing.users.find((u) => u.email === email);
  const result = old
    ? await admin.auth.admin.updateUserById(old.id, {
        password,
        email_confirm: true,
      })
    : await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
  if (result.error) throw result.error;
  credentials.push({ email, password, userId: result.data.user.id });
}
mkdirSync(".local", { recursive: true });
writeFileSync(".local/accounts.json", JSON.stringify(credentials, null, 2));
writeFileSync(
  ".local/supabase.json",
  JSON.stringify({
    url,
    anonKey: status.ANON_KEY,
    serviceKey: status.SERVICE_ROLE_KEY,
  }),
);
writeFileSync(
  "apps/web/.env.local",
  `VITE_SUPABASE_URL=${url}\nVITE_SUPABASE_ANON_KEY=${status.ANON_KEY}\n`,
);
console.log(
  "Local accounts ready. Credentials: .local/accounts.json (git ignored). Public web configuration written.",
);
