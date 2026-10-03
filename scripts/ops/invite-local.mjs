import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const email = process.argv[2];
if (!email || !/@pulso\.local$/.test(email))
  throw Error(
    "Usage: node scripts/ops/invite-local.mjs name@pulso.local (local test identities only)",
  );
const config = JSON.parse(readFileSync(".local/supabase.json"));
if (config.url !== "http://127.0.0.1:54341")
  throw Error("Local rehearsal only");
const client = createClient(config.url, config.serviceKey, {
  auth: { persistSession: false },
});
const { data, error } = await client.auth.admin.generateLink({
  type: "invite",
  email,
});
if (error)
  throw Error(
    "Could not generate invitation. Check whether the identity already exists.",
  );
mkdirSync(".local/invites", { recursive: true });
const file = ".local/invites/" + data.user.id + ".json";
writeFileSync(
  file,
  JSON.stringify(
    {
      email,
      url:
        "http://127.0.0.1:5173/auth/callback?type=invite&token_hash=" +
        data.properties.hashed_token,
    },
    null,
    2,
  ),
);
console.log(
  "Private, one-use local invitation saved to " + file + ". No email sent.",
);
