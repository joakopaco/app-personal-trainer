import { test, expect } from "@playwright/test";
import { prepared } from "../fixtures/prepared";
import {
  accounts,
  accountClient,
  dropFixture,
  execute,
  command,
} from "../fixtures/cloud";

test("active routine stays separate; unchanged editing, save and discard survive navigation", async ({
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
    await page.goto(`/alumnos/${a.studentId}/rutina`);
    await expect(
      page.getByRole("button", { name: "Guardar borrador", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Editar rutina", exact: true })
      .click();
    await expect(page).toHaveURL(/borradores\/editar/);
    await expect(
      page.getByRole("button", { name: "Guardar borrador", exact: true }),
    ).toBeDisabled();
    await page.getByLabel("Nombre de la rutina").fill("Fuerza en preparación");
    await expect(
      page.getByRole("button", { name: "Guardar borrador", exact: true }),
    ).toBeEnabled();
    await page
      .getByRole("link", { name: "Rutina actual", exact: true })
      .click();
    await expect(
      page.getByText("Fuerza en preparación", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Guardar borrador", exact: true }),
    ).toHaveCount(0);
    await page.getByRole("link", { name: "Borradores", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Fuerza en preparación" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Continuar borrador" }).click();
    await expect(page.getByLabel("Nombre de la rutina")).toHaveValue(
      "Fuerza en preparación",
    );
    // An unrelated student revision must not falsely block saving this draft.
    await execute(
      a.client,
      command(
        a.workspaceId,
        a.studentId,
        "update_student",
        { name: "Nombre actualizado" },
        a.snapshot.revision,
      ),
    );
    await page
      .getByRole("button", { name: "Guardar borrador", exact: true })
      .click();
    await expect(
      page.getByText("Borrador guardado. Todavía no cambia la rutina activa."),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Guardar borrador", exact: true }),
    ).toBeDisabled();
    await page.getByLabel("Nombre de la rutina").fill("Otro nombre");
    await page.getByLabel("Nombre de la rutina").fill("Fuerza en preparación");
    await expect(
      page.getByRole("button", { name: "Guardar borrador", exact: true }),
    ).toBeDisabled();
    const savedDraft = await a.client
      .from("routine_drafts")
      .select("*")
      .eq("student_id", a.studentId)
      .single();
    const latest = await a.client.rpc("fetch_student", {
      workspace_id: a.workspaceId,
      student_id: a.studentId,
    });
    await execute(
      a.client,
      command(
        a.workspaceId,
        a.studentId,
        "save_draft",
        {
          draftId: savedDraft.data.id,
          expectedDraftRevision: savedDraft.data.revision,
          baseRoutineRevisionId: a.snapshot.routine.id,
          document: {
            ...savedDraft.data.document,
            name: "Borrador actualizado en otra pantalla",
          },
        },
        latest.data.revision,
      ),
    );
    await page
      .getByRole("button", { name: "Descartar borrador", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText(
      "versión guardada más reciente",
    );
    await page.screenshot({
      path: `.local/screens/discard-dialog-${test.info().project.name || "desktop"}.png`,
      fullPage: true,
    });
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Descartar borrador", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "No hay borradores pendientes" }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "No hay borradores pendientes" }),
    ).toBeVisible();
    const snapshot = await a.client.rpc("fetch_student", {
      workspace_id: a.workspaceId,
      student_id: a.studentId,
    });
    expect(snapshot.data.routine.id).toBe(a.snapshot.routine.id);
    await page.screenshot({
      path: ".local/screens/drafts-empty-desktop.png",
      fullPage: true,
    });
    await page.getByRole("link", { name: "Nueva rutina", exact: true }).click();
    await expect(
      page.getByLabel("Punto de partida", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await page.screenshot({
      path: ".local/screens/new-routine-centered.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.screenshot({
      path: ".local/screens/new-routine-mobile.png",
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
    await page
      .getByRole("button", { name: "Descartar borrador", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Descartar borrador", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "No hay borradores pendientes" }),
    ).toBeVisible();
  } finally {
    await dropFixture(a.studentId);
  }
});

test("discard is owned, revision checked and repeatable; never deletes active routine", async () => {
  const a = await prepared();
  try {
    const draftId = crypto.randomUUID();
    await execute(
      a.client,
      command(
        a.workspaceId,
        a.studentId,
        "save_draft",
        {
          draftId,
          expectedDraftRevision: 0,
          baseRoutineRevisionId: a.snapshot.routine.id,
          document: a.snapshot.routine.document,
        },
        a.snapshot.revision,
      ),
    );
    const args = {
      workspace_id: a.workspaceId,
      student_id: a.studentId,
      draft_id: draftId,
      expected_revision: 1,
    };
    const other = await accountClient(1);
    expect(
      (await other.client.rpc("discard_student_draft", args)).error?.code,
    ).toBe("42501");
    expect(
      (
        await a.client.rpc("discard_student_draft", {
          ...args,
          expected_revision: 0,
        })
      ).error?.code,
    ).toBe("22023");
    expect(
      (await a.client.rpc("discard_student_draft", args)).error,
    ).toBeNull();
    expect(
      (await a.client.rpc("discard_student_draft", args)).error,
    ).toBeNull();
    const remaining = await a.client
      .from("routine_drafts")
      .select("id")
      .eq("id", draftId);
    expect(remaining.data).toEqual([]);
    const active = await a.client.rpc("fetch_student", {
      workspace_id: a.workspaceId,
      student_id: a.studentId,
    });
    expect(active.data.routine.id).toBe(a.snapshot.routine.id);
  } finally {
    await dropFixture(a.studentId);
  }
});
