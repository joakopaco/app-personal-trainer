import { test, expect } from "@playwright/test";
import { gymFixture } from "../fixtures/gym";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";

test("finish dialog exposes connection errors and keeps conflict recovery reachable", async ({
  page,
}) => {
  test.setTimeout(60000);
  mkdirSync(".local/screens/training-errors", { recursive: true });
  const engine = page.context().browser()!.browserType().name();
  const f = await gymFixture();
  try {
    await page.setViewportSize({ width: 320, height: 850 });
    await f.accounts[1].client.rpc("gym_command", {
      command: {
        operationId: randomUUID(),
        kind: "select_routine",
        payload: { revisionId: f.revisionId },
      },
    });
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(f.accounts[1].email);
    await page
      .getByLabel("Contraseña", { exact: true })
      .fill(f.accounts[1].password);
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await page
      .getByRole("button", { name: "Empezar entrenamiento", exact: true })
      .click();
    await page.getByLabel("Confirmar serie 1 de Sentadilla goblet").check();
    await page
      .getByRole("button", { name: "Finalizar entrenamiento", exact: true })
      .click();
    await page.route(
      "**/rest/v1/rpc/gym_command",
      (route) =>
        route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ message: "Sin conexión de prueba" }),
        }),
      { times: 1 },
    );
    await page
      .getByRole("button", { name: "Confirmar finalización", exact: true })
      .click();
    await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
    await page.screenshot({
      path: `.local/screens/training-errors/${engine}-finish-error.png`,
      scale: "css",
    });
    await page.route(
      "**/rest/v1/rpc/gym_command",
      (route) =>
        route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            code: "40001",
            message: "Conflicto de prueba",
          }),
        }),
      { times: 1 },
    );
    await page
      .getByRole("button", { name: "Confirmar finalización", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Revisar versión guardada", exact: true })
      .click();
    await page.route("**/rest/v1/gym_sessions*", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "Lectura no disponible" }),
      }),
    );
    await page
      .getByRole("button", { name: "Usar versión guardada", exact: true })
      .click();
    await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible({
      timeout: 20000,
    });
    await page.screenshot({
      path: `.local/screens/training-errors/${engine}-recovery-error.png`,
      scale: "css",
    });
    await page.unroute("**/rest/v1/gym_sessions*");
    await page
      .getByRole("button", { name: "Usar versión guardada", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByLabel("Confirmar serie 1 de Sentadilla goblet").check();
    await page
      .getByRole("button", { name: "Finalizar entrenamiento", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirmar finalización", exact: true })
      .click();
    await expect(page).toHaveURL(/\/mi-entrenamiento$/);
  } finally {
    await f.cleanup();
  }
});
