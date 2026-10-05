import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { adminClient, config } from "./cloud";
export function gymDocument(name = "Fuerza inicial") {
  return {
    schemaVersion: 1,
    name,
    weeks: Array.from({ length: 4 }, () => [
      {
        id: randomUUID(),
        name: "Día 1",
        blocks: [
          {
            id: randomUUID(),
            name: "Principal",
            type: "main",
            macroRest: 60,
            macroTarget: "series",
            exercises: [
              {
                id: randomUUID(),
                lineageId: randomUUID(),
                exerciseId: "goblet-squat",
                name: "Sentadilla goblet",
                group: "Cuádriceps",
                type: "load_reps",
                warmup: false,
                prescription: {
                  weight: 10,
                  sets: 2,
                  reps: 10,
                  durationSec: null,
                  microRest: 60,
                },
              },
            ],
          },
        ],
      },
    ]),
  };
}
export async function gymFixture() {
  const service = adminClient();
  const { data: gym, error } = await service
    .from("gyms")
    .insert({ name: "Gimnasio Horizonte" })
    .select()
    .single();
  if (error) throw error;
  const accounts: {
    email: string;
    password: string;
    userId: string;
    client: SupabaseClient;
  }[] = [];
  for (const role of ["admin", "member"] as const) {
    const email = `gym-ui-${randomUUID()}@example.test`,
      password = `Test!${randomUUID()}Aa1`;
    const { data, error } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { gym_account: true },
    });
    if (error) throw error;
    await service.from("gym_accounts").insert({
      user_id: data.user.id,
      gym_id: gym.id,
      role,
      name: role === "admin" ? "Gimnasio Horizonte" : "Alex García",
      email,
      must_change_password: false,
    });
    const client = createClient(config.url, config.anonKey, {
      auth: { persistSession: false },
    });
    await client.auth.signInWithPassword({ email, password });
    accounts.push({ email, password, userId: data.user.id, client });
  }
  const command = async (kind: string, payload: object) => {
    const { data, error } = await accounts[0].client.rpc("gym_command", {
      command: { operationId: randomUUID(), kind, payload },
    });
    if (error) throw error;
    return data;
  };
  const routine = await command("save_routine", {
    kind: "catalog",
    document: gymDocument(),
  });
  const published = await command("publish_routine", {
    id: routine.id,
    expectedRevision: 1,
  });
  return {
    gym,
    accounts,
    revisionId: published.publishedRevisionId,
    async cleanup() {
      await service.from("gym_sessions").delete().eq("gym_id", gym.id);
      await service.from("gyms").delete().eq("id", gym.id);
      for (const account of accounts)
        await service.auth.admin.deleteUser(account.userId);
    },
  };
}
