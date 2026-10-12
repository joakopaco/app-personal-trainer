import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { prepared } from "../fixtures/prepared";
import { routineFixture } from "../fixtures/routine";
import { command, execute, dropFixture, accounts } from "../fixtures/cloud";

test("closing carries actual weights and reps to the same routine and replays only once", async () => {
  const doc = routineFixture();
  for (const week of doc.weeks) {
    week[0].blocks[0].exercises[0].prescription.weight = 25;
    week[0].blocks[0].exercises[0].lineageId = crypto.randomUUID();
  }
  const a = await prepared(doc);
  let revision = a.snapshot.revision;
  const session = a.snapshot.sessions[0],
    item = session.items[0];
  const run = async (kind: string, payload: unknown) => {
    const c = command(a.workspaceId, a.studentId, kind, payload, revision);
    const result = await execute(a.client, c);
    expect(result.status, JSON.stringify(result)).toBe("applied");
    revision = result.revision;
    return { result, c };
  };
  try {
    for (const set of item.sets) {
      const { result } = await run("record_set", {
        sessionId: session.id,
        itemId: item.id,
        setId: set.id,
        ordinal: set.ordinal,
        state: "done",
        weight: 50,
        reps: 6,
        durationSec: null,
      });
      expect(result.patch.routine.id).toBe(a.snapshot.routine.id);
    }
    const { result: closed, c } = await run("finish_session", {
      sessionId: session.id,
      quickConfirmItemIds: [],
      allowEmpty: false,
    });
    expect(closed.patch.period.id).toBe(a.snapshot.period.id);
    expect(closed.patch.routine.id).not.toBe(a.snapshot.routine.id);
    for (const week of closed.patch.routine.document.weeks)
      expect(week[0].blocks[0].exercises[0].prescription).toMatchObject({
        weight: 50,
        reps: 6,
        sets: 2,
      });
    const original = await a.client
      .from("routine_revisions")
      .select("document")
      .eq("id", a.snapshot.routine.id)
      .single();
    expect(original.error).toBeNull();
    expect(original.data!.document).toEqual(doc);
    expect((await execute(a.client, c)).status).toBe("duplicate");
    const versions = await a.client
      .from("routine_revisions")
      .select("id")
      .eq("student_id", a.studentId);
    expect(versions.error).toBeNull();
    expect(versions.data).toHaveLength(2);
    const { result: next } = await run("start_session", {
      sessionId: crypto.randomUUID(),
      periodId: closed.patch.period.id,
      routineRevisionId: closed.patch.routine.id,
      dayId: doc.weeks[1][0].id,
      week: 2,
      date: session.date,
      time: "19:00",
      timezone: "America/Argentina/Buenos_Aires",
    });
    expect(
      next.patch.sessions[0].items[0].sets.map(
        (s: { weight: number; reps: number }) => [s.weight, s.reps],
      ),
    ).toEqual([
      [50, 6],
      [50, 6],
    ]);
  } finally {
    await dropFixture(a.studentId);
  }
});

for (const type of ["reps", "time", "legacy"] as const) {
  test(`automatic versions preserve ${type} results and leave earlier weeks untouched`, async () => {
    const doc = routineFixture();
    for (const week of doc.weeks) {
      const exercise = week[0].blocks[0].exercises[0];
      exercise.type = type === "legacy" ? "load_reps" : type;
      Object.assign(exercise.prescription, {
        sets: type === "legacy" ? 5 : 2,
        weight: type === "legacy" ? 20 : null,
        reps: type === "time" ? null : 10,
        durationSec: type === "time" ? 60 : null,
      });
    }
    const a = await prepared(doc);
    let revision = a.snapshot.revision;
    async function run(kind: string, payload: unknown) {
      const result = await execute(
        a.client,
        command(a.workspaceId, a.studentId, kind, payload, revision),
      );
      expect(result.status, JSON.stringify(result)).toBe("applied");
      revision = result.revision;
      return result;
    }
    try {
      const initial = a.snapshot.sessions[0];
      await run("finish_session", {
        sessionId: initial.id,
        quickConfirmItemIds: initial.items.map((i: { id: string }) => i.id),
        allowEmpty: false,
      });
      const started = await run("start_session", {
        sessionId: crypto.randomUUID(),
        periodId: a.snapshot.period.id,
        routineRevisionId: a.snapshot.routine.id,
        dayId: doc.weeks[1][0].id,
        week: 2,
        date: initial.date,
        time: "19:00",
        timezone: "America/Argentina/Buenos_Aires",
      });
      const session = started.patch.sessions[0],
        item = session.items[0];
      for (const set of item.sets)
        await run("record_set", {
          sessionId: session.id,
          itemId: item.id,
          setId: set.id,
          ordinal: set.ordinal,
          state: "done",
          weight: type === "legacy" ? 40 + set.ordinal : null,
          reps: type === "time" ? null : 12 - set.ordinal,
          durationSec: type === "time" ? 60 + 30 * set.ordinal : null,
        });
      const closed = await run("finish_session", {
        sessionId: session.id,
        quickConfirmItemIds: [],
        allowEmpty: false,
      });
      expect(closed.patch.routine.document.weeks[0]).toEqual(doc.weeks[0]);
      const rx =
        closed.patch.routine.document.weeks[3][0].blocks[0].exercises[0]
          .prescription;
      if (type === "time") expect(rx.durationSec).toBe(120);
      else
        expect(rx.progression).toEqual(
          item.sets.map((s: { ordinal: number }) => ({
            weight: type === "legacy" ? 40 + s.ordinal : null,
            reps: 12 - s.ordinal,
          })),
        );
      const next = await run("start_session", {
        sessionId: crypto.randomUUID(),
        periodId: closed.patch.period.id,
        routineRevisionId: closed.patch.routine.id,
        dayId: doc.weeks[2][0].id,
        week: 3,
        date: initial.date,
        time: "20:00",
        timezone: "America/Argentina/Buenos_Aires",
      });
      expect(next.patch.sessions[0].items[0].sets[0]).toMatchObject(
        type === "time"
          ? { duration_sec: 120 }
          : { weight: type === "legacy" ? 41 : null, reps: 11 },
      );
    } finally {
      await dropFixture(a.studentId);
    }
  });
}

test("mobile close survives a lost reply and exposes old and new versions inside one routine", async ({
  page,
}) => {
  // Reloading during a request can leave the cross-tab lease alive for 30 s.
  // Recovery must retain the operation until that lease safely expires.
  test.setTimeout(60000);
  const doc = routineFixture();
  for (const week of doc.weeks)
    week[0].blocks[0].exercises[0].prescription.weight = 25;
  const a = await prepared(doc);
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(accounts[0].email);
    await page
      .getByLabel("Contraseña", { exact: true })
      .fill(accounts[0].password);
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await expect(page.getByRole("navigation")).toBeVisible();
    await page.goto(`/entrenar/${a.studentId}`);
    for (const n of [1, 2]) {
      await page.getByLabel(`Peso serie ${n}`, { exact: true }).fill("50");
      await page.getByLabel(`Reps serie ${n}`, { exact: true }).fill("6");
      await page
        .getByRole("button", { name: `Registrar serie ${n}`, exact: true })
        .click();
    }
    await expect(page.getByText("Guardado", { exact: true })).toBeVisible();
    const before = await a.client
      .from("routine_revisions")
      .select("id")
      .eq("student_id", a.studentId);
    expect(before.data).toHaveLength(1);
    let dropping = false,
      dropped = false;
    await page.route("**/rest/v1/rpc/apply_training_command", async (route) => {
      if (
        route.request().postDataJSON().command.kind !== "finish_session" ||
        dropping
      )
        return route.continue();
      dropping = true;
      const response = await route.fetch();
      expect((await response.json()).status).toBe("applied");
      await route.abort("failed");
      dropped = true;
    });
    await page
      .getByRole("button", { name: "Finalizar entrenamiento", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText(
      "La versión anterior quedará en el historial de la misma rutina",
    );
    await page
      .getByRole("button", { name: "Confirmar cierre", exact: true })
      .click();
    await expect.poll(() => dropped).toBe(true);
    await page.reload();
    await expect(
      page.getByRole("heading", {
        name: "Entrenamiento finalizado",
        exact: true,
      }),
    ).toBeVisible({ timeout: 40000 });
    const versions = await a.client
      .from("routine_revisions")
      .select("id,source_session_id,previous_revision_id")
      .eq("student_id", a.studentId);
    expect(versions.error).toBeNull();
    expect(versions.data).toHaveLength(2);
    expect(versions.data!.find((v) => v.source_session_id)).toMatchObject({
      source_session_id: a.snapshot.sessions[0].id,
      previous_revision_id: a.snapshot.routine.id,
    });
    await page
      .getByRole("link", { name: "Ver versiones", exact: true })
      .click();
    const history = page.getByRole("region", {
      name: "Versiones de rutinas",
      exact: true,
    });
    await expect(
      history.getByRole("button", {
        name: "Ver versiones de Nueva rutina",
        exact: true,
      }),
    ).toHaveCount(1);
    await expect(history).toContainText("2 versiones");
    await history
      .getByRole("button", {
        name: "Ver versiones de Nueva rutina",
        exact: true,
      })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("cell", { name: "50 kg", exact: true }),
    ).toBeVisible();
    await dialog
      .getByLabel("Versión de la rutina", { exact: true })
      .selectOption("0");
    await expect(
      dialog.getByRole("cell", { name: "25 kg", exact: true }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Semana 2", exact: true }).click();
    await expect(
      dialog.getByRole("cell", { name: "25 kg", exact: true }),
    ).toBeVisible();
    await dialog
      .getByRole("button", { name: "Versión siguiente", exact: true })
      .click();
    await expect(
      dialog.getByRole("cell", { name: "50 kg", exact: true }),
    ).toBeVisible();
    mkdirSync(".local/screens/session-versions", { recursive: true });
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(
        await dialog
          .getByRole("button", { name: "Cerrar", exact: true })
          .evaluate((el) => {
            const r = el.getBoundingClientRect();
            return r.width >= 44 && r.height >= 44;
          }),
      ).toBe(true);
      await page.screenshot({
        path: `.local/screens/session-versions/versions-${width}.png`,
      });
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await page.goto(`/alumnos/${a.studentId}`);
    await expect(
      page.getByRole("region", { name: "Rutinas anteriores" }),
    ).toContainText("Todavía no hay rutinas anteriores");
  } finally {
    await dropFixture(a.studentId);
  }
});

test("different observed sets become progression while skipped sets, days and unchanged future targets stay intact", async () => {
  const doc = routineFixture();
  for (const [wi, week] of doc.weeks.entries()) {
    const other = structuredClone(week[0]);
    other.id = crypto.randomUUID();
    other.name = "Día 2";
    other.blocks[0].id = crypto.randomUUID();
    other.blocks[0].exercises[0].id = crypto.randomUUID();
    week.push(other); // Same lineage in a different day must not be changed.
    const rx = week[0].blocks[0].exercises[0].prescription;
    rx.sets = 3;
    rx.progression = [
      { weight: 20, reps: 10 },
      { weight: 30, reps: wi === 0 ? 8 : 12 },
      { weight: 40, reps: 6 },
    ];
  }
  const a = await prepared(doc);
  let revision = a.snapshot.revision;
  const session = a.snapshot.sessions[0],
    item = session.items[0];
  async function run(kind: string, payload: unknown) {
    const result = await execute(
      a.client,
      command(a.workspaceId, a.studentId, kind, payload, revision),
    );
    expect(result.status, JSON.stringify(result)).toBe("applied");
    revision = result.revision;
    return result;
  }
  try {
    await run("record_set", {
      sessionId: session.id,
      itemId: item.id,
      setId: item.sets[0].id,
      ordinal: 1,
      state: "done",
      weight: 50,
      reps: 6,
      durationSec: null,
    });
    await run("record_set", {
      sessionId: session.id,
      itemId: item.id,
      setId: item.sets[1].id,
      ordinal: 2,
      state: "skipped",
      weight: null,
      reps: null,
      durationSec: null,
    });
    await run("correct_result", {
      sessionId: session.id,
      itemId: item.id,
      setId: item.sets[0].id,
      field: "weight",
      value: 52.5,
      reason: "Corrección antes del cierre",
    });
    const closed = await run("finish_session", {
      sessionId: session.id,
      quickConfirmItemIds: [item.id],
      allowEmpty: false,
    });
    for (const [wi, week] of closed.patch.routine.document.weeks.entries()) {
      expect(week[0].blocks[0].exercises[0].prescription.progression).toEqual([
        { weight: 52.5, reps: 6 },
        { weight: 30, reps: wi === 0 ? 8 : 12 },
        { weight: 40, reps: 6 },
      ]);
      expect(week[1]).toEqual(doc.weeks[wi][1]);
    }
    const id = closed.patch.routine.id;
    const corrected = await run("correct_result", {
      sessionId: session.id,
      itemId: item.id,
      setId: item.sets[0].id,
      field: "weight",
      value: 55,
      reason: "Corrección histórica posterior",
    });
    expect(corrected.patch.routine.id).toBe(id);
  } finally {
    await dropFixture(a.studentId);
  }
});

test("simultaneous closes create one version and cannot silently overwrite an existing draft", async ({
  page,
}) => {
  const a = await prepared();
  const session = a.snapshot.sessions[0],
    item = session.items[0];
  let revision = a.snapshot.revision;
  async function run(kind: string, payload: unknown) {
    const result = await execute(
      a.client,
      command(a.workspaceId, a.studentId, kind, payload, revision),
    );
    expect(result.status, JSON.stringify(result)).toBe("applied");
    revision = result.revision;
    return result;
  }
  try {
    const draftId = crypto.randomUUID();
    const document = structuredClone(a.snapshot.routine.document);
    document.name = "Cambios en preparación";
    await run("save_draft", {
      draftId,
      expectedDraftRevision: 0,
      baseRoutineRevisionId: a.snapshot.routine.id,
      document,
    });
    await run("record_set", {
      sessionId: session.id,
      itemId: item.id,
      setId: item.sets[0].id,
      ordinal: 1,
      state: "done",
      weight: 50,
      reps: 6,
      durationSec: null,
    });
    const payload = {
      sessionId: session.id,
      quickConfirmItemIds: [item.id],
      allowEmpty: false,
    };
    const closes = await Promise.all(
      [1, 2].map(() =>
        execute(
          a.client,
          command(
            a.workspaceId,
            a.studentId,
            "finish_session",
            payload,
            revision,
          ),
        ),
      ),
    );
    expect(closes.map((r) => r.status).sort()).toEqual(["applied", "conflict"]);
    const closed = closes.find((r) => r.status === "applied")!;
    revision = closed.revision;
    const publish = await execute(
      a.client,
      command(
        a.workspaceId,
        a.studentId,
        "publish_routine",
        {
          draftId,
          expectedDraftRevision: 1,
          baseRoutineRevisionId: a.snapshot.routine.id,
          targetMonth: a.snapshot.period.month,
        },
        revision,
      ),
    );
    expect(publish.status).toBe("rejected");
    expect(publish.code).toBe("INVALID");
    const draft = await a.client
      .from("routine_drafts")
      .select("document,base_revision_id")
      .eq("id", draftId)
      .single();
    expect(draft.error).toBeNull();
    expect(draft.data).toEqual({
      document,
      base_revision_id: a.snapshot.routine.id,
    });
    const repeated = await execute(
      a.client,
      command(a.workspaceId, a.studentId, "finish_session", payload, revision),
    );
    expect(repeated.status).toBe("rejected");
    const versions = await a.client
      .from("routine_revisions")
      .select("id")
      .eq("student_id", a.studentId);
    expect(versions.data).toHaveLength(2);
    const latest = await a.client.rpc("fetch_student", {
      workspace_id: a.workspaceId,
      student_id: a.studentId,
    });
    expect(latest.data.routine.id).toBe(closed.patch.routine.id);
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(accounts[0].email);
    await page
      .getByLabel("Contraseña", { exact: true })
      .fill(accounts[0].password);
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await expect(page.getByRole("navigation")).toBeVisible();
    await page.goto(
      `/alumnos/${a.studentId}/borradores/editar?draft=${draftId}`,
    );
    await page
      .getByRole("button", { name: "Activar rutina", exact: true })
      .click();
    const comparison = page.getByRole("dialog", { name: "Comparar borrador" });
    await expect(comparison).toContainText("No hay campos incompatibles");
    await comparison
      .getByRole("button", { name: "Crear borrador revisado" })
      .click();
    await page
      .getByRole("button", { name: "Guardar borrador", exact: true })
      .click();
    await expect(
      page.getByText("Borrador guardado. Todavía no cambia la rutina activa."),
    ).toBeVisible();
    const reviewed = await a.client
      .from("routine_drafts")
      .select("document,base_revision_id")
      .eq("id", draftId)
      .single();
    expect(reviewed.data!.base_revision_id).toBe(closed.patch.routine.id);
    expect(reviewed.data!.document.name).toBe(document.name);
    expect(
      reviewed.data!.document.weeks[1][0].blocks[0].exercises[0].prescription
        .progression[0],
    ).toEqual({ weight: 50, reps: 6 });
  } finally {
    await dropFixture(a.studentId);
  }
});

test("ambiguous repeated exercises in a separately authored week are never guessed", async () => {
  const doc = routineFixture();
  const exercises = doc.weeks[1][0].blocks[0].exercises;
  exercises[0].lineageId = crypto.randomUUID();
  const duplicate = structuredClone(exercises[0]);
  duplicate.id = crypto.randomUUID();
  duplicate.lineageId = crypto.randomUUID();
  duplicate.prescription.weight = 40;
  exercises.push(duplicate);
  const a = await prepared(doc);
  const session = a.snapshot.sessions[0],
    item = session.items[0];
  try {
    const recorded = await execute(
      a.client,
      command(
        a.workspaceId,
        a.studentId,
        "record_set",
        {
          sessionId: session.id,
          itemId: item.id,
          setId: item.sets[0].id,
          ordinal: 1,
          state: "done",
          weight: 50,
          reps: 6,
          durationSec: null,
        },
        a.snapshot.revision,
      ),
    );
    expect(recorded.status).toBe("applied");
    const closed = await execute(
      a.client,
      command(
        a.workspaceId,
        a.studentId,
        "finish_session",
        {
          sessionId: session.id,
          quickConfirmItemIds: [item.id],
          allowEmpty: false,
        },
        recorded.revision,
      ),
    );
    expect(closed.status).toBe("applied");
    expect(closed.patch.routine.document.weeks[1]).toEqual(doc.weeks[1]);
    expect(
      closed.patch.routine.document.weeks[2][0].blocks[0].exercises[0]
        .prescription.progression[0],
    ).toEqual({ weight: 50, reps: 6 });
  } finally {
    await dropFixture(a.studentId);
  }
});

test("rest adjustments are staged until finish and all changes produce one version", async () => {
  const a = await prepared();
  let revision = a.snapshot.revision;
  const session = a.snapshot.sessions[0],
    item = session.items[0];
  async function run(kind: string, payload: unknown) {
    const result = await execute(
      a.client,
      command(a.workspaceId, a.studentId, kind, payload, revision),
    );
    expect(result.status, JSON.stringify(result)).toBe("applied");
    revision = result.revision;
    return result;
  }
  try {
    for (const [field, value] of [
      ["microRest", 180],
      ["macroRest", 300],
      ["microRest", 30],
    ] as const) {
      const adjusted = await run("adjust_prescription", {
        sessionId: session.id,
        itemId: item.id,
        field,
        value,
        scope: "session_and_future",
      });
      expect(adjusted.patch.routine.id).toBe(a.snapshot.routine.id);
    }
    const closed = await run("finish_session", {
      sessionId: session.id,
      quickConfirmItemIds: [item.id],
      allowEmpty: false,
    });
    for (const week of closed.patch.routine.document.weeks) {
      expect(week[0].blocks[0].macroRest).toBe(300);
      expect(week[0].blocks[0].exercises[0].prescription.microRest).toBe(30);
    }
    const versions = await a.client
      .from("routine_revisions")
      .select("id")
      .eq("student_id", a.studentId);
    expect(versions.data).toHaveLength(2);
  } finally {
    await dropFixture(a.studentId);
  }
});

test("unchanged observations and session-only rests do not overwrite future programming or create versions", async () => {
  const doc = routineFixture();
  doc.weeks[1][0].blocks[0].exercises[0].prescription.weight = 40;
  const a = await prepared(doc);
  let revision = a.snapshot.revision;
  const session = a.snapshot.sessions[0],
    item = session.items[0];
  async function run(kind: string, payload: unknown) {
    const result = await execute(
      a.client,
      command(a.workspaceId, a.studentId, kind, payload, revision),
    );
    expect(result.status, JSON.stringify(result)).toBe("applied");
    revision = result.revision;
    return result;
  }
  try {
    await run("adjust_prescription", {
      sessionId: session.id,
      itemId: item.id,
      field: "microRest",
      value: 300,
      scope: "session_only",
    });
    await run("record_set", {
      sessionId: session.id,
      itemId: item.id,
      setId: item.sets[0].id,
      ordinal: 1,
      state: "done",
      weight: 20,
      reps: 10,
      durationSec: null,
    });
    const closed = await run("finish_session", {
      sessionId: session.id,
      quickConfirmItemIds: [item.id],
      allowEmpty: false,
    });
    expect(closed.patch.routine.id).toBe(a.snapshot.routine.id);
    expect(closed.patch.routine.document).toEqual(doc);
  } finally {
    await dropFixture(a.studentId);
  }
});

test("empty or omitted exercises and rejected closes leave the routine unchanged", async () => {
  const a = await prepared();
  let revision = a.snapshot.revision;
  const session = a.snapshot.sessions[0],
    item = session.items[0];
  try {
    const pending = await execute(
      a.client,
      command(
        a.workspaceId,
        a.studentId,
        "finish_session",
        { sessionId: session.id, quickConfirmItemIds: [], allowEmpty: false },
        revision,
      ),
    );
    expect(pending.status).toBe("rejected");
    const recorded = await execute(
      a.client,
      command(
        a.workspaceId,
        a.studentId,
        "record_set",
        {
          sessionId: session.id,
          itemId: item.id,
          setId: item.sets[0].id,
          ordinal: 1,
          state: "done",
          weight: 50,
          reps: 6,
          durationSec: null,
        },
        revision,
      ),
    );
    revision = recorded.revision;
    const skipped = await execute(
      a.client,
      command(
        a.workspaceId,
        a.studentId,
        "skip_item",
        { sessionId: session.id, itemId: item.id, skipped: true },
        revision,
      ),
    );
    const closed = await execute(
      a.client,
      command(
        a.workspaceId,
        a.studentId,
        "finish_session",
        { sessionId: session.id, quickConfirmItemIds: [], allowEmpty: true },
        skipped.revision,
      ),
    );
    expect(closed.status).toBe("applied");
    expect(closed.patch.routine.id).toBe(a.snapshot.routine.id);
    expect(closed.patch.routine.document).toEqual(a.snapshot.routine.document);
  } finally {
    await dropFixture(a.studentId);
  }
});
