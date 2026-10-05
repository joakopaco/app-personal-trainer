import { test, expect } from "@playwright/test";
import { prepared } from "../fixtures/prepared";
import {
  accounts,
  adminClient,
  execute,
  command,
  dropFixture,
} from "../fixtures/cloud";
import { routineFixture } from "../fixtures/routine";

test("student can create from all four sources without changing the active routine or source until activation", async ({
  page,
}) => {
  test.setTimeout(90000);
  const a = await prepared(),
    other = await prepared();
  const templateId = crypto.randomUUID();
  const template = routineFixture();
  template.name = "Base de prueba " + templateId.slice(0, 8);
  try {
    const { error } = await adminClient()
      .from("routine_templates")
      .insert({
        id: templateId,
        workspace_id: a.workspaceId,
        name: template.name,
        document: template,
      });
    if (error) throw error;
    const session = a.snapshot.sessions[0];
    await execute(
      a.client,
      command(
        a.workspaceId,
        a.studentId,
        "finish_session",
        {
          sessionId: session.id,
          quickConfirmItemIds: session.items.map((i: { id: string }) => i.id),
          allowEmpty: false,
        },
        a.snapshot.revision,
      ),
    );
    const snapshot = async () => {
      const { data, error } = await a.client.rpc("fetch_student", {
        workspace_id: a.workspaceId,
        student_id: a.studentId,
      });
      if (error) throw error;
      return data;
    };
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(accounts[0].email);
    await page
      .getByLabel("Contraseña", { exact: true })
      .fill(accounts[0].password);
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await expect(page.getByRole("navigation")).toBeVisible();
    await page.goto(`/alumnos/${a.studentId}`);
    await page.getByRole("link", { name: "Nueva rutina", exact: true }).click();
    await page
      .getByLabel("Punto de partida", { exact: true })
      .selectOption("student:" + other.studentId);
    await page
      .getByLabel("Nombre de la nueva rutina")
      .fill("Ciclo de fuerza nuevo");
    await page
      .getByRole("button", { name: "Crear rutina", exact: true })
      .click();
    await expect(page.getByLabel("Peso kg", { exact: true })).toHaveValue("20");
    await page.getByLabel("Peso kg", { exact: true }).fill("31");
    await page
      .getByRole("button", { name: "Guardar borrador", exact: true })
      .click();
    await expect(
      page.getByText("Borrador guardado. Todavía no cambia la rutina activa."),
    ).toBeVisible();
    expect((await snapshot()).routine.id).toBe(a.snapshot.routine.id);
    await page.reload();
    await expect(page.getByLabel("Nombre de la rutina")).toHaveValue(
      "Ciclo de fuerza nuevo",
    );
    await expect(page.getByLabel("Peso kg", { exact: true })).toHaveValue("31");
    await page
      .getByRole("button", { name: "Nueva rutina", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Crear rutina", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Volver al borrador", exact: true })
      .click();
    await expect(page.getByLabel("Peso kg", { exact: true })).toHaveValue("31");
    await page
      .getByRole("button", { name: "Nueva rutina", exact: true })
      .click();
    await page
      .getByLabel("Punto de partida", { exact: true })
      .selectOption(templateId);
    await page.getByLabel("Reemplazar el borrador pendiente").check();
    await page
      .getByLabel("Nombre de la nueva rutina")
      .fill("Plan desde plantilla");
    await page
      .getByRole("button", { name: "Crear rutina", exact: true })
      .click();
    await page.getByLabel("Peso kg", { exact: true }).fill("40");
    await page
      .getByRole("button", { name: "Guardar borrador", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Activar rutina", exact: true })
      .click();
    await expect(
      page.getByText("Rutina activa. La versión anterior se conserva."),
    ).toBeVisible();
    const active = await snapshot();
    expect(active.routine.document.name).toBe("Plan desde plantilla");
    expect(active.routine.document.weeks[0][0].id).not.toBe(
      template.weeks[0][0].id,
    );
    const original = await a.client
      .from("routine_templates")
      .select("document")
      .eq("id", templateId)
      .single();
    expect(original.data!.document).toEqual(template);
    const sourceStudent = await a.client.rpc("fetch_student", {
      workspace_id: a.workspaceId,
      student_id: other.studentId,
    });
    expect(sourceStudent.data.routine).toEqual(other.snapshot.routine);
    await page.goto(`/alumnos/${a.studentId}`);
    await page
      .getByRole("link", { name: "Usar como base", exact: true })
      .click();
    await expect(
      page.getByLabel("Punto de partida", { exact: true }),
    ).toHaveValue("archive:" + a.snapshot.routine.id);
    await page
      .getByLabel("Nombre de la nueva rutina")
      .fill("Repetir rutina anterior");
    await page
      .getByRole("button", { name: "Crear rutina", exact: true })
      .click();
    await expect(page.getByLabel("Peso kg", { exact: true })).toHaveValue("20");
    expect((await snapshot()).routine.id).toBe(active.routine.id);
    await page.setViewportSize({ width: 375, height: 844 });
    await page
      .getByRole("button", { name: "Nueva rutina", exact: true })
      .click();
    await page.getByLabel("Reemplazar el borrador pendiente").check();
    await page.getByLabel("Punto de partida", { exact: true }).selectOption("");
    await page.getByLabel("Cantidad de días por semana").selectOption("3");
    await page.getByLabel("Nombre de la nueva rutina").fill("Plan desde cero");
    await page.screenshot({
      path: ".local/screens/new-routine/mobile-wizard.png",
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: "Crear rutina", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Día 3", exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Nombre de la rutina")).toHaveValue(
      "Plan desde cero",
    );
    await expect(page.locator(".routine-drop-block")).toHaveCount(0);
    expect((await snapshot()).routine.id).toBe(active.routine.id);
  } finally {
    await dropFixture(a.studentId);
    await dropFixture(other.studentId);
    await adminClient().from("routine_templates").delete().eq("id", templateId);
  }
});
