import { test, expect } from "@playwright/test";
import { accounts, adminClient } from "../fixtures/cloud";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";

test("private operator provisions a gym and first login requires a new password", async ({
  page,
  browser,
}) => {
  const service = adminClient(),
    email = `onboarding-${randomUUID()}@example.test`;
  let gymId: string | undefined, userId: string | undefined;
  const other = await browser.newContext();
  mkdirSync(".local/screens/gym", { recursive: true });
  await service
    .from("platform_operators")
    .upsert({ user_id: accounts[0].userId });
  try {
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(accounts[0].email);
    await page
      .getByLabel("Contraseña", { exact: true })
      .fill(accounts[0].password);
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await expect(
      page.getByRole("navigation", { name: "Principal" }),
    ).toBeVisible();
    await page.goto("/administracion");
    await page.getByRole("button", { name: "Agregar gimnasio" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nombre del gimnasio").fill("Horizonte Onboarding");
    await dialog.getByLabel("Email", { exact: true }).fill(email);
    await dialog
      .getByRole("button", { name: "Crear cuenta", exact: true })
      .click();
    const password = await dialog
      .getByLabel("Contraseña temporal")
      .inputValue();
    expect(password.length).toBeGreaterThanOrEqual(12);
    // Never capture temporary credentials.
    await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();
    const account = await service
      .from("gym_accounts")
      .select("gym_id,user_id")
      .eq("email", email)
      .single();
    gymId = account.data!.gym_id;
    userId = account.data!.user_id;
    await page.screenshot({ path: ".local/screens/gym/private-admin.png" });
    const gym = await other.newPage();
    await gym.goto("/login");
    await gym.getByLabel("Tipo de cuenta").selectOption("gym");
    await gym.getByLabel("Email", { exact: true }).fill(email);
    await gym.getByLabel("Contraseña", { exact: true }).fill(password);
    await gym.getByRole("button", { name: "Ingresar", exact: true }).click();
    await expect(
      gym.getByRole("heading", { name: "Elegí tu nueva contraseña" }),
    ).toBeVisible();
    await gym.goto("/gimnasio/rutinas");
    await expect(
      gym.getByRole("heading", { name: "Elegí tu nueva contraseña" }),
    ).toBeVisible();
    await expect(
      gym.getByRole("link", { name: "Rutinas", exact: true }),
    ).toHaveCount(0);
    await gym.setViewportSize({ width: 375, height: 812 });
    await gym.screenshot({ path: ".local/screens/gym/first-login-phone.png" });
    const newPassword = `Changed!${randomUUID()}Aa1`;
    await gym.getByLabel("Nueva contraseña", { exact: true }).fill(newPassword);
    await gym.getByLabel("Repetí la contraseña").fill(newPassword);
    await gym.getByRole("button", { name: "Guardar nueva contraseña" }).click();
    await expect(
      gym.getByRole("link", { name: "Entrenados", exact: true }),
    ).toBeVisible();
    await gym.reload();
    await expect(
      gym.getByRole("link", { name: "Entrenados", exact: true }),
    ).toBeVisible();
  } finally {
    await other.close();
    await service
      .from("platform_operators")
      .delete()
      .eq("user_id", accounts[0].userId);
    if (!userId) {
      const account = await service
        .from("gym_accounts")
        .select("gym_id,user_id")
        .eq("email", email)
        .maybeSingle();
      gymId = account.data?.gym_id;
      userId = account.data?.user_id;
    }
    if (gymId) await service.from("gyms").delete().eq("id", gymId);
    if (userId) await service.auth.admin.deleteUser(userId);
  }
});
