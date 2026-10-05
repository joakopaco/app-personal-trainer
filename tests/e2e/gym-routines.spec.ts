import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { config, adminClient } from "../fixtures/cloud";

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

test("catalog, personalized and one own routine preserve session snapshots and reject stale edits", async () => {
  const admin = adminClient();
  const users: string[] = [];
  const { data: gym, error } = await admin
    .from("gyms")
    .insert({ name: "Rutinas prueba" })
    .select()
    .single();
  if (error) throw error;
  try {
    const clients: SupabaseClient[] = [];
    for (const role of ["admin", "member", "member"]) {
      const email = `routine-${randomUUID()}@example.test`,
        password = `Test!${randomUUID()}Aa1`;
      const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { gym_account: true },
      });
      if (created.error) throw created.error;
      users.push(created.data.user.id);
      const inserted = await admin.from("gym_accounts").insert({
        user_id: created.data.user.id,
        gym_id: gym.id,
        role,
        name: role,
        email,
        must_change_password: false,
      });
      if (inserted.error) throw inserted.error;
      const client = createClient(config.url, config.anonKey, {
        auth: { persistSession: false },
      });
      await client.auth.signInWithPassword({ email, password });
      clients.push(client);
    }
    const run = (
      index: number,
      kind: string,
      payload: object,
      operationId = randomUUID(),
    ) =>
      clients[index].rpc("gym_command", {
        command: { operationId, kind, payload },
      });
    const doc = gymDocument();
    const saved = await run(0, "save_routine", {
      kind: "catalog",
      document: doc,
    });
    expect(saved.error).toBeNull();
    const id = saved.data.id;
    expect((await clients[1].from("gym_routines").select("id")).data).toEqual(
      [],
    );
    const published = await run(0, "publish_routine", {
      id,
      expectedRevision: 1,
    });
    expect(published.error).toBeNull();
    expect(
      (await clients[1].rpc("gym_edit_routine", { routine_id: id })).error
        ?.code,
    ).toBe("42501");
    expect(
      (await clients[1].from("gym_routines").select("draft")).error,
    ).not.toBeNull();
    expect(
      (
        await run(1, "select_routine", {
          revisionId: published.data.publishedRevisionId,
        })
      ).error,
    ).toBeNull();
    const op = randomUUID();
    const started = await run(1, "start_session", { week: 0, day: 0 }, op);
    expect(started.error).toBeNull();
    expect(
      (await run(1, "start_session", { week: 0, day: 0 }, op)).data.id,
    ).toBe(started.data.id);
    expect((await run(1, "start_session", { week: 0, day: 0 })).data.id).toBe(
      started.data.id,
    );
    doc.weeks[0][0].blocks[0].exercises[0].prescription.weight = 20;
    expect(
      (await run(0, "save_routine", { id, expectedRevision: 2, document: doc }))
        .error,
    ).toBeNull();
    expect(
      (await run(0, "save_routine", { id, expectedRevision: 2, document: doc }))
        .error?.code,
    ).toBe("40001");
    expect(
      (
        await clients[0]
          .from("gym_routines")
          .select("has_draft")
          .eq("id", id)
          .single()
      ).data?.has_draft,
    ).toBe(true);
    expect(
      (await run(0, "publish_routine", { id, expectedRevision: 3 })).error,
    ).toBeNull();
    const open = await clients[1].from("gym_sessions").select().single();
    expect(open.data.day.blocks[0].exercises[0].prescription.weight).toBe(10);
    const results = [
      {
        positionId: doc.weeks[0][0].blocks[0].exercises[0].id,
        skipped: false,
        sets: [{ weight: 12, reps: 10, durationSec: null, confirmed: true }],
      },
    ];
    expect(
      (
        await run(2, "save_session", {
          id: open.data.id,
          expectedRevision: 1,
          results,
        })
      ).error?.code,
    ).toBe("42501");
    expect(
      (
        await run(1, "finish_session", {
          id: open.data.id,
          expectedRevision: 1,
          results,
        })
      ).error,
    ).toBeNull();
    const own = await Promise.all([
      run(1, "save_routine", {
        kind: "own",
        document: gymDocument("Mi rutina"),
      }),
      run(1, "save_routine", { kind: "own", document: gymDocument("Otra") }),
    ]);
    expect(own.filter((x) => !x.error)).toHaveLength(1);
    expect(own.filter((x) => x.error?.code === "23505")).toHaveLength(1);
    const personal = await run(0, "save_routine", {
      kind: "personal",
      memberId: users[1],
      document: gymDocument("Personalizada"),
    });
    expect(personal.error).toBeNull();
    expect(
      (
        await run(0, "publish_routine", {
          id: personal.data.id,
          expectedRevision: 1,
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await clients[2]
          .from("gym_routines")
          .select("id")
          .eq("id", personal.data.id)
      ).data,
    ).toEqual([]);
    expect(
      (await run(1, "save_routine", { kind: "catalog", document: doc })).error
        ?.code,
    ).toBe("42501");
  } finally {
    await admin.from("gym_sessions").delete().eq("gym_id", gym.id);
    await admin.from("gyms").delete().eq("id", gym.id);
    for (const id of users) await admin.auth.admin.deleteUser(id);
  }
});
