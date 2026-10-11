import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { gymFixture } from "../fixtures/gym";

test("gym editor recovers invalid numeric text and requires an explicit choice for stale drafts", async ({
  page,
}) => {
  const f = await gymFixture();
  try {
    const client = f.accounts[0].client;
    const { data: routine, error } = await client
      .from("gym_routines")
      .select("id")
      .single();
    if (error) throw error;
    const key = `pulso-gym-editor:${f.accounts[0].userId}:${routine.id}:`;
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(f.accounts[0].email);
    await page
      .getByLabel("Contraseña", { exact: true })
      .fill(f.accounts[0].password);
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Gimnasio Horizonte", exact: true }),
    ).toBeVisible();
    await page.goto(`/gimnasio/rutinas/${routine.id}`);
    await page.getByLabel("Peso kg", { exact: true }).fill("1,");
    await expect
      .poll(() =>
        page.evaluate((key) => {
          const draft = JSON.parse(localStorage.getItem(key) || "{}");
          return Object.values(draft.rawValues || {}).includes("1,");
        }, key),
      )
      .toBe(true);
    await page.reload();
    await expect(page.getByLabel("Peso kg", { exact: true })).toHaveValue("1,");
    await expect(page.getByLabel("Peso kg", { exact: true })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await page
      .getByRole("button", { name: "Guardar borrador", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText("valores numéricos");

    const editable = await client.rpc("gym_edit_routine", {
      routine_id: routine.id,
    });
    if (editable.error) throw editable.error;
    editable.data.document.name = "Actualizada desde otra sesión";
    const saved = await client.rpc("gym_command", {
      command: {
        operationId: randomUUID(),
        kind: "save_routine",
        payload: {
          id: routine.id,
          expectedRevision: editable.data.revision,
          document: editable.data.document,
        },
      },
    });
    if (saved.error) throw saved.error;
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Tenés dos versiones de esta rutina" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Guardar borrador", exact: true }),
    ).toBeDisabled();
    const downloadEvent = page.waitForEvent("download");
    await page.getByRole("button", { name: "Exportar copia local" }).click();
    expect((await downloadEvent).suggestedFilename()).toBe(
      `pulso-rutina-${routine.id}.json`,
    );
    await page.getByRole("button", { name: "Revisar mis cambios" }).click();
    await expect(page.getByLabel("Peso kg", { exact: true })).toHaveValue("1,");
    await page.getByLabel("Peso kg", { exact: true }).fill("25");
    await page
      .getByRole("button", { name: "Guardar borrador", exact: true })
      .click();
    await expect(
      page.getByText("Borrador guardado. Publicalo cuando esté listo."),
    ).toBeVisible();
    const final = await client.rpc("gym_edit_routine", {
      routine_id: routine.id,
    });
    expect(
      final.data.document.weeks[0][0].blocks[0].exercises[0].prescription
        .weight,
    ).toBe(25);
  } finally {
    await f.cleanup();
  }
});
