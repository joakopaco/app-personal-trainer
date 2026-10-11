import { test, expect, type Page } from "@playwright/test";
import { gymFixture, gymDocument } from "../fixtures/gym";
import { adminClient } from "../fixtures/cloud";
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

test("gym overview counts open sessions outside recent activity and settings work at desktop/mobile", async ({
  page,
}) => {
  test.setTimeout(90000);
  const f = await gymFixture();
  mkdirSync(".local/screens/gym-parity", { recursive: true });
  try {
    const base = {
      gym_id: f.gym.id,
      member_id: f.accounts[1].userId,
      routine_revision_id: f.revisionId,
      routine_name: "Fuerza inicial",
      week: 0,
      day: gymDocument().weeks[0][0],
    };
    const seeded = await adminClient()
      .from("gym_sessions")
      .insert([
        { ...base, started_at: "2026-10-01T15:00:00Z", status: "open" },
        ...Array.from({ length: 9 }, () => ({
          ...base,
          started_at: "2026-10-10T15:00:00Z",
          finished_at: "2026-10-10T16:00:00Z",
          status: "finished",
        })),
      ]);
    if (seeded.error) throw seeded.error;
    await login(page, f.accounts[0]);
    await expect(
      page
        .locator(".gym-stats .card")
        .filter({ hasText: "Entrenando ahora" })
        .locator("strong"),
    ).toHaveText("1");
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/gimnasio/ajustes");
      await expect(
        page.getByRole("button", { name: "Cerrar sesión", exact: true }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `.local/screens/gym-parity/settings-${width}.png`,
        fullPage: true,
      });
      await page
        .getByRole("button", { name: "Cambiar contraseña", exact: true })
        .click();
      await expect(
        page
          .getByRole("dialog")
          .getByLabel("Nueva contraseña", { exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Cerrar", exact: true }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await page.goto(`/gimnasio/entrenados/${f.accounts[1].userId}`);
      const buttons = page.locator(".gym-profile-nav .button");
      await expect(buttons).toHaveCount(3);
      const heights = await buttons.evaluateAll((nodes) =>
        nodes.map((n) => n.getBoundingClientRect().height),
      );
      expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(1);
      await page.screenshot({
        path: `.local/screens/gym-parity/profile-${width}.png`,
        fullPage: true,
      });
    }
  } finally {
    await f.cleanup();
  }
});

test("transient access errors keep trainee editing mounted; progress has local dates and equal export controls", async ({
  page,
}) => {
  test.setTimeout(90000);
  const f = await gymFixture();
  try {
    await f.accounts[1].client.rpc("gym_command", {
      command: {
        operationId: crypto.randomUUID(),
        kind: "select_routine",
        payload: { revisionId: f.revisionId },
      },
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, f.accounts[1]);
    await page
      .getByRole("button", { name: "Empezar entrenamiento", exact: true })
      .click();
    await page
      .getByLabel("Peso serie 1 de Sentadilla goblet", { exact: true })
      .fill("25");
    await page.route(
      "**/rest/v1/rpc/gym_access",
      (route) =>
        route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            message: "Conexión temporalmente no disponible",
          }),
        }),
      { times: 1 },
    );
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(
      page.getByText(/No pudimos actualizar tu acceso/),
    ).toBeVisible();
    await expect(
      page.getByLabel("Peso serie 1 de Sentadilla goblet", { exact: true }),
    ).toHaveValue("25");
    await page
      .getByRole("button", { name: "Reintentar conexión", exact: true })
      .click();
    await expect(page.getByText(/No pudimos actualizar tu acceso/)).toHaveCount(
      0,
    );
    await page.getByLabel("Confirmar serie 1 de Sentadilla goblet").check();
    await page
      .getByRole("button", { name: "Guardar entrenamiento", exact: true })
      .click();
    await expect(page.getByText("Guardado", { exact: true })).toBeVisible();
    await page.reload();
    await expect(
      page.getByLabel("Peso serie 1 de Sentadilla goblet", { exact: true }),
    ).toHaveValue("25");
    await page
      .getByRole("button", { name: "Finalizar entrenamiento", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirmar finalización", exact: true })
      .click();
    await expect(page).toHaveURL(/\/mi-entrenamiento$/);
    await page.getByRole("link", { name: "Progreso", exact: true }).click();
    await expect(page.getByText("250 kg", { exact: true })).toBeVisible();
    await page.getByLabel("Desde", { exact: true }).fill("2027-01-01");
    await page.getByLabel("Hasta", { exact: true }).fill("2026-01-01");
    await expect(page.getByRole("alert")).toContainText("Desde");
    await expect(
      page.getByRole("button", { name: "Exportar progreso" }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Todo el historial" }).click();
    await page.getByRole("button", { name: "Exportar progreso" }).click();
    const buttons = page.locator(".document-toolbar .row .button");
    await expect(buttons).toHaveCount(2);
    const heights = await buttons.evaluateAll((nodes) =>
      nodes.map((n) => n.getBoundingClientRect().height),
    );
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(1);
    const downloaded = page.waitForEvent("download");
    await page.getByRole("button", { name: "Descargar CSV" }).click();
    expect((await downloaded).suggestedFilename()).toBe("pulso-progreso.csv");
  } finally {
    await f.cleanup();
  }
});
