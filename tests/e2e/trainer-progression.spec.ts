import { test, expect } from "@playwright/test";
import { prepared } from "../fixtures/prepared";
import { routineFixture } from "../fixtures/routine";
import {
  accounts,
  adminClient,
  command,
  dropFixture,
  execute,
} from "../fixtures/cloud";

test("legacy per-exercise block-rest annotations remain recoverable at the block control", async ({
  page,
}) => {
  const doc = routineFixture();
  for (const week of doc.weeks) {
    const first = week[0].blocks[0].exercises[0];
    week[0].blocks[0].exercises.push({
      ...structuredClone(first),
      id: crypto.randomUUID(),
      lineageId: "00000000-0000-4000-8000-000000000002",
      name: "Sentadilla secundaria",
    });
  }
  const a = await prepared(doc);
  try {
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(accounts[0].email);
    await page
      .getByLabel("Contraseña", { exact: true })
      .fill(accounts[0].password);
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await expect(page.getByRole("navigation")).toBeVisible();
    await page.goto(`/entrenar/${a.studentId}`);
    await expect(
      page.getByLabel("Descanso del bloque", { exact: true }),
    ).toBeVisible();
    const session = a.snapshot.sessions[0];
    await page.evaluate(
      async ({ studentId, session, revision }) => {
        const info = (await indexedDB.databases()).find((x) =>
          x.name?.startsWith("pulso:"),
        )!;
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open(info.name!);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        await new Promise<void>((resolve, reject) => {
          const tx = database.transaction("rawInputs", "readwrite");
          for (const [index, item] of session.items.entries())
            tx.objectStore("rawInputs").put({
              id: session.id + ":" + item.id + ":macroRest",
              studentId,
              sessionId: session.id,
              itemId: item.id,
              field: "macroRest",
              raw: index === 0 ? "min:0.5" : "min:0.75",
              revision,
              scope: "session_only",
            });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        database.close();
      },
      { studentId: a.studentId, session, revision: a.snapshot.revision },
    );
    await page.reload();
    const rest = page.getByLabel("Descanso del bloque", { exact: true });
    await expect(rest).toHaveValue("0.5");
    await rest.selectOption("3");
    await expect(rest).toHaveValue("0.75");
    await expect(rest.locator("option:checked")).toHaveText("45 s");
    await rest.selectOption("1");
    await expect(page.getByText("Guardado", { exact: true })).toBeVisible();
    await page
      .getByRole("button", { name: "Finalizar entrenamiento", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirmar cierre", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Entrenamiento finalizado" }),
    ).toBeVisible();
  } finally {
    await dropFixture(a.studentId);
  }
});

test("progression survives cloud save, session, rest adjustment, observed set and quick finish", async ({
  page,
}) => {
  const doc = routineFixture();
  for (const week of doc.weeks) {
    week[0].blocks[0].macroTarget = "blocks";
    week[0].blocks[0].exercises[0].prescription.progression = [
      { weight: 20, reps: 10 },
      { weight: 30, reps: 6 },
    ];
  }
  const a = await prepared(doc);
  try {
    let snapshot = a.snapshot;
    const session = snapshot.sessions[0],
      item = session.items[0];
    expect(item.sets.map((s: any) => [s.weight, s.reps])).toEqual([
      [20, 10],
      [30, 6],
    ]);
    const adjust = await execute(
      a.client,
      command(
        a.workspaceId,
        a.studentId,
        "adjust_prescription",
        {
          sessionId: session.id,
          itemId: item.id,
          field: "microRest",
          value: 180,
          scope: "session_and_future",
        },
        snapshot.revision,
      ),
    );
    expect(adjust.status).toBe("applied");
    snapshot = adjust.patch;
    expect(
      snapshot.sessions[0].items[0].sets.map((s: any) => [s.weight, s.reps]),
    ).toEqual([
      [20, 10],
      [30, 6],
    ]);
    expect(
      snapshot.routine.document.weeks[3][0].blocks[0].exercises[0].prescription
        .progression,
    ).toEqual([
      { weight: 20, reps: 10 },
      { weight: 30, reps: 6 },
    ]);
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(accounts[0].email);
    await page
      .getByLabel("Contraseña", { exact: true })
      .fill(accounts[0].password);
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await expect(page.getByRole("navigation")).toBeVisible();
    await page.goto(`/entrenar/${a.studentId}`);
    await expect(page.getByLabel("Peso serie 2", { exact: true })).toHaveValue(
      "30",
    );
    await expect(page.getByLabel("Reps serie 2", { exact: true })).toHaveValue(
      "6",
    );
    await expect(page.getByLabel("Descanso del bloque")).toHaveCount(1);
    await expect(page.getByLabel("Descanso macro (min)")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Registrar serie 1", exact: true })
      .click();
    await expect(page.getByText("Registrada", { exact: true })).toBeVisible();
    await page
      .getByRole("button", { name: "Finalizar entrenamiento", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirmar cierre", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Entrenamiento finalizado" }),
    ).toBeVisible();
    const result = await adminClient()
      .from("session_sets")
      .select("weight,reps,state,source")
      .eq("session_id", session.id)
      .order("ordinal");
    expect(result.error).toBeNull();
    expect(result.data).toEqual([
      { weight: 20, reps: 10, state: "done", source: "observed" },
      { weight: 30, reps: 6, state: "done", source: "quick_confirmed" },
    ]);
  } finally {
    await dropFixture(a.studentId);
  }
});

test("scheduled days and per-set editing survive save and reload at phone width", async ({
  page,
}) => {
  const a = await prepared();
  try {
    const se = a.snapshot.sessions[0];
    const close = await execute(
      a.client,
      command(
        a.workspaceId,
        a.studentId,
        "finish_session",
        {
          sessionId: se.id,
          quickConfirmItemIds: se.items.map((i: any) => i.id),
          allowEmpty: false,
        },
        a.snapshot.revision,
      ),
    );
    const schedule = await execute(
      a.client,
      command(
        a.workspaceId,
        a.studentId,
        "save_schedule",
        { weekdays: [1, 3, 5], time: "18:00", dayTimes: {} },
        close.revision,
      ),
    );
    expect(schedule.status).toBe("applied");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(accounts[0].email);
    await page
      .getByLabel("Contraseña", { exact: true })
      .fill(accounts[0].password);
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await expect(page.getByRole("navigation")).toBeVisible();
    await page.goto(`/alumnos/${a.studentId}/borradores/editar?nueva=1`);
    await expect(
      page.getByText("Días de su agenda", { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Cantidad de días por semana")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Crear rutina", exact: true })
      .click();
    await expect(
      page.getByLabel("Días", { exact: true }).getByRole("button"),
    ).toHaveText(["Lunes", "Miércoles", "Viernes"]);
    await expect(
      page.getByRole("button", { name: "+ Día", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Agregar bloque", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Agregar ejercicio", exact: true })
      .click();
    await page
      .getByLabel("Buscar ejercicio", { exact: true })
      .fill("Sentadilla con barra");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Sentadilla con barra", exact: true })
      .click();
    await page
      .getByRole("checkbox", { name: "Progresión por serie", exact: true })
      .check();
    await page.getByLabel("Series", { exact: true }).selectOption("2");
    await page.getByLabel("Peso kg · serie 1", { exact: true }).fill("20");
    await page.getByLabel("Peso kg · serie 2", { exact: true }).fill("30");
    await page
      .getByLabel("Repeticiones · serie 2", { exact: true })
      .selectOption("6");
    await page
      .getByRole("button", { name: "Guardar borrador", exact: true })
      .click();
    await expect(
      page.getByText("Borrador guardado. Todavía no cambia la rutina activa.", {
        exact: true,
      }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByLabel("Peso kg · serie 2", { exact: true }),
    ).toHaveValue("30");
    await expect(
      page.getByLabel("Repeticiones · serie 2", { exact: true }),
    ).toHaveValue("6");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: ".local/strong-review/trainer-mobile.png",
      fullPage: true,
    });
  } finally {
    await dropFixture(a.studentId);
  }
});
