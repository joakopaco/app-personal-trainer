import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { accounts, dropFixture } from "../fixtures/cloud";
import { prepared } from "../fixtures/prepared";

async function login(page: Page, id: string) {
  await page.goto("/alumnos/" + id);
  await page.getByLabel("Email", { exact: true }).fill(accounts[0].email);
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill(accounts[0].password);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(
    page.getByRole("navigation", { name: "Secciones del alumno" }),
  ).toBeVisible();
}

test("profile separates sections and exports all four routine weeks without private notes or application chrome", async ({
  page,
}) => {
  const fixture = await prepared();
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, fixture.studentId);
    const tabs = page.getByRole("navigation", { name: "Secciones del alumno" });
    await expect(
      tabs.getByRole("link", {
        name: "Ficha: información y rutinas",
        exact: true,
      }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      page.getByRole("button", { name: "Editar días y horarios" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("complementary", { name: "Información del alumno" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: "Exportar rutina", exact: true })
      .click();
    const preview = page.getByRole("dialog");
    for (let week = 1; week <= 4; week++)
      await expect(
        preview.getByRole("heading", { name: `Semana ${week}`, exact: true }),
      ).toBeVisible();
    await expect(
      preview.getByRole("cell", { name: "20 kg", exact: true }),
    ).toHaveCount(4);
    await expect(
      preview.getByRole("cell", { name: "1 min", exact: true }),
    ).toHaveCount(4);
    await expect(preview.getByText("Notas privadas")).toHaveCount(0);
    expect(
      await preview.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    await page.emulateMedia({ media: "print" });
    await expect(page.locator("#root")).toBeHidden();
    await expect(
      preview.getByRole("heading", { name: "Semana 4", exact: true }),
    ).toBeVisible();
    await expect(
      preview.getByRole("button", {
        name: "Guardar PDF / imprimir",
        exact: true,
      }),
    ).toBeHidden();
    const pdf = await page.pdf({ format: "A4", printBackground: true });
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf.length).toBeGreaterThan(10000);
    await page.emulateMedia({ media: "screen" });
    await page.keyboard.press("Escape");
    await expect(preview).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Exportar rutina", exact: true }),
    ).toBeFocused();
    await tabs.getByRole("link", { name: "Progreso", exact: true }).click();
    await expect(
      page.getByRole("region", { name: "Progreso por grupo muscular" }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Rutinas anteriores" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Exportar progreso", exact: true }),
    ).toBeDisabled();
    await tabs.getByRole("link", { name: "Historial", exact: true }).click();
    await expect(
      page.getByRole("region", { name: "Registro de cambios" }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Rutinas anteriores" }),
    ).toHaveCount(0);
    await expect(
      page.getByText("Sesiones y registros", { exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: /exportar/i })).toHaveCount(
      0,
    );
  } finally {
    await dropFixture(fixture.studentId);
  }
});

test("progress preview and CSV include subsequent pages, respect the selected range and never export failed loads", async ({
  page,
}) => {
  const fixture = await prepared();
  try {
    await page.route("**/rest/v1/sessions?*", async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get("limit") !== "200") return route.continue();
      if (url.searchParams.getAll("date").includes("gte.2026-01-01"))
        return route.fulfill({
          status: 500,
          body: '{"message":"test failure"}',
        });
      const start = Number(url.searchParams.get("offset") || 0);
      const filtered = url.searchParams
        .getAll("date")
        .includes("gte.2026-10-01");
      const sessions = Array.from({ length: filtered ? 1 : 205 }, (_, n) => ({
        id: `session-${n}`,
        date: "2026-10-03",
        ended_at: new Date(Date.UTC(2026, 9, 3, 0, n)).toISOString(),
        session_items: [
          {
            id: `item-${n}`,
            name: "Sentadilla",
            type: "load_reps",
            warmup: false,
            skipped: false,
            exercise_id: "squat",
            group: "Cuádriceps",
            session_sets: [
              {
                id: `set-${n}`,
                ordinal: 1,
                state: "done",
                source: "observed",
                weight: n + 20,
                reps: 10,
                duration_sec: null,
              },
            ],
          },
        ],
      }));
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(sessions.slice(start, start + 200)),
      });
    });
    await login(page, fixture.studentId);
    await page
      .getByRole("navigation", { name: "Secciones del alumno" })
      .getByRole("link", { name: "Progreso", exact: true })
      .click();
    await expect(
      page.getByText("Todo el historial registrado · 205 sesiones finalizadas"),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Exportar progreso", exact: true })
      .click();
    const preview = page.getByRole("dialog");
    await expect(
      preview.getByRole("img", { name: "Evolución de Sentadilla en kg" }),
    ).toBeVisible();
    await expect(
      preview.locator(".document-exercise > table tbody tr"),
    ).toHaveCount(205);
    await expect(
      preview.getByRole("img", { name: "Anatomía frontal del progreso" }),
    ).toBeVisible();
    await expect(
      preview.getByRole("img", { name: "Anatomía posterior del progreso" }),
    ).toBeVisible();
    expect(
      await preview.locator(".document-anatomy .muscle-region.trained").count(),
    ).toBeGreaterThan(0);
    await page.emulateMedia({ media: "print" });
    await expect(
      preview.getByRole("img", { name: "Anatomía frontal del progreso" }),
    ).toBeVisible();
    expect(
      (await preview.locator(".document-anatomy svg").first().boundingBox())!
        .height,
    ).toBeGreaterThan(200);
    await page.emulateMedia({ media: "screen" });
    const downloading = page.waitForEvent("download");
    await preview
      .getByRole("button", { name: "Descargar CSV", exact: true })
      .click();
    const file = await downloading;
    const csv = readFileSync((await file.path())!, "utf8");
    expect(csv.split("\r\n")).toHaveLength(206);
    expect(csv).toContain('"224"');
    await preview.getByRole("button", { name: "Volver", exact: true }).click();
    await page.getByLabel("Período de progreso").selectOption("custom");
    await page.getByLabel("Progreso desde").fill("2026-10-01");
    await expect(page.getByText(/1 sesión finalizada/)).toBeVisible();
    await page
      .getByRole("button", { name: "Exportar progreso", exact: true })
      .click();
    await expect(
      page.getByRole("dialog").locator(".document-exercise > table tbody tr"),
    ).toHaveCount(1);
    await page.keyboard.press("Escape");
    await page.getByLabel("Progreso desde").fill("2026-01-01");
    await expect(page.getByRole("alert")).toContainText(
      "No se pudo cargar el progreso",
    );
    await expect(
      page.getByRole("button", { name: "Exportar progreso", exact: true }),
    ).toBeDisabled();
  } finally {
    await dropFixture(fixture.studentId);
  }
});
