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
    await expect(page.getByLabel("Descanso entre series")).toHaveValue("1");
    await page.route("http://127.0.0.1:54341/**", (r) => r.abort());
    await page.getByLabel("Descanso entre series").selectOption("5");
    await page.getByLabel("Descanso entre series").blur();
    await expect(page.locator(".save-indicator")).toContainText(
      "Guardado en este dispositivo",
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
          field: "microRest",
          value: 180,
          scope: "session_and_future",
        },
        a.snapshot.revision,
      ),
    );
    expect(remote.status).toBe("applied");
    await page.unroute("http://127.0.0.1:54341/**");
    // The background worker retries after connectivity returns. Its next tick
    // can replace the retry button with the conflict review before a click.
    await expect(page.getByText(/Valor confirmado: 180/)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/Valor local: 300/)).toBeVisible();
    const before = await a.client
      .from("session_items")
      .select("prescription")
      .eq("student_id", a.studentId);
    expect(before.data?.[0].prescription.microRest).toBe(180);
    await page
      .getByRole("button", { name: "Aplicar mi cambio revisado" })
      .click();
    await expect(page.getByText("Guardado", { exact: true })).toBeVisible();
    const after = await a.client
      .from("session_items")
      .select("prescription")
      .eq("student_id", a.studentId);
    expect(after.data?.map((s) => s.prescription.microRest)).toEqual([300]);
  } finally {
    await dropFixture(a.studentId);
  }
});
