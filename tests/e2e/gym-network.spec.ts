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
    await dialog.getByLabel("Nombre y apellido").fill("Alta recuperable");
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
