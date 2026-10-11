import { test, expect } from "@playwright/test";
import { prepared } from "../fixtures/prepared";
import { accounts, dropFixture } from "../fixtures/cloud";
test("installed production shell starts fully offline and preserves training edits", async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  const a = await prepared();
  try {
    await page.goto("/hoy");
    await page.getByLabel("Email").fill(accounts[0].email);
    await page
      .getByLabel("Contraseña", { exact: true })
      .fill(accounts[0].password);
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await expect(page.getByRole("navigation")).toBeVisible();
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.goto("/entrenar/" + a.studentId);
    await expect(page.getByLabel("Peso kg")).toHaveValue("20");
    await context.setOffline(true);
    await page.getByText("Editar objetivos", { exact: true }).click();
    await page.getByLabel("Peso kg").fill("37,5");
    await page.getByLabel("Peso kg").blur();
    await expect(page.locator(".save-indicator")).toContainText(
      "Guardado en este dispositivo",
    );
    await page.reload();
    await expect(page.getByLabel("Peso kg")).toHaveValue("37.5");
    await expect(page.locator(".save-indicator")).toContainText(
      "Guardado en este dispositivo",
    );
    const cached = await page.evaluate(async () => {
      const keys = await caches.keys();
      return (
        await Promise.all(
          keys.map(async (key) =>
            (await (await caches.open(key)).keys()).map((r) => r.url),
          ),
        )
      ).flat();
    });
    expect(
      cached.some((u) => u.includes("54341") || u.includes("/auth/")),
    ).toBe(false);
    await context.setOffline(false);
    await page.getByRole("button", { name: "Reintentar guardado" }).click();
    await page.goto("/entrenar/" + a.studentId);
    await expect(page.getByText("Guardado", { exact: true })).toBeVisible({
      timeout: 45000,
    });
  } finally {
    await context.setOffline(false);
    await dropFixture(a.studentId);
  }
});
