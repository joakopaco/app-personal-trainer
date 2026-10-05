import { test, expect } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { prepared } from "../fixtures/prepared";
import { accounts, dropFixture } from "../fixtures/cloud";
test("shell updates silently without interrupting offline training and preserves saved values", async ({
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
    await expect(page.locator(".save-indicator")).toContainText(
      "Guardado en este dispositivo",
    );
    // Install a new shell while an offline training edit is outstanding.
    // Activation is automatic, but the current training view must not reload.
    const marker = "update-test-" + Date.now();
    writeFileSync(
      path,
      original.replace(/pulso-shell-[a-f0-9]+/, "pulso-shell-" + marker),
    );
    const changes = page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          navigator.serviceWorker.addEventListener(
            "controllerchange",
            () => resolve(),
            { once: true },
          );
        }),
    );
    await page.evaluate(async () => {
      await (await navigator.serviceWorker.getRegistration())!.update();
    });
    await changes;
    await expect(
      page.getByRole("button", { name: "Actualizar ahora" }),
    ).toHaveCount(0);
    await expect(page.getByText(/sincroniz/i)).toHaveCount(0);
    await expect(page.getByLabel("Peso kg")).toHaveValue("48");
    await page.unroute("http://127.0.0.1:54341/**");
    await page.getByRole("button", { name: "Reintentar guardado" }).click();
    await expect(page.getByText("Guardado", { exact: true })).toBeVisible({
      timeout: 45000,
    });
    await page.reload();
    await expect(
      page.getByRole("button", {
        name: "Finalizar entrenamiento",
        exact: true,
      }),
    ).toBeVisible();
    await page.goto("/entrenar/" + a.studentId);
    await expect(page.getByLabel("Peso kg")).toHaveValue("48");
  } finally {
    writeFileSync(path, original);
    await dropFixture(a.studentId);
  }
});
