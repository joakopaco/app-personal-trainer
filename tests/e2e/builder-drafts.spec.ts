import { test, expect } from "@playwright/test";
import { prepared } from "../fixtures/prepared";
import { accounts, dropFixture, command, execute } from "../fixtures/cloud";
test("cleared and invalid draft fields survive reload; published routine remains unchanged", async ({
  page,
}) => {
  const a = await prepared();
  try {
    const session = a.snapshot.sessions[0];
    await execute(
      a.client,
      command(
        a.workspaceId,
        a.studentId,
        "finish_session",
        {
          sessionId: session.id,
          quickConfirmItemIds: session.items.map((i: { id: string }) => i.id),
          allowEmpty: false,
        },
        a.snapshot.revision,
      ),
    );
    await page.goto("/hoy");
    await page.getByLabel("Email").fill(accounts[0].email);
    await page
      .getByLabel("Contraseña", { exact: true })
      .fill(accounts[0].password);
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await expect(page.getByRole("navigation")).toBeVisible();
    await page.goto("/rutinas/" + a.studentId);
    await expect(page.getByLabel("Peso kg", { exact: true })).toHaveValue("20");
    await page.getByLabel("Peso kg", { exact: true }).fill("");
    await page.getByLabel("Repeticiones", { exact: true }).fill("abc");
    await page.getByLabel("Nombre de la rutina").click();
    await page.reload();
    await expect(page.getByLabel("Peso kg", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("Repeticiones", { exact: true })).toHaveValue(
      "abc",
    );
    await page
      .getByRole("button", { name: "Guardar borrador", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText("campos");
    await page.getByLabel("Repeticiones", { exact: true }).fill("12");
    await page
      .getByRole("button", { name: "Guardar borrador", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Borrador guardado");
    const published = await a.client
      .from("routine_revisions")
      .select("document")
      .eq("id", a.snapshot.routine.id)
      .single();
    expect(
      published.data?.document.weeks[0][0].blocks[0].exercises[0].prescription
        .weight,
    ).toBe(20);
  } finally {
    await dropFixture(a.studentId);
  }
});
