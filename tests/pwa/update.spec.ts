import { test, expect } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { prepared } from "../fixtures/prepared";
import { accounts, dropFixture } from "../fixtures/cloud";
test("service worker update waits for pending edits and leaves private cache intact", async ({
  page,
}) => {
  test.setTimeout(90000);
  const a = await prepared();
  const path = "apps/web/dist/sw.js",
    original = readFileSync(path, "utf8");
  try {
    await page.goto("/hoy");
    await page.getByLabel("Email").fill(accounts[0].email);
    await page
      .getByLabel("Contraseña", { exact: true })
      .fill(accounts[0].password);
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await expect(page.getByRole("navigation")).toBeVisible();
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await page.goto("/entrenar/" + a.studentId);
    await page.route("http://127.0.0.1:54341/**", (r) => r.abort());
    await page.getByLabel("Peso kg").fill("48");
    await page.getByLabel("Peso kg").blur();
    await expect(page.getByRole("status")).toContainText(
      "pendiente de sincronizar",
    );
    writeFileSync(path, original + "\n// update-test " + Date.now());
    await page.evaluate(async () => {
      const r = await navigator.serviceWorker.getRegistration();
      await r!.update();
    });
    await page.getByRole("button", { name: "Actualizar ahora" }).click();
    await expect(
      page.getByText("Guardá y sincronizá los pendientes antes de actualizar."),
    ).toBeVisible();
    await expect(page.getByLabel("Peso kg")).toHaveValue("48");
    await page.unroute("http://127.0.0.1:54341/**");
    await page.getByRole("link", { name: "Ajustes", exact: true }).click();
    await page
      .getByRole("button", { name: "Reintentar sincronización" })
      .click();
    await expect(
      page.getByText("No hay operaciones de entrenamiento pendientes."),
    ).toBeVisible({ timeout: 45000 });
    const reloaded = page.waitForEvent("load");
    await page.getByRole("button", { name: "Actualizar ahora" }).click();
    await reloaded;
    await expect(
      page.getByRole("heading", { name: "Ajustes", exact: true }),
    ).toBeVisible();
    await page.goto("/entrenar/" + a.studentId);
    await expect(page.getByLabel("Peso kg")).toHaveValue("48");
  } finally {
    writeFileSync(path, original);
    await dropFixture(a.studentId);
  }
});
