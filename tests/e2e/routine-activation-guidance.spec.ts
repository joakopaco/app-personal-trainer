import { expect, test } from "@playwright/test";
import {
  accounts,
  command,
  createStudent,
  dropFixture,
  execute,
} from "../fixtures/cloud";
import { routineFixture } from "../fixtures/routine";

test("an incomplete week is identified precisely and one complete exercise per day can activate", async ({
  page,
}) => {
  const fixture = await createStudent();
  const draftId = crypto.randomUUID();
  const document = routineFixture();
  document.weeks.forEach((week) => {
    week[0].name = "Martes";
  });
  document.weeks[2][0].blocks = [];
  try {
    const saved = await execute(
      fixture.client,
      command(
        fixture.workspaceId,
        fixture.studentId,
        "save_draft",
        {
          draftId,
          expectedDraftRevision: 0,
          baseRoutineRevisionId: null,
          document,
        },
        fixture.revision,
      ),
    );
    expect(saved.status).toBe("applied");
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(accounts[0].email);
    await page
      .getByLabel("Contraseña", { exact: true })
      .fill(accounts[0].password);
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Hoy, con vos." }),
    ).toBeVisible();
    await page.goto(
      `/alumnos/${fixture.studentId}/borradores/editar?draft=${draftId}`,
    );
    await page
      .getByLabel("Nombre de la rutina")
      .fill("Una serie de pasos claros");
    await page
      .getByRole("button", { name: "Guardar borrador", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Pendientes para activar" }),
    ).toContainText("Semana 3 · Día 1: agregá al menos un ejercicio");
    await expect(
      page.getByText("Borrador listo para activar", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Día 1", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Martes", { exact: true })).toHaveCount(0);
    await page
      .getByRole("button", { name: "Activar rutina", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText("Semana 3 · Día 1");
    await page
      .getByRole("button", { name: "Editar borrador", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Copiar semana 1 a…", exact: true })
      .click();
    const copy = page.getByRole("dialog", {
      name: "Copiar semana 1",
      exact: true,
    });
    await copy
      .getByRole("checkbox", { name: "Semana 2", exact: true })
      .uncheck();
    await copy
      .getByRole("checkbox", { name: "Semana 4", exact: true })
      .uncheck();
    await copy
      .getByRole("button", { name: "Copiar a 1 semana", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Guardar borrador", exact: true })
      .click();
    await expect(
      page.getByText("Borrador listo para activar", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Activar rutina", exact: true })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/alumnos/${fixture.studentId}/rutina$`),
    );
    await expect(page.getByRole("status")).toContainText("Rutina activa");
    const active = await fixture.client.rpc("fetch_student", {
      workspace_id: fixture.workspaceId,
      student_id: fixture.studentId,
    });
    expect(active.error).toBeNull();
    expect(
      active.data.routine.document.weeks.every(
        (week: { blocks: { exercises: unknown[] }[] }[]) =>
          week[0].blocks.flatMap((block) => block.exercises).length === 1,
      ),
    ).toBe(true);
  } finally {
    await dropFixture(fixture.studentId);
  }
});
