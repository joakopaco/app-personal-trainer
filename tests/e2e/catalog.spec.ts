import { test, expect } from "@playwright/test";
import { accounts, accountClient, adminClient } from "../fixtures/cloud";
test("grouped catalog and image-free custom exercises remain scoped to their trainer", async ({
  page,
}) => {
  const a = await accountClient(),
    b = await accountClient(1);
  const name = "Ejercicio propio " + crypto.randomUUID().slice(0, 8);
  let id: string | undefined;
  try {
    await page.goto("/biblioteca");
    await page.getByLabel("Email").fill(accounts[0].email);
    await page
      .getByLabel("Contraseña", { exact: true })
      .fill(accounts[0].password);
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Ejercicios", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Ejercicios", exact: true }),
    ).toHaveAttribute("href", "/biblioteca");
    await page.getByLabel("Filtrar por grupo muscular").selectOption("Pecho");
    await expect(
      page.getByRole("heading", {
        name: "Press de banca con barra",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Sentadilla con barra", exact: true }),
    ).toHaveCount(0);
    await page.getByLabel("Filtrar por grupo muscular").selectOption("");
    await page.getByRole("button", { name: "Crear ejercicio propio" }).click();
    await page.getByLabel("Nombre", { exact: true }).fill(name);
    await page
      .getByLabel("Grupo muscular", { exact: true })
      .selectOption("Espalda");
    await page.getByLabel("Material", { exact: true }).fill("Mancuerna");
    await page
      .getByRole("button", { name: "Guardar ejercicio", exact: true })
      .click();
    await page.getByLabel("Buscar ejercicio").fill(name);
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
    const row = await a.client
      .from("custom_exercises")
      .select("id")
      .eq("name", name)
      .single();
    id = row.data!.id;
    await page.getByRole("button", { name: "Favorito " + name }).click();
    await expect(
      page.getByRole("button", { name: "Favorito " + name }),
    ).toContainText("Favorito");
    await page.getByRole("button", { name: "Ver detalle" }).click();
    await expect(
      page.getByText("Sin ilustración disponible", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("dialog").locator("img, input[type=file]"),
    ).toHaveCount(0);
    expect(
      (await b.client.from("custom_exercises").select("id").eq("id", id!)).data,
    ).toEqual([]);
  } finally {
    if (id) {
      await adminClient()
        .from("exercise_favorites")
        .delete()
        .eq("workspace_id", a.workspaceId)
        .eq("exercise_id", id);
      await adminClient().from("custom_exercises").delete().eq("id", id);
    }
  }
});
