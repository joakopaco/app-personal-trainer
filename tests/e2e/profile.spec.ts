import { test, expect } from "@playwright/test";
import { accounts, accountClient, adminClient } from "../fixtures/cloud";

test("profile edits persist privately and settings contain only account controls", async ({
  page,
}) => {
  const a = await accountClient(),
    b = await accountClient(1);
  const prior = await a.client.from("profiles").select("display_name").single();
  const name = "Entrenador " + crypto.randomUUID().slice(0, 8);
  try {
    await page.goto("/ajustes");
    await page.getByLabel("Email", { exact: true }).fill(accounts[0].email);
    await page
      .getByLabel("Contraseña", { exact: true })
      .fill(accounts[0].password);
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Mi perfil" }),
    ).toBeVisible();
    await expect(page.locator('a[href="/sincronizacion"]')).toHaveCount(0);
    await page.getByLabel("Nombre", { exact: true }).fill(name);
    await page.getByRole("button", { name: "Guardar datos" }).click();
    await expect(page.getByText("Perfil guardado.")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Nombre", { exact: true })).toHaveValue(name);
    expect(
      (await b.client.from("profiles").select("id").eq("id", a.userId)).data,
    ).toEqual([]);
    expect(
      (await a.client.rpc("update_my_profile", { p_display_name: " " })).error,
    ).toBeTruthy();
    await expect(
      page.getByRole("heading", { name: "Centro de sincronización" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Exportar pendientes" }),
    ).toHaveCount(0);
    await expect(page.getByLabel("Email", { exact: true })).toHaveAttribute(
      "readonly",
      "",
    );
    await page.getByRole("button", { name: "Cambiar contraseña" }).click();
    await page
      .getByLabel("Contraseña actual", { exact: true })
      .fill(accounts[0].password);
    await page
      .getByLabel("Nueva contraseña", { exact: true })
      .fill(accounts[0].password + "N1");
    await page.getByLabel("Repetí la nueva contraseña").fill("Diferente1");
    await page.getByRole("button", { name: "Guardar contraseña" }).click();
    await expect(page.getByText("Las contraseñas no coinciden.")).toBeVisible();
    await page
      .getByLabel("Repetí la nueva contraseña")
      .fill(accounts[0].password + "N1");
    await page.getByRole("button", { name: "Guardar contraseña" }).click();
    await expect(
      page.getByText("Contraseña actualizada.", { exact: false }),
    ).toBeVisible();
    const login = await b.client.auth.signInWithPassword({
      email: accounts[0].email,
      password: accounts[0].password + "N1",
    });
    expect(login.error).toBeNull();
  } finally {
    await adminClient().auth.admin.updateUserById(a.userId, {
      password: accounts[0].password,
    });
    await adminClient()
      .from("profiles")
      .update({ display_name: prior.data?.display_name ?? "" })
      .eq("id", a.userId);
  }
});
