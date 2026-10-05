import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { operatorFixture } from "../fixtures/operator";
import { gymFixture } from "../fixtures/gym";

async function capture(page: Page, name: string) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `.local/screens/admin-audit/${name}.png`,
    fullPage: true,
    mask: [page.getByLabel("Contraseña temporal", { exact: true })],
  });
}

test("compiled administration screens, dialogs and account actions fit every viewport", async ({
  page,
}) => {
  test.setTimeout(120000);
  mkdirSync(".local/screens/admin-audit", { recursive: true });
  const operator = await operatorFixture(true);
  let gym: Awaited<ReturnType<typeof gymFixture>> | undefined;
  try {
    await page.route("**/rest/v1/gyms?*", (r) => r.fulfill({ json: [] }));
    await page.goto("/administracion");
    await page.getByLabel("Usuario", { exact: true }).fill(operator.username);
    await page
      .getByLabel("Contraseña", { exact: true })
      .fill(operator.password);
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Elegí tu contraseña" }),
    ).toBeVisible();
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await capture(page, `password-${width}`);
    }
    const password = "Private!" + crypto.randomUUID() + "Aa1";
    await page
      .getByLabel("Contraseña actual", { exact: true })
      .fill(operator.password);
    await page.getByLabel("Nueva contraseña", { exact: true }).fill(password);
    await page.getByLabel("Repetí la nueva contraseña").fill(password);
    await page
      .getByRole("button", { name: "Guardar contraseña", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Gimnasios", exact: true }),
    ).toBeVisible();
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await capture(page, `dashboard-${width}`);
      await page
        .getByRole("button", { name: "Agregar gimnasio", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await capture(page, `create-${width}`);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
    await page.unroute("**/rest/v1/gyms?*");
    gym = await gymFixture();
    await page.reload();
    const card = page
      .locator("article")
      .filter({ hasText: gym.accounts[0].email });
    await expect(card).toBeVisible();
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await capture(page, `accounts-${width}`);
      await card
        .getByRole("button", { name: "Suspender", exact: true })
        .click();
      await capture(page, `suspend-${width}`);
      await page.keyboard.press("Escape");
    }
    await card.getByRole("button", { name: "Suspender", exact: true }).click();
    await page.route(
      "**/functions/v1/gym-accounts",
      (r) =>
        r.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Servicio temporalmente no disponible",
          }),
        }),
      { times: 1 },
    );
    await page.getByRole("button", { name: "Confirmar", exact: true }).click();
    await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
    await capture(page, "suspension-error-320");
    await page.getByRole("button", { name: "Confirmar", exact: true }).click();
    await expect(
      card.getByRole("button", { name: "Reactivar", exact: true }),
    ).toBeVisible();
    await card.getByRole("button", { name: "Reactivar", exact: true }).click();
    await capture(page, "reactivate-320");
    await page.getByRole("button", { name: "Confirmar", exact: true }).click();
    await expect(
      card.getByRole("button", { name: "Suspender", exact: true }),
    ).toBeVisible();
    await card
      .getByRole("button", { name: "Restablecer acceso", exact: true })
      .click();
    await expect(
      page.getByLabel("Contraseña temporal", { exact: true }),
    ).toHaveValue(/.{12,}/);
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await capture(page, `credentials-${width}`);
    }
    await page.getByRole("button", { name: "Listo", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Cerrar sesión", exact: true })
      .click();
    await expect(page.getByLabel("Usuario", { exact: true })).toBeVisible();
  } finally {
    await gym?.cleanup();
    await operator.cleanup();
  }
});
