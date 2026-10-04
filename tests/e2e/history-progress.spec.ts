import { mkdirSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { accounts, command, execute, dropFixture } from "../fixtures/cloud";
import { prepared } from "../fixtures/prepared";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(accounts[0].email);
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill(accounts[0].password);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page.getByRole("navigation")).toBeVisible();
}

test("empty progress keeps an accessible front/back muscle map without duplicating routines in history", async ({
  page,
}) => {
  const fixture = await prepared();
  try {
    await login(page);
    await page.goto("/progreso/" + fixture.studentId);
    await expect(
      page.getByText("Sin registros de cuádriceps en este período."),
    ).toBeVisible();
    const map = page.getByRole("region", { name: "Mapa muscular interactivo" });
    await expect(
      map.getByRole("button", { name: "Seleccionar Cuádriceps" }).first(),
    ).toBeVisible();
    await map.getByRole("button", { name: "Espalda", exact: true }).click();
    await map
      .getByRole("button", { name: "Seleccionar Espalda", exact: true })
      .first()
      .focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByLabel("Grupo muscular", { exact: true }),
    ).toHaveValue("Espalda");
    await expect(
      page.getByText("Sin registros de espalda en este período."),
    ).toBeVisible();
    await page
      .getByRole("navigation", { name: "Secciones del alumno" })
      .getByRole("link", { name: "Historial", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Registro de cambios" }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Rutinas anteriores" }),
    ).toHaveCount(0);
    await page.goto("/alumnos/" + fixture.studentId);
    await expect(
      page.getByText("Todavía no hay rutinas anteriores.", { exact: false }),
    ).toBeVisible();
  } finally {
    await dropFixture(fixture.studentId);
  }
});

test("progress fetches subsequent pages independently of the twenty-session detail list", async ({
  page,
}) => {
  const fixture = await prepared();
  try {
    const requests: number[] = [];
    await page.route("**/rest/v1/sessions?*", async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get("limit") !== "200") {
        await route.continue();
        return;
      }
      const start = Number(url.searchParams.get("offset") || 0);
      requests.push(start);
      const rows = Array.from({ length: 205 }, (_, index) => ({
        id: `test-session-${index}`,
        date: "2026-10-03",
        ended_at: new Date(Date.UTC(2026, 9, 3, 0, index)).toISOString(),
        session_items: [
          {
            id: `item-${index}`,
            name: "Sentadilla",
            type: "load_reps",
            warmup: false,
            skipped: false,
            exercise_id: "sentadilla",
            group: "Cuádriceps",
            session_sets: [
              {
                id: `set-${index}`,
                ordinal: 1,
                state: "done",
                source: "observed",
                weight: 20 + index,
                reps: 10,
                duration_sec: null,
              },
            ],
          },
        ],
      }));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(rows.slice(start, start + 200)),
      });
    });
    await login(page);
    await page.goto("/progreso/" + fixture.studentId);
    await expect(
      page.getByText("Todo el historial registrado · 205 sesiones finalizadas"),
    ).toBeVisible();
    const focus = page.getByRole("region", { name: "Evolución del ejercicio" });
    await expect(
      focus.getByText("224", { exact: false }).first(),
    ).toBeVisible();
    expect(requests).toContain(200);
    await expect(
      page.getByRole("img", { name: "Evolución de Sentadilla en kg" }),
    ).toBeVisible();
  } finally {
    await dropFixture(fixture.studentId);
  }
});

test("previous routines show dates and original prescriptions, independently of the active routine", async ({
  page,
}) => {
  const fixture = await prepared();
  try {
    const session = fixture.snapshot.sessions[0];
    const closed = await execute(
      fixture.client,
      command(
        fixture.workspaceId,
        fixture.studentId,
        "finish_session",
        {
          sessionId: session.id,
          quickConfirmItemIds: session.items.map(
            (item: { id: string }) => item.id,
          ),
          allowEmpty: false,
        },
        fixture.snapshot.revision,
      ),
    );
    expect(closed.status).toBe("applied");
    const document = structuredClone(fixture.snapshot.routine!.document);
    document.name = "Rutina actualizada";
    for (const week of document.weeks)
      week[0].blocks[0].exercises[0].prescription.weight = 35;
    const draftId = crypto.randomUUID();
    const saved = await execute(
      fixture.client,
      command(
        fixture.workspaceId,
        fixture.studentId,
        "save_draft",
        {
          draftId,
          expectedDraftRevision: 0,
          baseRoutineRevisionId: fixture.snapshot.routine!.id,
          document,
        },
        closed.revision,
      ),
    );
    expect(saved.status).toBe("applied");
    const published = await execute(
      fixture.client,
      command(
        fixture.workspaceId,
        fixture.studentId,
        "publish_routine",
        {
          draftId,
          expectedDraftRevision: 1,
          baseRoutineRevisionId: fixture.snapshot.routine!.id,
          targetMonth: fixture.snapshot.period!.month,
        },
        saved.revision,
      ),
    );
    expect(published.status).toBe("applied");
    await login(page);
    await page.goto("/alumnos/" + fixture.studentId);
    const archive = page.getByRole("region", { name: "Rutinas anteriores" });
    await expect(archive.getByText("Inicio:", { exact: false })).toBeVisible();
    await expect(archive.getByRole("combobox")).toHaveCount(0);
    mkdirSync(".local/screens/front-review", { recursive: true });
    await page.screenshot({
      path: ".local/screens/front-review/archive-list.png",
      fullPage: true,
    });
    await archive.getByRole("button", { name: /Ver rutina/ }).click();
    const detail = page.getByRole("dialog");
    await expect(
      detail.getByRole("cell", { name: "20 kg", exact: true }),
    ).toBeVisible();
    await detail.getByRole("button", { name: "Semana 4", exact: true }).click();
    await expect(
      detail.getByRole("cell", { name: "20 kg", exact: true }),
    ).toBeVisible();
    await expect(
      detail.getByRole("cell", { name: "35 kg", exact: true }),
    ).toHaveCount(0);
    await page.screenshot({
      path: ".local/screens/front-review/archive-detail.png",
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: ".local/screens/front-review/archive-detail-mobile.png",
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await detail.getByRole("button", { name: "Cerrar", exact: true }).click();
    await expect(detail).toHaveCount(0);
  } finally {
    await dropFixture(fixture.studentId);
  }
});
