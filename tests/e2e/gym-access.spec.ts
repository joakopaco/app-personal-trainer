import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { adminClient, accountClient, config } from "../fixtures/cloud";

test("personal trainer remains a trainer and cannot use gym commands", async () => {
  const { client, workspaceId } = await accountClient();
  const access = await client.rpc("gym_access");
  expect(access.error).toBeNull();
  expect(access.data.mode).toBe("trainer");
  const command = await client.rpc("gym_command", {
    command: { operationId: randomUUID(), kind: "save_routine", payload: {} },
  });
  expect(command.error?.code).toBe("42501");
  const workspace = await client.rpc("ensure_workspace");
  expect(workspace.error).toBeNull();
  expect(workspace.data.id).toBe(workspaceId);
});

test("gym accounts cannot bypass first login, suspension or tenant isolation", async () => {
  const admin = adminClient();
  const gymIds: string[] = [];
  const users: string[] = [];
  try {
    const clients = [];
    for (let i = 0; i < 3; i++) {
      const email = `gym-test-${randomUUID()}@example.test`;
      const password = `Test!${randomUUID()}Aa1`;
      const user = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { gym_account: true },
      });
      if (user.error) throw user.error;
      users.push(user.data.user.id);
      if (i < 2) {
        const gym = await admin
          .from("gyms")
          .insert({ name: `Gym ${i}` })
          .select()
          .single();
        if (gym.error) throw gym.error;
        gymIds.push(gym.data.id);
      }
      const inserted = await admin.from("gym_accounts").insert({
        user_id: user.data.user.id,
        gym_id: gymIds[i === 0 ? 0 : 1],
        role: i === 2 ? "member" : "admin",
        name: `Persona ${i}`,
        email,
        must_change_password: i === 2,
      });
      if (inserted.error) throw inserted.error;
      const client = createClient(config.url, config.anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const login = await client.auth.signInWithPassword({ email, password });
      if (login.error) throw login.error;
      clients.push(client);
    }
    for (const client of clients)
      expect((await client.rpc("ensure_workspace")).error?.code).toBe("42501");
    expect((await clients[2].rpc("gym_access")).data.mustChangePassword).toBe(
      true,
    );
    expect((await clients[2].from("gyms").select()).data).toEqual([]);
    expect(
      (await clients[0].from("gyms").select()).data?.map((g) => g.id),
    ).toEqual([gymIds[0]]);
    expect(
      (await clients[0].from("gym_accounts").select("user_id")).data?.map(
        (a) => a.user_id,
      ),
    ).toEqual([users[0]]);
    expect(
      (
        await clients[0].rpc("gym_command", {
          command: {
            operationId: randomUUID(),
            kind: "set_member_active",
            payload: { userId: users[2], active: false },
          },
        })
      ).error?.code,
    ).toBe("42501");
    expect(
      (
        await clients[2]
          .from("gym_accounts")
          .update({ must_change_password: false })
          .eq("user_id", users[2])
      ).error,
    ).not.toBeNull();
    await admin
      .from("gym_accounts")
      .update({ must_change_password: false })
      .eq("user_id", users[2]);
    expect(
      (await clients[2].from("gym_accounts").select("user_id")).data?.map(
        (a) => a.user_id,
      ),
    ).toEqual([users[2]]);
    await admin.from("gyms").update({ active: false }).eq("id", gymIds[1]);
    expect((await clients[2].rpc("gym_access")).data.blocked).toBe(true);
    expect((await clients[2].from("gyms").select()).data).toEqual([]);
    expect(
      (
        await clients[2].rpc("gym_command", {
          command: {
            operationId: randomUUID(),
            kind: "select_routine",
            payload: {},
          },
        })
      ).error?.code,
    ).toBe("42501");
    expect(
      (await admin.from("workspaces").select().in("owner_user_id", users)).data,
    ).toEqual([]);
  } finally {
    for (const id of gymIds) await admin.from("gyms").delete().eq("id", id);
    for (const id of users) await admin.auth.admin.deleteUser(id);
  }
});
