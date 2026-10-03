import { test, expect } from "@playwright/test";
import {
  accounts,
  createStudent,
  dropFixture,
  execute,
  command,
} from "../fixtures/cloud";
import { routineFixture } from "../fixtures/routine";
import { prepared } from "../fixtures/prepared";
test("offline edits survive a reload and synchronize exactly once", async ({
  page,
}) => {
  test.setTimeout(60_000);
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
    await page.getByLabel("Peso kg").fill("42,5");
    await page.getByLabel("Peso kg").blur();
    await expect(page.getByRole("status")).toContainText(
      "pendiente de sincronizar",
    );
    await page.reload();
    await expect(page.getByLabel("Peso kg")).toHaveValue("42.5");
    await expect(page.getByRole("status")).toContainText(
      "pendiente de sincronizar",
    );
    await page.unroute("http://127.0.0.1:54341/**");
    await page.goto("/sincronizacion");
    await page
      .getByRole("button", { name: "Reintentar sincronización" })
      .click();
    await page.goto("/entrenar/" + a.studentId);
    // Navigation can interrupt an in-flight send. The durable lease expires
    // after 30s and the next 2.5s worker tick safely replays its receipt.
    await expect(page.getByText("Sincronizado", { exact: true })).toBeVisible({
      timeout: 35_000,
    });
    const sets = await a.client
      .from("session_sets")
      .select("weight")
      .eq("student_id", a.studentId);
    expect(sets.data?.map((s) => s.weight)).toEqual([42.5, 42.5]);
    const audit = await a.client
      .from("audit_events")
      .select("id")
      .eq("student_id", a.studentId)
      .eq("kind", "adjust_prescription");
    expect(audit.data).toHaveLength(1);
  } finally {
    await dropFixture(a.studentId);
  }
});
