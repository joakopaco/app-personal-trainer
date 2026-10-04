import { test, expect } from "@playwright/test";
import { accounts, accountClient, dropFixture } from "../fixtures/cloud";

test("complete student form persists separate weekday times and edits without duplicating visits", async ({
  page,
}) => {
  let studentId: string | undefined;
  const account = await accountClient();
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(accounts[0].email);
    await page
      .getByLabel("Contraseña", { exact: true })
      .fill(accounts[0].password);
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await expect(page.getByRole("navigation")).toBeVisible();
    await page.goto("/alumnos");
    await page
      .getByRole("button", { name: "Agregar alumno", exact: true })
      .click();
    await page.getByLabel("Nombre", { exact: true }).fill("María Elena");
    await page.getByLabel("Apellido", { exact: true }).fill("Del Valle");
    await page
      .getByRole("combobox", { name: "Género", exact: true })
      .selectOption("femenino");
    await page
      .getByRole("combobox", { name: "Días por semana", exact: true })
      .selectOption("2");
    await page.getByLabel("Lunes", { exact: true }).check();
    await page.getByLabel("Horario del lunes", { exact: true }).fill("09:30");
    await page
      .getByRole("button", { name: "Crear alumno", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText("Elegí 2 días");
    await page.getByLabel("Miércoles", { exact: true }).check();
    await page
      .getByLabel("Horario del miércoles", { exact: true })
      .fill("18:45");
    await page
      .getByRole("textbox", { name: "Notas privadas", exact: true })
      .fill("Objetivo de prueba");
    await page
      .getByRole("button", { name: "Crear alumno", exact: true })
      .click();
    await expect(page).toHaveURL(/\/alumnos\/[0-9a-f-]+$/);
    studentId = page.url().split("/").at(-1)!;
    await expect(
      page.getByRole("heading", { name: "María Elena Del Valle" }),
    ).toBeVisible();
    await expect(page.getByText("09:30", { exact: true })).toBeVisible();
    await expect(page.getByText("18:45", { exact: true })).toBeVisible();
    const before = await account.client
      .from("visits")
      .select("id")
      .eq("student_id", studentId);
    await page.reload();
    await page
      .getByRole("button", { name: "Editar ficha", exact: true })
      .click();
    await expect(
      page.getByRole("combobox", { name: "Género", exact: true }),
    ).toHaveValue("femenino");
    await expect(
      page.getByLabel("Horario del miércoles", { exact: true }),
    ).toHaveValue("18:45");
    await page
      .getByRole("textbox", { name: "Notas privadas", exact: true })
      .fill("Objetivo actualizado");
    await page
      .getByRole("button", { name: "Guardar ficha", exact: true })
      .click();
    await expect(
      page.getByText("Objetivo actualizado", { exact: true }),
    ).toBeVisible();
    const after = await account.client
      .from("visits")
      .select("id")
      .eq("student_id", studentId);
    expect(after.data?.map((x) => x.id).sort()).toEqual(
      before.data?.map((x) => x.id).sort(),
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: ".local/student-routine-restoration/student-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      path: ".local/student-routine-restoration/student-desktop.png",
      fullPage: true,
    });
  } finally {
    if (studentId) await dropFixture(studentId);
  }
});
