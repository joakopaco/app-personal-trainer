import { test, expect } from "@playwright/test";
import { accounts } from "../fixtures/cloud";
import { mkdirSync } from "node:fs";
test("production admin login loads its styles and fits desktop and mobile", async ({
  page,
}) => {
  mkdirSync(".local/screens/platform-login", { recursive: true });
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/administracion");
    await expect(page.getByLabel("Usuario", { exact: true })).toBeVisible();
    await expect(page.locator(".platform-auth")).toHaveCSS("display", "grid");
    const card = await page.locator(".platform-auth-card").boundingBox();
    expect(card!.width).toBeLessThanOrEqual(480);
    expect(card!.x).toBeGreaterThanOrEqual(12);
    expect(card!.x + card!.width).toBeLessThanOrEqual(width - 12);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.local/screens/platform-login/production-${width}.png`,
      fullPage: true,
    });
  }
});
test("administrative navigation bypasses the trainer offline shell", async ({
  page,
  context,
}) => {
  await page.goto("/hoy");
  await page.getByLabel("Email", { exact: true }).fill(accounts[0].email);
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill(accounts[0].password);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(
    page.getByRole("navigation", { name: "Principal" }),
  ).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await page.goto("/administracion");
  await expect(page.getByLabel("Usuario", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Email", { exact: true })).toHaveCount(0);
  await context.setOffline(true);
  await expect(page.goto("/administracion")).rejects.toThrow();
});
