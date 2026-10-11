import { expect, test } from "@playwright/test";
import { accountClient, accounts, adminClient } from "../fixtures/cloud";

test("favorite confirmation, lost-response retry, reload and removal preserve the saved state", async ({
  page,
}) => {
  const owner = await accountClient();
  const other = await accountClient(1);
  const id = crypto.randomUUID();
  const name = "Favorito prueba " + id.slice(0, 8);
  const operationIds: string[] = [];
  const created = await owner.client.rpc("save_library_entry", {
    command: {
      workspaceId: owner.workspaceId,
      operationId: crypto.randomUUID(),
      id,
      expectedRevision: 0,
      kind: "exercise",
      payload: {
        name,
        group: "Espalda",
        equipment: "Mancuerna",
        type: "load_reps",
      },
    },
  });
  expect(created.error).toBeNull();
  try {
    await page.goto("/biblioteca");
    await page.getByLabel("Email").fill(accounts[0].email);
    await page
      .getByLabel("Contraseña", { exact: true })
      .fill(accounts[0].password);
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await page.getByLabel("Buscar ejercicio").fill(name);
    const favorite = page.getByRole("button", {
      name: "Favorito " + name,
      exact: true,
    });
    await expect(favorite).toBeEnabled();
    await expect(favorite).toHaveAttribute("aria-pressed", "false");

    let loseFirstResponse = true;
    await page.route("**/rest/v1/rpc/save_library_entry", async (route) => {
      operationIds.push(route.request().postDataJSON().command.operationId);
      if (!loseFirstResponse) return route.continue();
      loseFirstResponse = false;
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      await route.abort("failed");
    });
    await favorite.click();
    await expect(
      page.getByRole("button", { name: "Reintentar guardado", exact: true }),
    ).toBeVisible();
    await expect(favorite).toBeDisabled();
    const stored = await owner.client
      .from("exercise_favorites")
      .select("exercise_id")
      .eq("exercise_id", id);
    expect(stored.error).toBeNull();
    expect(stored.data).toEqual([{ exercise_id: id }]);

    await page.reload();
    await page.getByLabel("Buscar ejercicio").fill(name);
    await page
      .getByRole("button", { name: "Reintentar guardado", exact: true })
      .click();
    await expect(favorite).toBeEnabled();
    await expect(favorite).toHaveAttribute("aria-pressed", "true");
    expect(operationIds).toHaveLength(2);
    expect(operationIds[1]).toBe(operationIds[0]);
    await expect(
      page.getByRole("button", { name: "Reintentar guardado", exact: true }),
    ).toHaveCount(0);

    await page.reload();
    await page.getByLabel("Buscar ejercicio").fill(name);
    await expect(favorite).toHaveAttribute("aria-pressed", "true");
    await page
      .getByRole("button", { name: "Solo favoritos", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
    expect(
      (
        await other.client
          .from("exercise_favorites")
          .select("exercise_id")
          .eq("exercise_id", id)
      ).data,
    ).toEqual([]);

    // A read outage after a confirmed mutation used to leave the old star.
    await page.route("**/rest/v1/exercise_favorites?**", (route) =>
      route.abort(),
    );
    await favorite.click();
    await expect(page.getByRole("heading", { name, exact: true })).toHaveCount(
      0,
    );
    await page
      .getByRole("button", { name: "Solo favoritos", exact: true })
      .click();
    await expect(favorite).toHaveAttribute("aria-pressed", "false");
    expect(
      (
        await owner.client
          .from("exercise_favorites")
          .select("exercise_id")
          .eq("exercise_id", id)
      ).data,
    ).toEqual([]);
    await page.unroute("**/rest/v1/exercise_favorites?**");
    await page.reload();
    await page.getByLabel("Buscar ejercicio").fill(name);
    await expect(favorite).toBeEnabled();
    await expect(favorite).toHaveAttribute("aria-pressed", "false");
  } finally {
    await adminClient()
      .from("exercise_favorites")
      .delete()
      .eq("workspace_id", owner.workspaceId)
      .eq("exercise_id", id);
    await adminClient().from("custom_exercises").delete().eq("id", id);
  }
});
