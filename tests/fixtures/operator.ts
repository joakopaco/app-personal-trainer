import { createClient } from "@supabase/supabase-js";
import { adminClient, config } from "./cloud";
export async function operatorFixture(initial = false) {
  const service = adminClient();
  const username = "Op" + crypto.randomUUID().replaceAll("-", "");
  const email = username.toLowerCase() + "@operator.invalid";
  const password = "Initial!" + crypto.randomUUID() + "Aa1";
  const made = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { platform_operator: true },
  });
  if (made.error) throw made.error;
  const userId = made.data.user.id;
  const inserted = await service
    .from("platform_operators")
    .insert({ user_id: userId, username, must_change_password: initial });
  if (inserted.error) {
    await service.auth.admin.deleteUser(userId);
    throw inserted.error;
  }
  const client = createClient(config.url, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await client.auth.signInWithPassword({ email, password });
  return {
    client,
    userId,
    username,
    email,
    password,
    cleanup: () => service.auth.admin.deleteUser(userId),
  };
}
