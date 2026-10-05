import { test, expect } from "@playwright/test";
import { operatorFixture } from "../fixtures/operator";
import { accounts } from "../fixtures/cloud";

test("private portal uses username, forces initial password and isolates customer sessions", async ({
  page,
  context,
  browserName,
}) => {
  test.setTimeout(60000);
  const op = await operatorFixture(true);
  try {
    await page.goto("http://127.0.0.1:5173/administracion");
    await expect(page.getByLabel("Usuario", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Email", { exact: true })).toHaveCount(0);
    await page.getByLabel("Usuario", { exact: true }).fill(op.username);
    await page.getByLabel("Contraseña", { exact: true }).fill(op.password);
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Elegí tu contraseña" }),
    ).toBeVisible();
    const next = "Private!" + crypto.randomUUID() + "Aa1";
    await page
      .getByLabel("Contraseña actual", { exact: true })
      .fill(op.password);
    await page.getByLabel("Nueva contraseña", { exact: true }).fill(next);
    await page.getByLabel("Repetí la nueva contraseña").fill(next);
    await page.getByRole("button", { name: "Guardar contraseña" }).click();
    await expect(
      page.getByRole("heading", { name: "Gimnasios", exact: true }),
    ).toBeVisible();
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.getByRole("button", { name: "Agregar gimnasio" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      const verified = page.waitForResponse((r) =>
        r.url().includes("/rpc/platform_access"),
      );
      await page.evaluate(() =>
        window.dispatchEvent(new Event("visibilitychange")),
      );
      await verified;
      await expect(page.getByRole("dialog")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `.local/screens/platform/${browserName}-create-${width}.png`,
        fullPage: true,
      });
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
    const customer = await context.newPage();
    await customer.goto("http://127.0.0.1:5173/login");
    await customer.getByLabel("Email", { exact: true }).fill(accounts[0].email);
    await customer
      .getByLabel("Contraseña", { exact: true })
      .fill(accounts[0].password);
    await customer
      .getByRole("button", { name: "Ingresar", exact: true })
      .click();
    await expect(
      customer.getByRole("navigation", { name: "Principal" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await expect(page.getByLabel("Usuario", { exact: true })).toBeVisible();
    await customer.reload();
    await expect(
      customer.getByRole("navigation", { name: "Principal" }),
    ).toBeVisible();
    await customer.goto("http://127.0.0.1:5173/administracion");
    await expect(
      customer.getByRole("button", { name: "Agregar gimnasio" }),
    ).toHaveCount(0);
    await expect(customer.getByLabel("Usuario", { exact: true })).toBeVisible();
    await expect(customer.getByLabel("Email", { exact: true })).toHaveCount(0);
    await customer.close();
  } finally {
    await op.cleanup();
  }
});
