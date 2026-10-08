import { test, expect, type Page } from "@playwright/test";
import {
  accounts,
  accountClient,
  adminClient,
  dropFixture,
} from "../fixtures/cloud";
import { prepared } from "../fixtures/prepared";

async function login(page: Page) {
  await page.goto("/hoy");
  await page.getByLabel("Email").fill(accounts[0].email);
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill(accounts[0].password);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page.getByRole("navigation")).toBeVisible();
}

test("catalog creates and edits standalone templates, preserves incomplete fields and enforces ownership and revisions", async ({
  page,
}) => {
  const a = await accountClient();
  let id = "";
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page);
    await page.getByRole("link", { name: "Rutinas", exact: true }).click();
    await expect(
      page.getByText("Elegí un alumno para crear o editar su rutina mensual."),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Crear plantilla", exact: true })
      .click();
    await expect(page).toHaveURL(/\/rutinas\/plantillas\//);
    id = page.url().split("/").at(-1)!;
    const name = "Fuerza base " + id.slice(0, 8);
    await page
      .getByRole("textbox", { name: "Nombre de la rutina", exact: true })
      .fill(name);
    await page
      .getByRole("button", { name: "Agregar bloque", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Agregar ejercicio", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Sentadilla con barra", exact: true })
      .click();
    await page.getByLabel("Descanso del bloque").selectOption("180");
    await page.getByLabel("Series", { exact: true }).selectOption("3");
    await page.getByLabel("Peso kg", { exact: true }).fill("abc");
    await page.getByLabel("Repeticiones", { exact: true }).selectOption("10");
    await page.getByLabel("Descanso", { exact: true }).selectOption("");
    await expect(
      page.getByText("Borrador guardado en este dispositivo", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Peso kg", { exact: true })).toHaveValue(
      "abc",
    );
    await expect(page.getByLabel("Descanso", { exact: true })).toHaveValue("");
    await page
      .getByRole("button", { name: "Guardar plantilla", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText("campos");
    await page.getByLabel("Peso kg", { exact: true }).fill("25");
    await page.getByLabel("Descanso", { exact: true }).selectOption("30");
    await page.screenshot({
      path: ".local/routine-catalog/editor-mobile.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: /Copiar semana 1 a/ })
      .click();
    await page.getByRole("button", { name: "Copiar a 3 semanas", exact: true }).click();
    await page
      .getByRole("button", { name: "Guardar plantilla", exact: true })
      .click();
    await expect(
      page.getByText("Plantilla guardada en tu catálogo.", { exact: true }),
    ).toBeVisible();
    const first = await a.client
      .from("routine_templates")
      .select("*")
      .eq("id", id)
      .single();
    expect(first.error).toBeNull();
    expect(first.data.document.weeks[0][0].blocks[0].macroRest).toBe(180);
    expect(
      first.data.document.weeks[3][0].blocks[0].exercises[0].prescription
        .microRest,
    ).toBe(30);
    await page.getByRole("link", { name: "Volver al catálogo" }).click();
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: ".local/routine-catalog/catalog-mobile.png",
      fullPage: true,
    });
    await page
      .getByRole("link")
      .filter({ has: page.getByRole("heading", { name, exact: true }) })
      .click();
    await page
      .getByRole("button", { name: "Editar plantilla", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Nombre de la rutina", exact: true })
      .fill(name + " avanzada");
    await page
      .getByRole("button", { name: "Guardar plantilla", exact: true })
      .click();
    await expect(
      page.getByText("Plantilla guardada en tu catálogo.", { exact: true }),
    ).toBeVisible();
    const saved = await a.client
      .from("routine_templates")
      .select("*")
      .eq("id", id)
      .single();
    expect(saved.data.revision).toBe(2);
    const stale = await a.client.rpc("save_library_entry", {
      command: {
        workspaceId: a.workspaceId,
        id,
        operationId: crypto.randomUUID(),
        expectedRevision: 1,
        kind: "template",
        payload: { document: first.data.document },
      },
    });
    expect(stale.error).not.toBeNull();
    const b = await accountClient(1);
    const foreignRead = await b.client
      .from("routine_templates")
      .select("id")
      .eq("id", id);
    expect(foreignRead.data).toEqual([]);
    const foreignWrite = await b.client.rpc("save_library_entry", {
      command: {
        workspaceId: b.workspaceId,
        id,
        operationId: crypto.randomUUID(),
        expectedRevision: 0,
        kind: "template",
        payload: { document: first.data.document },
      },
    });
    expect(foreignWrite.error).not.toBeNull();
    expect(
      (
        await a.client
          .from("routine_templates")
          .select("name,revision")
          .eq("id", id)
          .single()
      ).data,
    ).toMatchObject({ name: name + " avanzada", revision: 2 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    if (id) await adminClient().from("routine_templates").delete().eq("id", id);
  }
});

test("student routine copies are renamed and independent; returning from training keeps the workout open", async ({
  page,
}) => {
  const a = await prepared();
  let id = "";
  try {
    await login(page);
    await page.goto("/entrenar/" + a.studentId);
    await page.screenshot({
      path: ".local/routine-catalog/training-back.png",
      fullPage: false,
    });
    await page.getByRole("link", { name: "Volver a Hoy", exact: true }).click();
    await expect(page).toHaveURL(/\/hoy$/);
    await page.goto("/entrenar/" + a.studentId);
    await expect(
      page.getByRole("button", {
        name: "Finalizar entrenamiento",
        exact: true,
      }),
    ).toBeVisible();
    await page.goto("/alumnos/" + a.studentId);
    await page
      .getByRole("button", { name: "Guardar como plantilla", exact: true })
      .click();
    const name = "Copia propia " + a.studentId.slice(0, 8);
    await page
      .getByRole("textbox", { name: "Nombre de la plantilla", exact: true })
      .fill(name);
    await page
      .getByRole("button", { name: "Continuar con la copia", exact: true })
      .click();
    await expect(
      page.getByRole("textbox", { name: "Nombre de la rutina", exact: true }),
    ).toHaveValue(name);
    id = page.url().split("/").at(-1)!;
    await page.getByLabel("Peso kg", { exact: true }).fill("55");
    await page
      .getByRole("button", { name: "Guardar plantilla", exact: true })
      .click();
    await expect(
      page.getByText("Plantilla guardada en tu catálogo.", { exact: true }),
    ).toBeVisible();
    const template = await a.client
      .from("routine_templates")
      .select("document")
      .eq("id", id)
      .single();
    const assigned = await a.client
      .from("routine_revisions")
      .select("document")
      .eq("id", a.snapshot.routine.id)
      .single();
    expect(template.data?.document.name).toBe(name);
    const copied = template.data?.document.weeks[0][0].blocks[0].exercises[0];
    const original = assigned.data?.document.weeks[0][0].blocks[0].exercises[0];
    expect(copied.prescription.weight).toBe(55);
    expect(original.prescription.weight).toBe(20);
    expect(copied.id).not.toBe(original.id);
    expect(copied.lineageId).not.toBe(original.lineageId);
    await page.goto("/rutinas/" + a.studentId);
    await expect(page).toHaveURL(
      new RegExp("/alumnos/" + a.studentId + "/rutina$"),
    );
    await expect(
      page.getByRole("link", { name: "Alumnos", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await page.getByRole("link", { name: "Nueva rutina", exact: true }).click();
    await page
      .getByRole("combobox", { name: "Punto de partida", exact: true })
      .selectOption(id);
    await page
      .getByRole("button", { name: "Crear rutina", exact: true })
      .click();
    await expect(page.getByLabel("Peso kg", { exact: true })).toHaveValue("55");
    await page.getByLabel("Peso kg", { exact: true }).fill("60");
    await page
      .getByRole("button", { name: "Guardar borrador", exact: true })
      .click();
    await expect(
      page.getByText("Borrador guardado. Todavía no cambia la rutina activa.", {
        exact: true,
      }),
    ).toBeVisible();
    const unchanged = await a.client
      .from("routine_templates")
      .select("document")
      .eq("id", id)
      .single();
    expect(
      unchanged.data?.document.weeks[0][0].blocks[0].exercises[0].prescription
        .weight,
    ).toBe(55);
  } finally {
    if (id) await adminClient().from("routine_templates").delete().eq("id", id);
    await dropFixture(a.studentId);
  }
});

test("lost save acknowledgement retries once; a conflicting edit survives as a separate template", async ({
  page,
}) => {
  const a = await accountClient();
  const ids: string[] = [];
  try {
    await login(page);
    await page.goto("/rutinas");
    await page
      .getByRole("button", { name: "Crear plantilla", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Nombre de la rutina", exact: true })
      .fill("Guardado interrumpido");
    const id = page.url().split("/").at(-1)!;
    ids.push(id);
    await page.route(
      "**/rest/v1/rpc/save_library_entry",
      async (route) => {
        const response = await route.fetch();
        expect(response.ok()).toBe(true);
        await route.abort("failed");
      },
      { times: 1 },
    );
    await page
      .getByRole("button", { name: "Guardar plantilla", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Reintentar guardado", exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("textbox", { name: "Nombre de la rutina", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Reintentar guardado", exact: true })
      .click();
    await expect(
      page.getByText("Plantilla guardada en tu catálogo.", { exact: true }),
    ).toBeVisible();
    const first = await a.client
      .from("routine_templates")
      .select("*")
      .eq("id", id)
      .single();
    expect(first.data.revision).toBe(1);
    await page
      .getByRole("button", { name: "Editar plantilla", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Nombre de la rutina", exact: true })
      .fill("Mi cambio local");
    const remote = {
      ...first.data.document,
      name: "Cambio en otro dispositivo",
    };
    const changed = await a.client.rpc("save_library_entry", {
      command: {
        workspaceId: a.workspaceId,
        operationId: crypto.randomUUID(),
        id,
        expectedRevision: 1,
        kind: "template",
        payload: { document: remote },
      },
    });
    expect(changed.error).toBeNull();
    await page
      .getByRole("button", { name: "Guardar plantilla", exact: true })
      .click();
    await expect(
      page.getByText("La plantilla cambió en otro dispositivo.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Nombre de la rutina", exact: true }),
    ).toHaveValue("Mi cambio local");
    await page
      .getByRole("button", {
        name: "Continuar como otra plantilla",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("textbox", { name: "Nombre de la rutina", exact: true }),
    ).toHaveValue("Mi cambio local (copia)");
    ids.push(page.url().split("/").at(-1)!);
    await page
      .getByRole("button", { name: "Guardar plantilla", exact: true })
      .click();
    await expect(
      page.getByText("Plantilla guardada en tu catálogo.", { exact: true }),
    ).toBeVisible();
    expect(
      (
        await a.client
          .from("routine_templates")
          .select("name,revision")
          .eq("id", id)
          .single()
      ).data,
    ).toEqual({ name: remote.name, revision: 2 });
  } finally {
    for (const id of ids)
      await adminClient().from("routine_templates").delete().eq("id", id);
  }
});
