import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { prepared } from "../fixtures/prepared";
import { accounts, dropFixture, command, execute } from "../fixtures/cloud";
test("mobile live correction, accessible dialog and desktop history render without overflow", async ({
  page,
}) => {
  test.setTimeout(60000);
  mkdirSync(".local/screens", { recursive: true });
  const a = await prepared();
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/hoy");
    await page.getByLabel("Email").fill(accounts[0].email);
    await page
      .getByLabel("Contraseña", { exact: true })
      .fill(accounts[0].password);
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await expect(page.getByRole("navigation")).toBeVisible();
    await page.goto("/entrenar/" + a.studentId);
    await expect(page.getByLabel("Peso kg", { exact: true })).toHaveValue("20");
    await page.screenshot({
      path: ".local/screens/training-mobile.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: /Detalle de series/ }).click();
    await page
      .getByRole("button", { name: "Registrar serie 1", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Corregir serie 1", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Sincronizado", { exact: true })).toBeVisible();
    await page
      .getByRole("button", { name: "Corregir serie 1", exact: true })
      .click();
    await page.getByLabel("Valor corregido").fill("22,5");
    await page
      .getByLabel("Motivo de la corrección")
      .fill("Ajuste de anotación en el momento");
    await page
      .getByRole("button", { name: "Confirmar corrección", exact: true })
      .click();
    await expect(page.getByLabel("Valor corregido")).toHaveCount(0);
    await expect(page.getByLabel("Peso kg", { exact: true })).toHaveValue("20");
    await page
      .getByRole("button", { name: "Finalizar entrenamiento", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Finalizar entrenamiento", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirmar cierre", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Entrenamiento finalizado" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Ver resultados" }).click();
    await expect(
      page.getByRole("heading", { name: "Historial y progreso" }),
    ).toBeVisible();
    await expect(
      page.getByText("Resultado corregido", { exact: false }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: ".local/screens/history-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/rutinas/" + a.studentId);
    await expect(
      page.getByRole("button", { name: "Editar rutina", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: ".local/screens/routine-summary-desktop.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Editar rutina", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Editar rutina", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: ".local/screens/builder-desktop.png",
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const snapshot = await a.client.rpc("fetch_student", {
      workspace_id: a.workspaceId,
      student_id: a.studentId,
    });
    const current = snapshot.data;
    expect(current).toBeTruthy();
    const next = await execute(
      a.client,
      command(
        a.workspaceId,
        a.studentId,
        "start_session",
        {
          sessionId: crypto.randomUUID(),
          periodId: current.period.id,
          routineRevisionId: current.routine.id,
          dayId: current.routine.document.weeks[0][0].id,
          week: 1,
          date: current.period.month.slice(0, 7) + "-03",
          time: "19:00",
          timezone: "America/Argentina/Buenos_Aires",
        },
        current.revision,
      ),
    );
    expect(next.status).toBe("applied");
    await page.goto("/entrenar/" + a.studentId);
    await expect(page.getByText(/Anterior: 22,?\.?5 kg/)).toBeVisible();
  } finally {
    await dropFixture(a.studentId);
  }
});

test("unfinished individual series survives leaving the student and a reload", async ({
  page,
}) => {
  const a = await prepared();
  try {
    await page.goto("/hoy");
    await page.getByLabel("Email").fill(accounts[0].email);
    await page
      .getByLabel("Contraseña", { exact: true })
      .fill(accounts[0].password);
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await expect(page.getByRole("navigation")).toBeVisible();
    await page.goto("/entrenar/" + a.studentId);
    await page.getByRole("button", { name: /Detalle de series/ }).click();
    await page.getByLabel("Peso serie 1", { exact: true }).fill("27,5");
    await page.getByLabel("Reps serie 1", { exact: true }).fill("9");
    await page.getByRole("link", { name: "Hoy", exact: true }).click();
    await page.goto("/entrenar/" + a.studentId);
    await page.getByRole("button", { name: /Detalle de series/ }).click();
    await expect(page.getByLabel("Peso serie 1", { exact: true })).toHaveValue(
      "27,5",
    );
    await expect(page.getByLabel("Reps serie 1", { exact: true })).toHaveValue(
      "9",
    );
    await page.reload();
    await page.getByRole("button", { name: /Detalle de series/ }).click();
    await expect(page.getByLabel("Peso serie 1", { exact: true })).toHaveValue(
      "27,5",
    );
    await page
      .getByRole("button", { name: "Registrar serie 1", exact: true })
      .click();
    await expect(page.getByText("Sincronizado", { exact: true })).toBeVisible();
    const result = await a.client
      .from("session_sets")
      .select("weight,reps,state")
      .eq("student_id", a.studentId)
      .eq("ordinal", 1);
    expect(result.data?.[0]).toMatchObject({
      weight: 27.5,
      reps: 9,
      state: "done",
    });
  } finally {
    await dropFixture(a.studentId);
  }
});
