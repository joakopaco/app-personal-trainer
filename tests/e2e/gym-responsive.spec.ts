import { test, expect, type Page } from "@playwright/test";
import { gymFixture } from "../fixtures/gym";
import { mkdirSync } from "node:fs";

async function fits(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const overflow = await page
    .locator("main input:not([type=checkbox]),main select, .modal input")
    .evaluateAll((nodes) =>
      nodes
        .filter((n) => {
          const r = n.getBoundingClientRect(),
            p = n.parentElement!.getBoundingClientRect();
          return r.width > 0 && (r.left < p.left - 1 || r.right > p.right + 1);
        })
        .map((n) => n.outerHTML.slice(0, 120)),
    );
  expect(overflow).toEqual([]);
}
test("gym screens fit 320, 375, 390 and tablet; modals and existing editor remain usable", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const f = await gymFixture();
  mkdirSync(".local/screens/gym", { recursive: true });
  try {
    await page.goto("/");
    await page.getByLabel("Tipo de cuenta").selectOption("gym");
    await page.getByLabel("Email", { exact: true }).fill(f.accounts[0].email);
    await page
      .getByLabel("Contraseña", { exact: true })
      .fill(f.accounts[0].password);
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Gimnasio Horizonte", exact: true }),
    ).toBeVisible();
    for (const width of [320, 375, 390, 820]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [path, name] of [
        ["/gimnasio", "dashboard"],
        ["/gimnasio/entrenados", "members"],
        ["/gimnasio/rutinas", "catalog"],
        ["/gimnasio/ajustes", "settings"],
        ["/gimnasio/rutinas/nueva", "editor"],
      ]) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await fits(page);
        await page.screenshot({
          path: `.local/screens/gym/${info.project.name || "desktop"}-${name}-${width}.png`,
        });
      }
    }
    await page.goto("/gimnasio");
    await page.getByRole("button", { name: "Agregar entrenado" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await fits(page);
    await page.screenshot({
      path: `.local/screens/gym/${info.project.name || "desktop"}-create-account.png`,
    });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.goto("/gimnasio/rutinas/nueva");
    await page
      .getByLabel("Nombre de la rutina", { exact: true })
      .fill("Movilidad de prueba");
    const toggle = page.getByRole("button", {
      name: "Mostrar banco de ejercicios",
    });
    if (await toggle.isVisible()) await toggle.click();
    await page.getByLabel("Buscar en el banco").fill("sentadilla goblet");
    await page
      .getByRole("button", { name: "Agregar Sentadilla goblet", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Guardar borrador", exact: true })
      .click();
    await expect(page).toHaveURL(/\/gimnasio\/rutinas\/[0-9a-f-]+$/);
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Guardar borrador", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Descartar borrador", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Descartar borrador", exact: true })
      .click();
    await expect(page).toHaveURL(/\/gimnasio\/rutinas$/);
    await expect(
      page.getByText("Movilidad de prueba", { exact: true }),
    ).toHaveCount(0);
  } finally {
    await f.cleanup();
  }
});
