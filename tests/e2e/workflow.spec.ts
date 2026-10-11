import { test, expect } from "@playwright/test";
import { accounts, createStudent, dropFixture } from "../fixtures/cloud";
test("trainer can build a block routine and train from the mobile UI", async ({
  page,
}) => {
  const a = await createStudent();
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/login");
    await page.getByLabel("Email").fill(accounts[0].email);
    await page
      .getByLabel("Contraseña", { exact: true })
      .fill(accounts[0].password);
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await expect(
      page.getByRole("navigation", { name: "Principal" }),
    ).toBeVisible();
    await page.goto("/rutinas/" + a.studentId);
    await page.getByRole("link", { name: "Nueva rutina", exact: true }).click();
    await page
      .getByRole("button", { name: "Crear rutina", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Nueva rutina · borrador",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Agregar bloque", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Agregar ejercicio", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Sentadilla con barra", exact: true })
      .click();
    await page.getByLabel("Peso kg").fill("22,5");
    await page.getByLabel("Series", { exact: true }).selectOption("3");
    await page.getByLabel("Repeticiones", { exact: true }).selectOption("10");
    await page.getByRole("button", { name: /Copiar semana 1 a/ }).click();
    await page
      .getByRole("button", { name: "Copiar a 3 semanas", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Guardar borrador", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Borrador guardado");
    await page
      .getByRole("button", { name: "Activar rutina", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Rutina activa");
    await page.getByRole("link", { name: "Hoy", exact: true }).click();
    await page
      .getByRole("button", { name: "Agregar ahora", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: new RegExp(a.studentId.slice(0, 8)) })
      .click();
    await page
      .getByRole("button", { name: "Iniciar entrenamiento", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Sentadilla con barra" }),
    ).toBeVisible();
    await expect(
      page.getByText("Editar objetivos", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText("Referencia del ejercicio", { exact: true }),
    ).toBeVisible();
    await page.getByLabel("Peso serie 1").fill("25");
    await page
      .getByRole("button", { name: "Registrar serie 1", exact: true })
      .click();
    await expect(page.getByText("Guardado", { exact: true })).toBeVisible();
    await page
      .getByRole("button", { name: "Finalizar entrenamiento", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirmar cierre", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Entrenamiento finalizado" }),
    ).toBeVisible();
  } finally {
    await dropFixture(a.studentId);
  }
});
