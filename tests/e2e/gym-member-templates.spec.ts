import { test, expect, type Page } from "@playwright/test";
import { gymFixture } from "../fixtures/gym";
import { adminClient } from "../fixtures/cloud";
import { randomUUID } from "node:crypto";
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
async function capture(page: Page, name: string) {
  mkdirSync(".local/screens/gym-improvements", { recursive: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const engine = page.context().browser()!.browserType().name();
  await page.screenshot({
    path: `.local/screens/gym-improvements/${engine}-${name}.png`,
    fullPage: true,
  });
}

test("member creation captures separate names and persists gender", async ({
  page,
}) => {
  const f = await gymFixture(),
    email = `member-fields-${randomUUID()}@example.test`,
    service = adminClient();
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, f.accounts[0]);
    await page
      .getByRole("button", { name: "Agregar entrenado", exact: true })
      .click();
    const modal = page.getByRole("dialog");
    await modal.getByLabel("Nombre", { exact: true }).fill("María José");
    await modal.getByLabel("Apellido", { exact: true }).fill("Pérez López");
    await modal.getByLabel("Género").selectOption("female");
    await modal.getByLabel("Email").fill(email);
    await capture(page, "new-member-390");
    await modal
      .getByRole("button", { name: "Crear cuenta", exact: true })
      .click();
    await expect(
      modal.getByText("Contraseña temporal", { exact: true }),
    ).toBeVisible();
    const saved = await service
      .from("gym_accounts")
      .select("name,gender,gym_id,must_change_password")
      .eq("email", email)
      .single();
    expect(saved.data).toEqual({
      name: "María José Pérez López",
      gender: "female",
      gym_id: f.gym.id,
      must_change_password: true,
    });
    await modal.getByRole("button", { name: "Listo", exact: true }).click();
    await expect(modal).toHaveCount(0);
  } finally {
    const { data } = await service
      .from("gym_accounts")
      .select("user_id")
      .eq("email", email);
    for (const row of data || [])
      await service.auth.admin.deleteUser(row.user_id);
    await f.cleanup();
  }
});

test("personal routine copies a catalog template, protects edits and publishes independently", async ({
  page,
}) => {
  test.setTimeout(60000);
  const f = await gymFixture();
  try {
    await login(page, f.accounts[0]);
    await page.goto(`/gimnasio/entrenados/${f.accounts[1].userId}`);
    await page
      .getByRole("link", { name: "Crear personalizada", exact: true })
      .click();
    await page.getByLabel("Nombre de la rutina").fill("Preparación previa");
    await page.getByRole("button", { name: "+ Día", exact: true }).click();
    await page
      .getByRole("button", { name: "Usar plantilla", exact: true })
      .click();
    const modal = page.getByRole("dialog");
    await modal
      .getByRole("button", { name: "Fuerza inicial", exact: true })
      .click();
    await expect(
      modal.getByRole("button", { name: "Usar esta plantilla" }),
    ).toBeDisabled();
    await modal
      .getByLabel("Reemplazar la preparación actual con esta plantilla")
      .check();
    await capture(page, "template-picker-desktop");
    await modal.getByRole("button", { name: "Usar esta plantilla" }).click();
    await expect(page.getByLabel("Nombre de la rutina")).toHaveValue(
      "Fuerza inicial",
    );
    await expect(page.getByLabel("Peso kg", { exact: true })).toHaveValue("10");
    await page.getByLabel("Nombre de la rutina").fill("Fuerza para Alex");
    await page.getByLabel("Peso kg", { exact: true }).fill("15");
    await page
      .getByRole("button", { name: "Guardar borrador", exact: true })
      .click();
    await expect(page).toHaveURL(/rutinas\/[0-9a-f-]+\?member=/);
    await page
      .getByRole("button", { name: "Publicar rutina", exact: true })
      .click();
    await expect(page).toHaveURL(
      `/gimnasio/entrenados/${f.accounts[1].userId}`,
    );
    const routines = await f.accounts[0].client
      .from("gym_routines")
      .select("id,member_id,published_revision_id")
      .eq("kind", "personal");
    expect(routines.data).toHaveLength(1);
    expect(routines.data![0].member_id).toBe(f.accounts[1].userId);
    const source = await f.accounts[0].client
      .from("gym_routine_revisions")
      .select("document")
      .eq("id", f.revisionId)
      .single();
    const copy = await f.accounts[0].client
      .from("gym_routine_revisions")
      .select("document")
      .eq("id", routines.data![0].published_revision_id)
      .single();
    expect(source.data!.document.name).toBe("Fuerza inicial");
    expect(
      source.data!.document.weeks[0][0].blocks[0].exercises[0].prescription
        .weight,
    ).toBe(10);
    expect(copy.data!.document.weeks[0][0].id).not.toBe(
      source.data!.document.weeks[0][0].id,
    );
    expect(
      copy.data!.document.weeks[0][0].blocks[0].exercises[0].prescription
        .weight,
    ).toBe(15);
  } finally {
    await f.cleanup();
  }
});

test("member routine filters have equal touch targets at phone, tablet and desktop widths", async ({
  page,
}) => {
  const f = await gymFixture();
  try {
    await login(page, f.accounts[1]);
    await page.goto("/mi-entrenamiento/rutinas");
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const tabs = page.getByRole("group", { name: "Origen de las rutinas" });
      await expect(tabs.getByRole("button")).toHaveCount(3);
      const boxes = await tabs.getByRole("button").evaluateAll((nodes) =>
        nodes.map((n) => {
          const r = n.getBoundingClientRect();
          return { top: r.top, height: r.height, width: r.width };
        }),
      );
      expect(new Set(boxes.map((r) => r.top)).size).toBe(1);
      expect(new Set(boxes.map((r) => r.height)).size).toBe(1);
      expect(boxes.every((r) => r.height >= 44)).toBe(true);
      await capture(page, `member-routines-${width}`);
      await tabs.getByRole("button", { name: "Para mí", exact: true }).click();
      await expect(
        page.getByRole("heading", {
          name: "Todavía no tenés una personalizada",
        }),
      ).toBeVisible();
      await tabs
        .getByRole("button", { name: "Mi rutina", exact: true })
        .click();
      await expect(
        page.getByRole("link", { name: "Crear mi rutina" }),
      ).toBeVisible();
      await tabs
        .getByRole("button", { name: "Del gimnasio", exact: true })
        .click();
    }
  } finally {
    await f.cleanup();
  }
});
