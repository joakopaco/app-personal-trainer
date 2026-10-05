import { test, expect } from "@playwright/test";
import { gymFixture } from "../fixtures/gym";
import { mkdirSync } from "node:fs";

test("gym and trainee have separate usable spaces and train from a selected routine", async ({
  page,
}) => {
  const f = await gymFixture();
  mkdirSync(".local/screens/gym", { recursive: true });
  try {
    await page.goto("/");
    await page.getByLabel("Tipo de cuenta").selectOption("gym");
    await page.getByLabel("Email", { exact: true }).fill(f.accounts[0].email);
    await page
      .getByLabel("Contraseña", { exact: true })
      .fill(f.accounts[0].password);
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(
      page.getByRole("heading", { name: "Gimnasio Horizonte", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Alumnos", exact: true }),
    ).toHaveCount(0);
    const navBoxes = await page.locator(".sidebar nav a").evaluateAll((links) =>
      links.map((a) => ({
        top: a.getBoundingClientRect().top,
        bottom: a.getBoundingClientRect().bottom,
      })),
    );
    for (let i = 1; i < navBoxes.length; i++)
      expect(navBoxes[i].top).toBeGreaterThanOrEqual(navBoxes[i - 1].bottom);
    await page.screenshot({
      path: ".local/screens/gym/admin-desktop.png",
      fullPage: true,
    });
    await page.getByRole("link", { name: "Entrenados", exact: true }).click();
    await page.getByRole("link", { name: /Alex García/ }).click();
    await expect(
      page.getByRole("button", { name: "Asignar rutina" }),
    ).toBeVisible();
    await page.screenshot({
      path: ".local/screens/gym/member-profile.png",
      fullPage: true,
    });
    await page.getByRole("link", { name: "Ajustes", exact: true }).click();
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await page.getByLabel("Tipo de cuenta").selectOption("member");
    await page.getByLabel("Email", { exact: true }).fill(f.accounts[1].email);
    await page
      .getByLabel("Contraseña", { exact: true })
      .fill(f.accounts[1].password);
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(
      page.getByRole("heading", { name: /Entrená a tu ritmo/ }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("link", { name: "Rutinas", exact: true }).click();
    await page.getByRole("button", { name: "Elegir rutina" }).click();
    await expect(page.getByText("Seleccionada", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Entrenar", exact: true }).click();
    await page.getByRole("button", { name: "Empezar entrenamiento" }).click();
    await expect(
      page.getByRole("heading", { name: "Sentadilla goblet" }),
    ).toBeVisible();
    await page.getByLabel("Confirmar serie 1 de Sentadilla goblet").check();
    await page.getByRole("button", { name: "Guardar entrenamiento" }).click();
    await expect(page.getByText("Guardado", { exact: true })).toBeVisible();
    await page.screenshot({
      path: ".local/screens/gym/training-phone.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "Finalizar entrenamiento" }).click();
    await page.getByRole("button", { name: "Confirmar finalización" }).click();
    await expect(
      page.getByRole("heading", { name: /Entrená a tu ritmo/ }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Progreso", exact: true }).click();
    await expect(page.getByText("100 kg", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Exportar progreso" }).click();
    await expect(page.getByRole("dialog").locator("svg").first()).toBeVisible();
    await page.screenshot({
      path: ".local/screens/gym/progress-export-phone.png",
      fullPage: true,
    });
  } finally {
    await f.cleanup();
  }
});
