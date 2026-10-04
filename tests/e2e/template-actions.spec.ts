import { test, expect, type Page } from "@playwright/test";
import {
  accounts,
  accountClient,
  adminClient,
  dropFixture,
} from "../fixtures/cloud";
import { prepared } from "../fixtures/prepared";
import { blankRoutine } from "@pulso/domain/routines";

async function login(page: Page) {
  await page.goto("/rutinas");
  await page.getByLabel("Email", { exact: true }).fill(accounts[0].email);
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill(accounts[0].password);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Rutinas", exact: true }),
  ).toBeVisible();
}
async function confirm(page: Page, name: string) {
  await page.getByRole("button", { name, exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name, exact: true })
    .click();
}

test("new drafts can be cancelled or discarded and stay removed after reload", async ({
  page,
}) => {
  await login(page);
  await page
    .getByRole("button", { name: "Crear plantilla", exact: true })
    .click();
  await expect(page).toHaveURL(/\/rutinas\/plantillas\//);
  const id = page.url().split("/").at(-1)!;
  await page
    .getByRole("button", { name: "Descartar borrador", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancelar", exact: true })
    .click();
  await expect(page.getByLabel("Nombre de la rutina")).toHaveValue(
    "Nueva rutina",
  );
  await expect(
    page.getByRole("button", { name: "Eliminar rutina", exact: true }),
  ).toHaveCount(0);
  await confirm(page, "Descartar borrador");
  await expect(page).toHaveURL(/\/rutinas$/);
  await page.reload();
  await expect(page.locator(`a[href="/rutinas/plantillas/${id}"]`)).toHaveCount(
    0,
  );
});

test("discard preserves the saved routine; deletion is owned, revision checked and keeps student copies", async ({
  page,
}) => {
  const a = await prepared(),
    b = await accountClient(1),
    id = crypto.randomUUID();
  const doc = {
    ...a.snapshot.routine!.document,
    name: "Plantilla " + id.slice(0, 8),
  };
  try {
    const created = await a.client.rpc("save_library_entry", {
      command: {
        workspaceId: a.workspaceId,
        operationId: crypto.randomUUID(),
        id,
        kind: "template",
        expectedRevision: 0,
        payload: { document: doc },
      },
    });
    expect(created.error).toBeNull();
    const deletion = {
      workspaceId: a.workspaceId,
      operationId: crypto.randomUUID(),
      id,
      kind: "template_delete",
      expectedRevision: 1,
      payload: {},
    };
    expect(
      (await b.client.rpc("save_library_entry", { command: deletion })).error
        ?.code,
    ).toBe("42501");
    expect(
      (
        await b.client.rpc("save_library_entry", {
          command: { ...deletion, workspaceId: b.workspaceId },
        })
      ).error?.code,
    ).toBe("42501");
    expect(
      (
        await a.client.rpc("save_library_entry", {
          command: { ...deletion, expectedRevision: 0 },
        })
      ).error?.code,
    ).toBe("22023");
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page);
    await page.goto("/rutinas/plantillas/" + id);
    await page
      .getByRole("button", { name: "Editar plantilla", exact: true })
      .click();
    await page.getByLabel("Nombre de la rutina").fill("Cambio descartado");
    await expect(
      page.getByText("Borrador guardado en este dispositivo", { exact: true }),
    ).toBeVisible();
    await confirm(page, "Descartar borrador");
    await expect(page).toHaveURL(/\/rutinas$/);
    await page.goto("/rutinas/plantillas/" + id);
    await expect(
      page.getByRole("heading", { name: doc.name, exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Eliminar rutina", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Cancelar", exact: true })
      .click();
    expect(
      (await a.client.from("routine_templates").select("id").eq("id", id)).data,
    ).toHaveLength(1);
    await confirm(page, "Eliminar rutina");
    await expect(page).toHaveURL(/\/rutinas$/);
    expect(
      (await a.client.from("routine_templates").select("id").eq("id", id)).data,
    ).toEqual([]);
    const student = await a.client.rpc("fetch_student", {
      workspace_id: a.workspaceId,
      student_id: a.studentId,
    });
    expect(student.data.routine).toEqual(a.snapshot.routine);
    expect(student.data.sessions).toEqual(a.snapshot.sessions);
  } finally {
    await adminClient().from("routine_templates").delete().eq("id", id);
    await dropFixture(a.studentId);
  }
});

test("a lost deletion acknowledgement can be retried after reload without recreating a deleted template", async ({
  page,
}) => {
  const a = await accountClient(),
    id = crypto.randomUUID();
  let deletedCommand: Record<string, unknown> | undefined;
  try {
    const created = await a.client.rpc("save_library_entry", {
      command: {
        workspaceId: a.workspaceId,
        operationId: crypto.randomUUID(),
        id,
        kind: "template",
        expectedRevision: 0,
        payload: { document: blankRoutine() },
      },
    });
    expect(created.error).toBeNull();
    await login(page);
    await page.goto("/rutinas/plantillas/" + id);
    await page.route("**/rest/v1/rpc/save_library_entry", async (route) => {
      deletedCommand = route.request().postDataJSON().command;
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      await route.abort();
    });
    await confirm(page, "Eliminar rutina");
    await expect(
      page.getByRole("button", { name: "Reintentar eliminación", exact: true }),
    ).toBeVisible();
    expect(
      (await a.client.from("routine_templates").select("id").eq("id", id)).data,
    ).toEqual([]);
    await page.unroute("**/rest/v1/rpc/save_library_entry");
    await page.reload();
    await page
      .getByRole("button", { name: "Reintentar eliminación", exact: true })
      .click();
    await expect(page).toHaveURL(/\/rutinas$/);
    expect(
      (await a.client.rpc("save_library_entry", { command: deletedCommand }))
        .data,
    ).toEqual({ id, deleted: true });
    expect(
      (
        await a.client.rpc("save_library_entry", {
          command: { ...deletedCommand, payload: { changed: true } },
        })
      ).error?.code,
    ).toBe("22023");
  } finally {
    await adminClient().from("routine_templates").delete().eq("id", id);
  }
});
