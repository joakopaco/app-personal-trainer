import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { prepared } from "../fixtures/prepared";
import { accounts, dropFixture } from "../fixtures/cloud";
import { adminClient } from "../fixtures/cloud";
import { gymFixture, gymDocument } from "../fixtures/gym";

test("mixed trainee exercises preserve incomplete entries, omit results and recover a lost finish response", async ({
  page,
}) => {
  test.setTimeout(90000);
  const f = await gymFixture();
  const day = gymDocument().weeks[0][0];
  const original = day.blocks[0].exercises[0];
  day.blocks[0].exercises = [
    original,
    {
      ...structuredClone(original),
      id: randomUUID(),
      lineageId: randomUUID(),
      name: "Flexiones",
      type: "reps",
      prescription: { ...original.prescription, weight: null, reps: 12 },
    },
    {
      ...structuredClone(original),
      id: randomUUID(),
      lineageId: randomUUID(),
      name: "Plancha",
      type: "time",
      prescription: {
        ...original.prescription,
        weight: null,
        reps: null,
        durationSec: 90,
      },
    },
  ] as (typeof original)[];
  try {
    const seeded = await adminClient()
      .from("gym_sessions")
      .insert({
        gym_id: f.gym.id,
        member_id: f.accounts[1].userId,
        routine_revision_id: f.revisionId,
        routine_name: "Entrenamiento mixto",
        week: 0,
        day,
        status: "open",
      })
      .select("id")
      .single();
    if (seeded.error) throw seeded.error;
    await page.setViewportSize({ width: 390, height: 700 });
    await page.goto(`/mi-entrenamiento/sesion/${seeded.data.id}`);
    await page.getByLabel("Email", { exact: true }).fill(f.accounts[1].email);
    await page
      .getByLabel("Contraseña", { exact: true })
      .fill(f.accounts[1].password);
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    const plank = page.locator("article").filter({
      has: page.getByRole("heading", { name: "Plancha", exact: true }),
    });
    await expect(
      plank.getByText("1 min 30 s", { exact: true }).first(),
    ).toBeVisible();
    const time = plank.getByLabel("Tiempo serie 1 de Plancha", { exact: true });
    await time.fill("1,5");
    await plank
      .getByLabel("Confirmar serie 1 de Plancha", { exact: true })
      .click();
    await expect(plank.getByRole("alert")).toBeVisible();
    await page.reload();
    await expect(time).toHaveValue("1,5");
    await time.fill("90");
    await plank
      .getByLabel("Confirmar serie 1 de Plancha", { exact: true })
      .check();
    const reps = page.getByLabel("Repeticiones serie 1 de Flexiones", {
      exact: true,
    });
    await reps.click();
    await reps.pressSequentially("12");
    await expect(reps).toHaveValue("12");
    await page
      .getByLabel("Confirmar serie 1 de Flexiones", { exact: true })
      .check();
    const squat = page.locator("article").filter({
      has: page.getByRole("heading", {
        name: "Sentadilla goblet",
        exact: true,
      }),
    });
    await squat
      .getByLabel("Peso serie 1 de Sentadilla goblet", { exact: true })
      .fill("");
    await squat.getByLabel("No se realizó", { exact: true }).check();
    await page
      .getByRole("button", { name: "Guardar entrenamiento", exact: true })
      .click();
    await expect(page.getByText("Guardado", { exact: true })).toBeVisible();
    await page.reload();
    await expect(
      squat.getByLabel("No se realizó", { exact: true }),
    ).toBeChecked();
    await expect(time).toHaveValue("90");
    await expect(time).toBeDisabled();
    await page.route(
      "**/rest/v1/rpc/gym_command",
      async (route) => {
        const request = route.request().postDataJSON().command;
        if (request.kind !== "finish_session") return route.continue();
        const response = await route.fetch();
        expect(response.ok()).toBe(true);
        await route.abort("failed");
      },
      { times: 1 },
    );
    await page
      .getByRole("button", { name: "Finalizar entrenamiento", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirmar finalización", exact: true })
      .click();
    await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL(/\/mi-entrenamiento$/);
    const saved = await f.accounts[1].client
      .from("gym_sessions")
      .select("status,results")
      .eq("id", seeded.data.id)
      .single();
    expect(saved.error).toBeNull();
    expect(saved.data?.status).toBe("finished");
    expect(
      saved.data?.results.filter(
        (result: { skipped: boolean }) => result.skipped,
      ),
    ).toHaveLength(1);
    expect(
      saved.data?.results
        .flatMap((result: { sets: { confirmed: boolean }[] }) => result.sets)
        .filter((set: { confirmed: boolean }) => set.confirmed),
    ).toHaveLength(2);
  } finally {
    await f.cleanup();
  }
});

test("unavailable student links have a way back and network errors can retry", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(accounts[0].email);
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill(accounts[0].password);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Hoy, con vos." }),
  ).toBeVisible();
  const id = randomUUID();
  for (const path of [
    `/alumnos/${id}`,
    `/alumnos/${id}/rutina`,
    `/alumnos/${id}/borradores`,
    `/alumnos/${id}/borradores/editar`,
    `/progreso/${id}`,
    `/historial/${id}`,
    `/entrenar/${id}`,
  ]) {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { name: "Alumno no disponible" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Volver a alumnos" }),
    ).toBeVisible();
  }
  await page.route("**/rest/v1/students?*", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "Test outage" }),
    }),
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "No pudimos cargar este alumno" }),
  ).toBeVisible({ timeout: 20000 });
  await page.unroute("**/rest/v1/students?*");
  await page
    .getByRole("button", { name: "Reintentar carga", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Alumno no disponible" }),
  ).toBeVisible();
});

test("trainer set controls stay usable and pending edits explain how to finish", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const f = await prepared();
  mkdirSync(".local/screens/final-audit", { recursive: true });
  try {
    await page.goto(`/entrenar/${f.studentId}`);
    await page.getByLabel("Email", { exact: true }).fill(accounts[0].email);
    await page
      .getByLabel("Contraseña", { exact: true })
      .fill(accounts[0].password);
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    const weight = page.getByLabel("Peso serie 1", { exact: true });
    await expect(weight).toBeEnabled();
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 800 });
      const sizes = await page
        .locator(".training-exercise .set-editor input, .set-options > summary")
        .evaluateAll((nodes) =>
          nodes.map((n) => ({
            width: n.getBoundingClientRect().width,
            height: n.getBoundingClientRect().height,
          })),
        );
      for (const s of sizes) {
        expect(s.width).toBeGreaterThanOrEqual(44);
        expect(s.height).toBeGreaterThanOrEqual(44);
      }
      const fonts = await page
        .locator(".training-block select")
        .evaluateAll((nodes) =>
          nodes.map((n) => parseFloat(getComputedStyle(n).fontSize)),
        );
      expect(fonts.every((size) => size >= 16)).toBe(true);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await page.setViewportSize({ width: 320, height: 700 });
    await weight.click();
    await weight.pressSequentially("27,5");
    await expect(weight).toHaveValue("27,5");
    await expect(
      page.getByText("Campo pendiente de confirmar", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Finalizar entrenamiento", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Finalizar entrenamiento",
    });
    await expect(
      dialog.getByRole("button", { name: "Confirmar cierre", exact: true }),
    ).toBeDisabled();
    await expect(dialog.getByText(/Hay.*pendiente/)).toBeVisible();
    await page.screenshot({
      path: `.local/screens/final-audit/${info.project.name || "chromium"}-pending-finish.png`,
      scale: "css",
    });
    await dialog
      .getByRole("button", { name: "Revisar edición pendiente", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await expect(weight).toBeFocused();
    await expect(weight).toBeInViewport();
    await page.setViewportSize({ width: 390, height: 400 });
    await weight.press("Tab");
    const reps = page.getByLabel("Reps serie 1", { exact: true });
    await expect(reps).toBeFocused();
    expect(
      await reps.evaluate((node) => {
        const bounds = node.getBoundingClientRect();
        const header = document
          .querySelector(".training-topbar")!
          .getBoundingClientRect();
        const nav = document.querySelector(".sidebar")!.getBoundingClientRect();
        return bounds.top >= header.bottom && bounds.bottom <= nav.top;
      }),
    ).toBe(true);
    await page.setViewportSize({ width: 320, height: 700 });
    await page
      .getByRole("button", { name: "Registrar serie 1", exact: true })
      .click();
    await expect(page.getByText("Guardado", { exact: true })).toBeVisible();
    await page
      .getByRole("button", { name: "Corregir serie 1", exact: true })
      .click();
    const correction = page.getByLabel("Valor corregido");
    await correction.fill("28");
    await page
      .getByLabel("Motivo de la corrección")
      .fill("Corrección de la prueba");
    await page
      .getByRole("button", { name: "Confirmar corrección", exact: true })
      .click();
    await expect(correction).toHaveCount(0);
    await expect(
      page.locator(".set-row").filter({ hasText: "28 kg" }),
    ).toContainText("Registrada");
    await page.screenshot({
      path: `.local/screens/final-audit/${info.project.name || "chromium"}-trainer-recording.png`,
      fullPage: true,
      scale: "css",
    });
  } finally {
    await dropFixture(f.studentId);
  }
});
