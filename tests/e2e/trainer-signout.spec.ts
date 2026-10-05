import { test, expect } from "@playwright/test";
import { accounts, dropFixture } from "../fixtures/cloud";
import { prepared } from "../fixtures/prepared";

for (const width of [320, 390, 1440]) {
  test(`trainer can leave with a draft and recover it at ${width}px`, async ({
    page,
    browserName,
  }) => {
    const a = await prepared();
    try {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/hoy");
      await page.getByLabel("Email").fill(accounts[0].email);
      await page
        .getByLabel("Contraseña", { exact: true })
        .fill(accounts[0].password);
      await page.getByRole("button", { name: "Ingresar", exact: true }).click();
      await expect(page.getByRole("navigation")).toBeVisible();
      await page.goto(`/alumnos/${a.studentId}/rutina`);
      await page
        .getByRole("button", { name: "Editar rutina", exact: true })
        .click();
      await page
        .getByLabel("Nombre de la rutina")
        .fill("Borrador para continuar después");
      await page.getByRole("link", { name: "Ajustes", exact: true }).click();
      const otherTab = width === 1440 ? await page.context().newPage() : null;
      if (otherTab) {
        await otherTab.goto("/hoy");
        await expect(otherTab.getByRole("navigation")).toBeVisible();
      }
      const exit = page.getByRole("button", {
        name: "Cerrar sesión",
        exact: true,
      });
      await expect(exit).toBeVisible();
      if (width > 760) {
        const box = await page
          .locator("aside")
          .getByRole("button", { name: "Cerrar sesión" })
          .boundingBox();
        expect(box!.y).toBeGreaterThan(700);
        expect(box!.y + box!.height).toBeLessThanOrEqual(900);
      }
      await page.screenshot({
        path: `.local/screens/signout/${browserName}-${width}.png`,
        fullPage: true,
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await exit.click();
      await expect(
        page.getByRole("button", { name: "Ingresar", exact: true }),
      ).toBeVisible();
      if (otherTab) {
        await expect(
          otherTab.getByRole("button", { name: "Ingresar", exact: true }),
        ).toBeVisible();
        await otherTab.close();
      }
      await page.reload();
      await expect(
        page.getByRole("button", { name: "Ingresar", exact: true }),
      ).toBeVisible();
      await page.getByLabel("Email").fill(accounts[0].email);
      await page
        .getByLabel("Contraseña", { exact: true })
        .fill(accounts[0].password);
      await page.getByRole("button", { name: "Ingresar", exact: true }).click();
      await expect(page.getByRole("navigation")).toBeVisible();
      await page.goto(`/alumnos/${a.studentId}/borradores`);
      await page.getByRole("link", { name: "Continuar borrador" }).click();
      await expect(page.getByLabel("Nombre de la rutina")).toHaveValue(
        "Borrador para continuar después",
      );
    } finally {
      await dropFixture(a.studentId);
    }
  });
}
