import { test, expect } from "@playwright/test";
import { accounts, accountClient, adminClient } from "../fixtures/cloud";
test("custom exercise, favorite and private reference image are scoped to their trainer", async ({
  page,
}) => {
  const a = await accountClient(),
    b = await accountClient(1);
  const name = "Ejercicio propio " + crypto.randomUUID().slice(0, 8);
  let id: string | undefined, path: string | undefined;
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
    await page.getByRole("button", { name: "Crear ejercicio propio" }).click();
    await page.getByLabel("Nombre", { exact: true }).fill(name);
    await page.getByLabel("Músculo principal").fill("Espalda");
    await page.getByLabel("Equipo", { exact: true }).fill("Mancuerna");
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
    await page
      .getByLabel("Crédito u origen de la imagen")
      .fill("Imagen de ensayo propia");
    await page
      .getByLabel("Agregar imagen privada", { exact: false })
      .setInputFiles({
        name: "reference.png",
        mimeType: "image/png",
        buffer: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aEAAAAABJRU5ErkJggg==",
          "base64",
        ),
      });
    await expect(page.getByText("Imagen privada guardada.")).toBeVisible();
    const media = await a.client
      .from("custom_exercises")
      .select("media_path")
      .eq("id", id!)
      .single();
    path = media.data!.media_path;
    expect(path).toContain(a.workspaceId);
    expect(
      (await b.client.storage.from("exercise-media").download(path!)).error,
    ).toBeTruthy();
    expect(
      (await b.client.from("custom_exercises").select("id").eq("id", id!)).data,
    ).toEqual([]);
  } finally {
    if (path) await adminClient().storage.from("exercise-media").remove([path]);
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
