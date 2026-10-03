import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { adminClient, config, command, execute } from "../fixtures/cloud";
import { routineFixture } from "../fixtures/routine";
test("local pilot load: five trainers, 500 students, two clients each and 25 open sessions", async () => {
  test.setTimeout(180000);
  const users: string[] = [],
    times: number[] = [];
  const start = Date.now();
  let sessions = 0;
  try {
    for (let trainer = 0; trainer < 5; trainer++) {
      const email = "pilot-" + crypto.randomUUID() + "@pulso.local",
        password = randomBytes(24).toString("base64url") + "Aa1!";
      const made = await adminClient().auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { fixture: "pulso-pilot-load" },
      });
      if (made.error) throw made.error;
      users.push(made.data.user.id);
      const clients = await Promise.all(
        [0, 1].map(async () => {
          const c = createClient(config.url, config.anonKey, {
            auth: { persistSession: false, autoRefreshToken: false },
          });
          const signed = await c.auth.signInWithPassword({ email, password });
          if (signed.error) throw signed.error;
          return c;
        }),
      );
      const ws = await clients[0].rpc("ensure_workspace");
      if (ws.error) throw ws.error;
      const workspace = ws.data.id as string;
      const ids: string[] = [];
      for (let group = 0; group < 10; group++)
        await Promise.all(
          Array.from({ length: 10 }, async (_, n) => {
            const id = crypto.randomUUID();
            const at = performance.now();
            const r = await execute(
              clients[n % 2],
              command(workspace, id, "create_student", {
                name: "Piloto " + trainer + " · " + (group * 10 + n),
              }),
            );
            expect(r.status).toBe("applied");
            times.push(performance.now() - at);
            ids.push(id);
          }),
        );
      for (let n = 0; n < 5; n++) {
        const student = ids[n],
          doc = routineFixture(),
          draftId = crypto.randomUUID();
        const save = await execute(
          clients[0],
          command(
            workspace,
            student,
            "save_draft",
            {
              draftId,
              expectedDraftRevision: 0,
              baseRoutineRevisionId: null,
              document: doc,
            },
            1,
          ),
        );
        expect(save.status).toBe("applied");
        const published = await execute(
          clients[0],
          command(
            workspace,
            student,
            "publish_routine",
            {
              draftId,
              expectedDraftRevision: 1,
              baseRoutineRevisionId: null,
              targetMonth: new Date().toISOString().slice(0, 7),
            },
            save.revision,
          ),
        );
        expect(published.status).toBe("applied");
        const payload = {
          sessionId: crypto.randomUUID(),
          periodId: published.patch.period.id,
          routineRevisionId: published.patch.routine.id,
          dayId: doc.weeks[0][0].id,
          week: 1,
          date: new Date().toISOString().slice(0, 10),
          time: "18:00",
          timezone: "America/Argentina/Buenos_Aires",
        };
        const race = await Promise.all(
          clients.map((c) =>
            execute(
              c,
              command(
                workspace,
                student,
                "start_session",
                { ...payload, sessionId: crypto.randomUUID() },
                published.revision,
              ),
            ),
          ),
        );
        expect(race.map((r) => r.status).sort()).toEqual([
          "applied",
          "conflict",
        ]);
        sessions++;
      }
      for (const c of clients) {
        const own = await c.from("students").select("id,workspace_id");
        expect(own.data).toHaveLength(100);
        expect(own.data?.every((s) => s.workspace_id === workspace)).toBe(true);
        const active = await c
          .from("sessions")
          .select("id")
          .eq("status", "open");
        expect(active.data).toHaveLength(5);
      }
    }
    times.sort((a, b) => a - b);
    const evidence = {
      trainers: 5,
      students: 500,
      openSessions: sessions,
      clients: 10,
      createStudentP95Ms: Math.round(times[Math.floor(times.length * 0.95)]),
      elapsedSeconds: (Date.now() - start) / 1000,
      environment: "Local Docker; not a cloud latency estimate",
      verifiedAt: new Date().toISOString(),
    };
    writeFileSync(
      ".local/pilot-load-evidence.json",
      JSON.stringify(evidence, null, 2),
    );
    expect(sessions).toBe(25);
  } finally {
    for (const user of users) {
      const cleared = await adminClient()
        .from("workspaces")
        .delete()
        .eq("owner_user_id", user);
      if (cleared.error) throw cleared.error;
      const result = await adminClient().auth.admin.deleteUser(user);
      if (result.error) throw result.error;
    }
  }
});
