import { test, expect, type Page } from "@playwright/test";
import { gymFixture } from "../fixtures/gym";
import { accounts, adminClient } from "../fixtures/cloud";
import { mkdirSync } from "node:fs";

async function login(page: Page, account: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByLabel("Contraseña", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(
    page.getByRole("navigation", { name: "Principal" }),
  ).toBeVisible();
}

async function capture(page: Page, name: string) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `.local/screens/account-controls/${name}.png`,
    scale: "css",
  });
}

test("gym account controls: visible errors, retry, suspension and reactivation on narrow and wide screens", async ({
  page,
  browser,
}) => {
  test.setTimeout(90000);
  mkdirSync(".local/screens/account-controls", { recursive: true });
  const f = await gymFixture(),
    service = adminClient();
  const operatorContext = await browser.newContext();
  await service
    .from("platform_operators")
    .upsert({ user_id: accounts[0].userId });
  try {
    await page.setViewportSize({ width: 320, height: 850 });
    await login(page, f.accounts[0]);
    await page.goto("/gimnasio/entrenados/" + f.accounts[1].userId);
    await page
      .getByRole("button", { name: "Suspender acceso", exact: true })
      .click();
    await page.route(
      "**/rest/v1/rpc/gym_command",
      (route) =>
        route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            message: "Servicio temporalmente no disponible",
          }),
        }),
      { times: 1 },
    );
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Confirmar", exact: true })
      .click();
    await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
    await capture(page, "member-suspension-error-320");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Confirmar", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Reactivar acceso", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Reactivar acceso", exact: true })
      .click();
    await expect(page.getByRole("dialog").getByRole("alert")).toHaveCount(0);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Confirmar", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Suspender acceso", exact: true }),
    ).toBeVisible();

    const operator = await operatorContext.newPage();
    await login(operator, accounts[0]);
    await operator.goto("/administracion");
    const card = operator
      .locator("article")
      .filter({ hasText: f.accounts[0].email });
    await expect(card).toBeVisible();
    for (const width of [320, 768, 1440]) {
      await operator.setViewportSize({ width, height: 850 });
      await capture(operator, `operator-${width}`);
      await operator
        .getByRole("button", { name: "Agregar gimnasio", exact: true })
        .click();
      await capture(operator, `create-gym-${width}`);
      await operator.keyboard.press("Escape");
      await expect(operator.getByRole("dialog")).toHaveCount(0);
    }
    await operator.setViewportSize({ width: 320, height: 850 });
    await card.getByRole("button", { name: "Suspender", exact: true }).click();
    await operator.route(
      "**/functions/v1/gym-accounts",
      (route) =>
        route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Servicio temporalmente no disponible",
          }),
        }),
      { times: 1 },
    );
    await operator
      .getByRole("dialog")
      .getByRole("button", { name: "Confirmar", exact: true })
      .click();
    await expect(operator.getByRole("dialog").getByRole("alert")).toBeVisible();
    await capture(operator, "gym-suspension-error-320");
    await operator
      .getByRole("dialog")
      .getByRole("button", { name: "Confirmar", exact: true })
      .click();
    await expect(
      card.getByRole("button", { name: "Reactivar", exact: true }),
    ).toBeVisible();
    await card.getByRole("button", { name: "Reactivar", exact: true }).click();
    await expect(operator.getByRole("dialog").getByRole("alert")).toHaveCount(
      0,
    );
    await operator
      .getByRole("dialog")
      .getByRole("button", { name: "Confirmar", exact: true })
      .click();
    await expect(
      card.getByRole("button", { name: "Suspender", exact: true }),
    ).toBeVisible();
    await card
      .getByRole("button", { name: "Restablecer acceso", exact: true })
      .click();
    await expect(operator.getByLabel("Contraseña temporal")).toHaveValue(
      /.{12,}/,
    );
    // Do not capture generated credentials.
    await operator.getByRole("button", { name: "Listo", exact: true }).click();
    await expect(operator.getByRole("dialog")).toHaveCount(0);
  } finally {
    await operatorContext.close();
    await service
      .from("platform_operators")
      .delete()
      .eq("user_id", accounts[0].userId);
    await f.cleanup();
  }
});
