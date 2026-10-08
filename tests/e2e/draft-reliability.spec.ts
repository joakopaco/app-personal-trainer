import { test, expect, type Page } from "@playwright/test";
import { prepared } from "../fixtures/prepared";
import { accounts, dropFixture, command, execute } from "../fixtures/cloud";
import { readFile } from "node:fs/promises";

async function login(page: Page) {
  await page.goto("/hoy");
  await page.getByLabel("Email").fill(accounts[0].email);
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill(accounts[0].password);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page.getByRole("navigation")).toBeVisible();
}

async function failDraftWrites(page: Page) {
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      if (this.name === "meta" && value?.key?.startsWith("draft:"))
        throw new DOMException(
          "Injected storage failure",
          "QuotaExceededError",
        );
      return original.call(this, value, key);
    };
    (
      window as Window & { restoreDraftWrites?: () => void }
    ).restoreDraftWrites = () => {
      IDBObjectStore.prototype.put = original;
    };
  });
}

test("Back and Forward preserve the sole in-memory draft after storage fails", async ({
  page,
}) => {
  const a = await prepared();
  try {
    await login(page);
    await page.goto(`/alumnos/${a.studentId}/rutina`);
    await page
      .getByRole("button", { name: "Editar rutina", exact: true })
      .click();
    await expect(page.getByLabel("Nombre de la rutina")).toBeVisible();
    await failDraftWrites(page);
    await page.getByLabel("Nombre de la rutina").fill("Solo en memoria");
    await expect(
      page.getByText("Cambios sin guardar en este dispositivo", {
        exact: true,
      }),
    ).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("alert")).toContainText("antes de salir");
    await expect(page).toHaveURL(/borradores\/editar$/);
    await expect(page.getByLabel("Nombre de la rutina")).toHaveValue(
      "Solo en memoria",
    );
    const downloaded = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Descargar copia de recuperación" })
      .click();
    const download = await downloaded;
    const copy = JSON.parse(await readFile((await download.path())!, "utf8"));
    expect(copy.snapshot.doc.name).toBe("Solo en memoria");
    expect(copy.format).toBe("pulso-draft-recovery");
    await page.evaluate(() =>
      (
        window as Window & { restoreDraftWrites?: () => void }
      ).restoreDraftWrites?.(),
    );
    await page
      .getByRole("button", { name: "Reintentar guardado local", exact: true })
      .click();
    await expect(
      page.getByText("Borrador guardado en este dispositivo", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "Rutina actual", exact: true })
      .click();
    await page.goBack();
    await expect(page.getByLabel("Nombre de la rutina")).toHaveValue(
      "Solo en memoria",
    );
    await failDraftWrites(page);
    await page
      .getByLabel("Nombre de la rutina")
      .fill("Conservar también al avanzar");
    await expect(
      page.getByText("Cambios sin guardar en este dispositivo", {
        exact: true,
      }),
    ).toBeVisible();
    await page.goForward();
    await expect(page.getByRole("alert")).toContainText("antes de salir");
    await expect(page).toHaveURL(/borradores\/editar$/);
    await expect(page.getByLabel("Nombre de la rutina")).toHaveValue(
      "Conservar también al avanzar",
    );
  } finally {
    await dropFixture(a.studentId);
  }
});

test("local draft is discoverable and can reopen when its cloud query fails", async ({
  page,
}) => {
  const a = await prepared();
  try {
    await login(page);
    await page.goto(`/alumnos/${a.studentId}/borradores/editar`);
    await page.getByLabel("Nombre de la rutina").fill("Copia sin conexión");
    await expect(
      page.getByText("Borrador guardado en este dispositivo", { exact: true }),
    ).toBeVisible();
    await page.route("**/rest/v1/routine_drafts*", (route) => route.abort());
    await page.getByRole("link", { name: "Borradores", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Copia sin conexión" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Continuar borrador" }).click();
    await expect(page.getByLabel("Nombre de la rutina")).toHaveValue(
      "Copia sin conexión",
    );
    await page.reload();
    await expect(page.getByLabel("Nombre de la rutina")).toHaveValue(
      "Copia sin conexión",
    );
  } finally {
    await dropFixture(a.studentId);
  }
});

test("a second tab cannot overwrite a newer local draft", async ({
  page,
  context,
}) => {
  const a = await prepared();
  try {
    await login(page);
    const url = `/alumnos/${a.studentId}/borradores/editar`;
    await page.goto(url);
    await expect(page.getByLabel("Nombre de la rutina")).toBeVisible();
    const second = await context.newPage();
    await second.goto(url);
    await expect(second.getByLabel("Nombre de la rutina")).toBeVisible();
    await page
      .getByLabel("Nombre de la rutina")
      .fill("Versión primera pestaña");
    await expect(
      page.getByText("Borrador guardado en este dispositivo", { exact: true }),
    ).toBeVisible();
    await second
      .getByLabel("Nombre de la rutina")
      .fill("Versión segunda pestaña");
    await expect(second.getByRole("alert")).toContainText("otra pestaña");
    await expect(
      second.getByText("Cambios sin guardar en este dispositivo", {
        exact: true,
      }),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Nombre de la rutina")).toHaveValue(
      "Versión primera pestaña",
    );
    await second
      .getByRole("button", { name: "Conservar cambios como otra plantilla" })
      .click();
    await expect(second).toHaveURL(/rutinas\/plantillas\//);
    await expect(second.getByLabel("Nombre de la rutina")).toHaveValue(
      "Versión segunda pestaña",
    );
  } finally {
    await dropFixture(a.studentId);
  }
});

test("lost save and publish acknowledgements retry identical operations across reload", async ({
  page,
}) => {
  const a = await prepared();
  try {
    const session = a.snapshot.sessions[0];
    await execute(
      a.client,
      command(
        a.workspaceId,
        a.studentId,
        "finish_session",
        {
          sessionId: session.id,
          quickConfirmItemIds: session.items.map(
            (item: { id: string }) => item.id,
          ),
          allowEmpty: false,
        },
        a.snapshot.revision,
      ),
    );
    await login(page);
    await page.goto(`/alumnos/${a.studentId}/borradores/editar`);
    await page
      .getByLabel("Nombre de la rutina")
      .fill("Confirmación recuperada");
    const operations: Record<string, string[]> = {
      save_draft: [],
      publish_routine: [],
    };
    await page.route("**/rest/v1/rpc/apply_training_command", async (route) => {
      const { command: sent } = route.request().postDataJSON();
      if (!(sent.kind in operations)) return route.continue();
      operations[sent.kind].push(sent.operationId);
      if (operations[sent.kind].length === 1) {
        await route.fetch();
        await route.abort("failed");
      } else await route.continue();
    });
    await page
      .getByRole("button", { name: "Guardar borrador", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Reintentar guardado", exact: true }),
    ).toBeVisible();
    await page.reload();
    await page
      .getByRole("button", { name: "Reintentar guardado", exact: true })
      .click();
    await expect(
      page.getByText("Borrador guardado. Todavía no cambia la rutina activa."),
    ).toBeVisible();
    expect(operations.save_draft).toHaveLength(2);
    expect(new Set(operations.save_draft).size).toBe(1);
    await page
      .getByRole("button", { name: "Activar rutina", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Reintentar activación", exact: true }),
    ).toBeVisible();
    await page.reload();
    await page
      .getByRole("button", { name: "Reintentar activación", exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`/alumnos/${a.studentId}/rutina$`));
    expect(operations.publish_routine).toHaveLength(2);
    expect(new Set(operations.publish_routine).size).toBe(1);
    await page.getByRole("link", { name: "Borradores", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "No hay borradores pendientes" }),
    ).toBeVisible();
  } finally {
    await dropFixture(a.studentId);
  }
});
