import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { gymFixture } from "../fixtures/gym";
import { adminClient } from "../fixtures/cloud";

test("lost account response can be recovered after reload without recreating identity", async ({
  page,
}) => {
  const f = await gymFixture(),
    email = `recovery-${randomUUID()}@example.test`;
  try {
    await page.goto("/");
    await page.getByLabel("Email", { exact: true }).fill(f.accounts[0].email);
    await page
      .getByLabel("Contraseña", { exact: true })
      .fill(f.accounts[0].password);
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await page.getByRole("link", { name: "Entrenados", exact: true }).click();
    await page.getByRole("button", { name: "Agregar entrenado" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nombre", { exact: true }).fill("Alta");
    await dialog.getByLabel("Apellido", { exact: true }).fill("recuperable");
    await dialog.getByLabel("Email").fill(email);
    await page.route(
      "**/functions/v1/gym-accounts",
      async (route) => {
        await route.fetch();
        await route.abort("failed");
      },
      { times: 1 },
    );
    await dialog
      .getByRole("button", { name: "Crear cuenta", exact: true })
      .click();
    await expect(dialog.getByRole("alert")).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: "Agregar entrenado" }).click();
    await expect(page.getByRole("dialog").getByLabel("Email")).toHaveValue(
      email,
    );
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Crear cuenta", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Alta recuperable" }),
    ).toBeVisible();
  } finally {
    const admin = adminClient();
    const { data } = await admin
      .from("gym_accounts")
      .select("user_id")
      .eq("email", email);
    for (const row of data || [])
      await admin.auth.admin.deleteUser(row.user_id);
    await f.cleanup();
  }
});

test("saving a new routine retries a lost response without creating a second draft", async ({
  page,
}) => {
  const f = await gymFixture();
  try {
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(f.accounts[0].email);
    await page
      .getByLabel("Contraseña", { exact: true })
      .fill(f.accounts[0].password);
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Gimnasio Horizonte", exact: true }),
    ).toBeVisible();
    await page.goto("/gimnasio/rutinas/nueva");
    await page.getByLabel("Nombre de la rutina").fill("Borrador recuperable");
    await page.route(
      "**/rest/v1/rpc/gym_command",
      async (route) => {
        await route.fetch();
        await route.abort("failed");
      },
      { times: 1 },
    );
    await page
      .getByRole("button", { name: "Guardar borrador", exact: true })
      .click();
    await expect(page.getByRole("alert")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Nombre de la rutina")).toHaveValue(
      "Borrador recuperable",
    );
    await page
      .getByRole("button", { name: "Guardar borrador", exact: true })
      .click();
    await expect(page).not.toHaveURL(/\/nueva$/);
    const drafts = await f.accounts[0].client
      .from("gym_routines")
      .select("id")
      .eq("name", "Borrador recuperable");
    expect(drafts.data).toHaveLength(1);
  } finally {
    await f.cleanup();
  }
});

test("training conflict can load saved results after explicitly discarding the local edit", async ({
  page,
}) => {
  const f = await gymFixture();
  const rpc = async (kind: string, payload: object) => {
    const result = await f.accounts[1].client.rpc("gym_command", {
      command: { operationId: randomUUID(), kind, payload },
    });
    if (result.error) throw result.error;
    return result.data;
  };
  try {
    await rpc("select_routine", { revisionId: f.revisionId });
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(f.accounts[1].email);
    await page
      .getByLabel("Contraseña", { exact: true })
      .fill(f.accounts[1].password);
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await page.getByRole("button", { name: "Empezar entrenamiento" }).click();
    const weight = page.getByLabel("Peso serie 1 de Sentadilla goblet");
    await weight.fill("12");
    const session = (
      await f.accounts[1].client
        .from("gym_sessions")
        .select("*")
        .eq("status", "open")
        .single()
    ).data!;
    await rpc("save_session", {
      id: session.id,
      expectedRevision: session.revision,
      results: [
        {
          positionId: session.day.blocks[0].exercises[0].id,
          skipped: false,
          sets: [{ weight: 15, reps: 10, durationSec: null, confirmed: true }],
        },
      ],
    });
    await page.getByRole("button", { name: "Guardar entrenamiento" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await page
      .getByRole("button", { name: "Revisar versión guardada" })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByText(/Se descartará la edición local/),
    ).toBeVisible();
    await dialog
      .getByRole("button", { name: "Usar versión guardada", exact: true })
      .click();
    await expect(weight).toHaveValue("15");
    await expect(weight).toBeEnabled();
    await weight.fill("17");
    await page.getByRole("button", { name: "Guardar entrenamiento" }).click();
    await expect(page.getByText("Guardado", { exact: true })).toBeVisible();
  } finally {
    await f.cleanup();
  }
});
