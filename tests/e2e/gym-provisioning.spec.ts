import { operatorFixture } from "../fixtures/operator";
import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { adminClient, config } from "../fixtures/cloud";

async function invoke(client: SupabaseClient, body: object) {
  const {
    data: { session },
  } = await client.auth.getSession();
  const response = await fetch(config.url + "/functions/v1/gym-accounts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: config.anonKey,
      Authorization: `Bearer ${session!.access_token}`,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text.startsWith("{") ? JSON.parse(text) : { error: text },
  };
}
test("provisioning, first login, member creation and reset stay scoped", async () => {
  const operator = await operatorFixture();
  const admin = adminClient();
  const ids: string[] = [];
  let gymId: string | undefined;
  try {
    const request = {
      action: "create_gym",
      operationId: randomUUID(),
      name: "Gimnasio prueba",
      email: `gym-${randomUUID()}@example.test`,
    };
    const created = await invoke(operator.client, request);
    expect(created.status).toBe(200);
    expect(created.body.temporaryPassword).toMatch(/.{12,}/);
    ids.push(created.body.userId);
    gymId = created.body.gymId;
    const duplicate = await invoke(operator.client, request);
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.userId).toBe(ids[0]);
    expect(duplicate.body.temporaryPassword).toBeUndefined();
    const gym = createClient(config.url, config.anonKey, {
      auth: { persistSession: false },
    });
    expect(
      (
        await gym.auth.signInWithPassword({
          email: request.email,
          password: created.body.temporaryPassword,
        })
      ).error,
    ).toBeNull();
    expect((await gym.rpc("gym_access")).data.mustChangePassword).toBe(true);
    expect(
      (
        await invoke(gym, {
          action: "create_member",
          operationId: randomUUID(),
          name: "No permitido",
          email: "no@example.test",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await invoke(gym, {
          action: "change_password",
          password: created.body.temporaryPassword,
        })
      ).status,
    ).toBe(400);
    const gymPassword = `Changed!${randomUUID()}Aa1`;
    const changed = await invoke(gym, {
      action: "change_password",
      password: gymPassword,
    });
    expect(changed.status).toBe(200);
    expect((await gym.rpc("gym_access")).data.blocked).toBe(true);
    expect(
      (
        await gym.auth.signInWithPassword({
          email: request.email,
          password: gymPassword,
        })
      ).error,
    ).toBeNull();
    expect((await gym.rpc("gym_access")).data.mustChangePassword).toBe(false);
    expect(
      (await invoke(gym, { ...request, operationId: randomUUID() })).status,
    ).toBe(403);
    const memberRequest = {
      action: "create_member",
      operationId: randomUUID(),
      name: "Entrenado prueba",
      email: `member-${randomUUID()}@example.test`,
    };
    const memberResult = await invoke(gym, memberRequest);
    expect(memberResult.status).toBe(200);
    ids.push(memberResult.body.userId);
    const member = createClient(config.url, config.anonKey, {
      auth: { persistSession: false },
    });
    await member.auth.signInWithPassword({
      email: memberRequest.email,
      password: memberResult.body.temporaryPassword,
    });
    const memberPassword = `Changed!${randomUUID()}Aa1`;
    expect(
      (
        await invoke(member, {
          action: "change_password",
          password: memberPassword,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await member.auth.signInWithPassword({
          email: memberRequest.email,
          password: memberPassword,
        })
      ).error,
    ).toBeNull();
    expect(
      (await invoke(member, { ...memberRequest, operationId: randomUUID() }))
        .status,
    ).toBe(403);
    const reset = await invoke(gym, {
      action: "reset_password",
      userId: ids[1],
    });
    expect(reset.status).toBe(200);
    expect((await member.rpc("gym_access")).data.blocked).toBe(true);
    await member.auth.signInWithPassword({
      email: memberRequest.email,
      password: reset.body.temporaryPassword,
    });
    expect((await member.rpc("gym_access")).data.mustChangePassword).toBe(true);
  } finally {
    await operator.cleanup();
    if (gymId) await admin.from("gyms").delete().eq("id", gymId);
    for (const id of ids) await admin.auth.admin.deleteUser(id);
  }
});
