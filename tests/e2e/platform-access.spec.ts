import { test, expect } from "@playwright/test";
import { accountClient, adminClient, config } from "../fixtures/cloud";
import { operatorFixture } from "../fixtures/operator";

test("operator identities are exclusive and first password change revokes the old session", async () => {
  const customer = await accountClient();
  const service = adminClient();
  const promoted = await service
    .from("platform_operators")
    .insert({ user_id: customer.userId, username: "NotAnOperator" });
  // Clean up even when running red against the old server.
  if (!promoted.error)
    await service
      .from("platform_operators")
      .delete()
      .eq("user_id", customer.userId);
  expect(promoted.error).toBeTruthy();
  const op = await operatorFixture(true);
  try {
    expect((await op.client.rpc("ensure_workspace")).error).toBeTruthy();
    expect((await op.client.rpc("is_platform_operator")).data).toBe(false);
    const access = await op.client.rpc("platform_access");
    expect(access.error).toBeNull();
    expect(access.data.mustChangePassword).toBe(true);
    expect(
      (
        await op.client.rpc("platform_login_target", {
          login_name: op.username,
        })
      ).error,
    ).toBeTruthy();
    const next = "Changed!" + crypto.randomUUID() + "Aa1";
    const changed = await op.client.auth.updateUser({
      password: next,
      current_password: op.password,
    });
    expect(changed.error).toBeNull();
    expect((await op.client.rpc("is_platform_operator")).data).toBe(false);
    await op.client.auth.signInWithPassword({
      email: op.email,
      password: next,
    });
    expect((await op.client.rpc("is_platform_operator")).data).toBe(true);
    expect(
      (await service.from("workspaces").insert({ owner_user_id: op.userId }))
        .error,
    ).toBeTruthy();
    await service
      .from("platform_operators")
      .update({ active: false })
      .eq("user_id", op.userId);
    expect((await op.client.rpc("is_platform_operator")).data).toBe(false);
  } finally {
    await op.cleanup();
  }
});

test("username login hides identity details and rate limits repeated attempts", async () => {
  const op = await operatorFixture();
  try {
    const request = async (username: string, password: string) => {
      const r = await fetch(config.url + "/functions/v1/platform-login", {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: config.anonKey },
        body: JSON.stringify({ username, password }),
      });
      return { status: r.status, body: await r.json() };
    };
    const wrong = await request(op.username, "Wrong!123456");
    const unknown = await request("DoesNotExist", "Wrong!123456");
    expect(wrong.status).toBe(401);
    expect(unknown).toEqual(wrong);
    const good = await request(
      " " + op.username.toLowerCase() + " ",
      op.password,
    );
    expect(good.status).toBe(200);
    expect(good.body.access_token).toBeTruthy();
    expect(good.body.email).toBeUndefined();
    for (let i = 0; i < 10; i++) await request(op.username, "Wrong!123456");
    expect((await request(op.username, op.password)).status).toBe(429);
  } finally {
    await op.cleanup();
  }
});
