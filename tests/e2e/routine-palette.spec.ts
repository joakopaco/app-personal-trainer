import { test, expect, type Page } from "@playwright/test";
import { accounts, dropFixture } from "../fixtures/cloud";
import { prepared } from "../fixtures/prepared";
async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(accounts[0].email);
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill(accounts[0].password);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page.getByRole("navigation")).toBeVisible();
}
test("desktop palette groups exercises, drops into the chosen block and preserves the button flow", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    isMobile: false,
    hasTouch: false,
  });
  const page = await context.newPage();
  const f = await prepared();
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await login(page);
    await page.goto(`/alumnos/${f.studentId}/rutina`);
    await page
      .getByRole("button", { name: "Editar rutina", exact: true })
      .click();
    const bank = page.getByRole("complementary", {
      name: "Banco de ejercicios",
    });
    await expect(bank).toBeVisible();
    await bank.getByText("Pecho", { exact: true }).click();
    await expect(
      bank.getByRole("button", {
        name: "Agregar Press de banca con barra",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Agregar bloque", exact: true })
      .click();
    const blocks = page.locator(".routine-drop-block");
    await bank
      .getByLabel("Buscar en el banco")
      .fill("press de banca con barra");
    await blocks.nth(1).scrollIntoViewIfNeeded();
    await bank
      .locator('[draggable="true"]')
      .dragTo(blocks.nth(1), { sourcePosition: { x: 12, y: 12 }, steps: 20 });
    await expect(
      blocks.nth(1).getByRole("heading", {
        name: "Press de banca con barra",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      blocks.first().getByRole("heading", { name: "Press de banca con barra" }),
    ).toHaveCount(0);
    await blocks
      .first()
      .getByRole("button", { name: "Agregar ejercicio", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Remo con barra", exact: true })
      .click();
    await expect(
      blocks
        .first()
        .getByRole("heading", { name: "Remo con barra", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Peso kg", { exact: true }).first(),
    ).toHaveValue("20");
    await page
      .getByRole("button", { name: "Guardar borrador", exact: true })
      .click();
    await expect(
      page.getByText("Borrador guardado. Todavía no cambia la rutina activa."),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Nombre de la rutina")).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Press de banca con barra",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Remo con barra", exact: true }),
    ).toBeVisible();
    await bank.getByLabel("Buscar en el banco").fill("press");
    await page.screenshot({
      path: ".local/screens/routine-palette/desktop.png",
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await dropFixture(f.studentId);
    await context.close();
  }
});
test("mobile template palette can add by touch to an empty day and switch destinations", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 375, height: 844 },
    hasTouch: true,
  });
  const page = await context.newPage();
  try {
    await login(page);
    await page.goto("/rutinas");
    await page
      .getByRole("button", { name: "Crear plantilla", exact: true })
      .tap();
    const bank = page.getByRole("complementary", {
      name: "Banco de ejercicios",
    });
    await bank
      .getByRole("button", { name: "Mostrar banco de ejercicios", exact: true })
      .tap();
    await bank.getByLabel("Buscar en el banco").fill("sentadilla con barra");
    await bank
      .getByRole("button", {
        name: "Agregar Sentadilla con barra",
        exact: true,
      })
      .tap();
    await expect(page.locator(".routine-drop-block")).toHaveCount(1);
    await page
      .getByRole("button", { name: "Agregar bloque", exact: true })
      .tap();
    await bank
      .getByLabel("Bloque de destino")
      .selectOption({ label: "Bloque 2" });
    await bank
      .getByRole("button", {
        name: "Agregar Sentadilla con barra",
        exact: true,
      })
      .tap();
    await expect(
      page
        .locator(".routine-drop-block")
        .nth(1)
        .getByRole("heading", { name: "Sentadilla con barra", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Semana 2", exact: true }).tap();
    await bank
      .getByRole("button", {
        name: "Agregar Sentadilla con barra",
        exact: true,
      })
      .tap();
    await expect(page.locator(".routine-drop-block")).toHaveCount(1);
    await page.getByRole("button", { name: "Semana 1", exact: true }).tap();
    await expect(page.locator(".routine-drop-block")).toHaveCount(2);
    await page.screenshot({
      path: ".local/screens/routine-palette/mobile-bank.png",
      fullPage: true,
    });
    await bank
      .getByRole("button", { name: "Ocultar banco de ejercicios", exact: true })
      .tap();
    await expect(bank.getByLabel("Buscar en el banco")).toBeHidden();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: ".local/screens/routine-palette/mobile-canvas.png",
      fullPage: true,
    });
    await page.reload();
    await expect(page.locator(".routine-drop-block")).toHaveCount(2);
    for (const width of [320, 768]) {
      await page.setViewportSize({ width, height: 844 });
      await bank
        .getByRole("button", {
          name: "Mostrar banco de ejercicios",
          exact: true,
        })
        .tap();
      await bank.getByLabel("Buscar en el banco").fill("sentadilla");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `.local/screens/routine-palette/bank-${width}.png`,
      });
      await bank
        .getByRole("button", {
          name: "Ocultar banco de ejercicios",
          exact: true,
        })
        .tap();
    }
  } finally {
    await context.close();
  }
});
