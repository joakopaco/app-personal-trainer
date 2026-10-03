import { test, expect } from "@playwright/test";
import { accounts, dropFixture, command, execute } from "../fixtures/cloud";
import { prepared } from "../fixtures/prepared";
test("remote and local values are compared and only an explicit resolution overwrites", async ({
  page,
}) => {
  const a = await prepared();
  try {
    await page.goto("/login");
    await page.getByLabel("Email").fill(accounts[0].email);
    await page
      .getByLabel("Contraseña", { exact: true })
      .fill(accounts[0].password);
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await expect(page.getByRole("navigation")).toBeVisible();
    await page.goto("/entrenar/" + a.studentId);
    await expect(page.getByLabel("Peso kg")).toHaveValue("20");
    await page.route("http://127.0.0.1:54341/**", (r) => r.abort());
    await page.getByLabel("Peso kg").fill("44");
    await page.getByLabel("Peso kg").blur();
    await expect(page.getByRole("status")).toContainText(
      "pendiente de sincronizar",
    );
    const se = a.snapshot.sessions[0];
    const remote = await execute(
      a.client,
      command(
        a.workspaceId,
        a.studentId,
        "adjust_prescription",
        {
          sessionId: se.id,
          itemId: se.items[0].id,
          field: "weight",
          value: 42,
          scope: "session_and_future",
        },
        a.snapshot.revision,
      ),
    );
    expect(remote.status).toBe("applied");
    await page.unroute("http://127.0.0.1:54341/**");
    await page
      .getByRole("link", { name: "Revisar cambios pendientes", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Reintentar sincronización" })
      .click();
    await expect(page.getByText(/Valor confirmado: 42/)).toBeVisible();
    await expect(page.getByText(/Valor local: 44/)).toBeVisible();
    const before = await a.client
      .from("session_sets")
      .select("weight")
      .eq("student_id", a.studentId);
    expect(before.data?.[0].weight).toBe(42);
    await page
      .getByRole("button", { name: "Aplicar mi cambio revisado" })
      .click();
    await expect(
      page.getByText("No hay operaciones de entrenamiento pendientes."),
    ).toBeVisible();
    const after = await a.client
      .from("session_sets")
      .select("weight")
      .eq("student_id", a.studentId);
    expect(after.data?.map((s) => s.weight)).toEqual([44, 44]);
  } finally {
    await dropFixture(a.studentId);
  }
});
