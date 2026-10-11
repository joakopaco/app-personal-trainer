import { test, expect } from "@playwright/test";
import { prepared } from "../fixtures/prepared";
import { accounts, dropFixture } from "../fixtures/cloud";
test("a failed raw-input write never presents the edited screen as synchronized", async ({
  page,
}) => {
  const a = await prepared();
  try {
    await page.goto("/hoy");
    await page.getByLabel("Email").fill(accounts[0].email);
    await page
      .getByLabel("Contraseña", { exact: true })
      .fill(accounts[0].password);
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await expect(page.getByRole("navigation")).toBeVisible();
    await page.goto("/entrenar/" + a.studentId);
    await expect(page.getByLabel("Peso serie 1", { exact: true })).toHaveValue(
      "20",
    );
    await page.evaluate(() => {
      const original = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (
        ...args: Parameters<typeof original>
      ) {
        if (this.name === "rawInputs")
          throw new DOMException("Full", "QuotaExceededError");
        return original.apply(this, args);
      };
    });

    await page.getByLabel("Peso serie 1", { exact: true }).fill("99");
    await page.getByLabel("Peso serie 1", { exact: true }).blur();
    await expect(page.getByRole("alert")).toContainText("No se pudo guardar");
    await expect(page.getByText("Guardado", { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: "Finalizar entrenamiento",
        exact: true,
      }),
    ).toBeDisabled();
    const records = await a.client
      .from("session_sets")
      .select("weight")
      .eq("student_id", a.studentId);
    expect(records.data?.map((s) => s.weight)).toEqual([20, 20]);
  } finally {
    await dropFixture(a.studentId);
  }
});
