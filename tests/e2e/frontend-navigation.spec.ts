import { test, expect } from "@playwright/test";
import { accounts, dropFixture } from "../fixtures/cloud";
import { prepared } from "../fixtures/prepared";

test("mobile navigation opens pages at the top and restores a live session's position", async ({
  page,
}) => {
  const fixture = await prepared();
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/hoy");
    await page.getByLabel("Email", { exact: true }).fill(accounts[0].email);
    await page
      .getByLabel("Contraseña", { exact: true })
      .fill(accounts[0].password);
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Hoy, con vos." }),
    ).toBeVisible();
    await page.goto("/entrenar/" + fixture.studentId);
    await expect(page.getByLabel("Peso serie 1", { exact: true })).toHaveValue(
      "20",
    );
    await page
      .getByRole("button", { name: "Finalizar entrenamiento", exact: true })
      .scrollIntoViewIfNeeded();
    const position = await page.evaluate(() => window.scrollY);
    expect(position).toBeGreaterThan(100);
    await page.getByRole("link", { name: "Alumnos", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Alumnos", exact: true }),
    ).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    // Return through the app, so this also exercises effect cleanup ordering.
    await page.getByRole("link", { name: "Hoy", exact: true }).click();
    await page.locator(`a[href="/entrenar/${fixture.studentId}"]`).click();
    await expect(page.getByLabel("Peso serie 1", { exact: true })).toHaveValue(
      "20",
    );
    // The browser clamps the restored position to available height.
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(100);
    await expect
      .poll(() =>
        page.evaluate(
          (saved) =>
            Math.abs(
              window.scrollY -
                Math.min(
                  saved,
                  document.documentElement.scrollHeight - innerHeight,
                ),
            ),
          position,
        ),
      )
      .toBeLessThan(2);
    await page
      .getByRole("button", { name: "Finalizar entrenamiento", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () => getComputedStyle(document.documentElement).overflow,
        ),
      )
      .toBe("hidden");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(
          () => getComputedStyle(document.documentElement).overflow,
        ),
      )
      .not.toBe("hidden");
    await page.getByRole("link", { name: "Alumnos", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await page.locator(`a[href="/alumnos/${fixture.studentId}"]`).click();
    await expect(
      page.getByRole("button", { name: "Editar ficha", exact: true }),
    ).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await page.goto("/sincronizacion");
    await expect(page).toHaveURL(/\/hoy$/);
    await expect(
      page.getByRole("heading", { name: "Hoy, con vos." }),
    ).toBeVisible();
    await expect(page.locator('a[href="/sincronizacion"]')).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Centro de sincronización" }),
    ).toHaveCount(0);
  } finally {
    await dropFixture(fixture.studentId);
  }
});
