import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  accounts,
  command,
  execute,
  createStudent,
  dropFixture,
} from "../fixtures/cloud";
import { todayKey } from "../../packages/domain/src/dates";

function plusDays(date: string, count: number) {
  const next = new Date(date + "T12:00:00Z");
  next.setUTCDate(next.getUTCDate() + count);
  return next.toISOString().slice(0, 10);
}
async function fixture() {
  const a = await createStudent();
  try {
    const scheduled = await execute(
      a.client,
      command(
        a.workspaceId,
        a.studentId,
        "save_schedule",
        { weekdays: [1], time: "07:00" },
        a.revision,
      ),
    );
    expect(scheduled.status).toBe("applied");
    let date = plusDays(todayKey(), 1);
    while (new Date(date + "T12:00:00Z").getUTCDay() !== 2)
      date = plusDays(date, 1);
    const id = randomUUID();
    const created = await execute(
      a.client,
      command(
        a.workspaceId,
        a.studentId,
        "create_visit",
        { visitId: id, date, time: "09:45" },
        scheduled.revision,
      ),
    );
    expect(created.status).toBe("applied");
    return { ...a, id, date, name: created.patch.student.name as string };
  } catch (error) {
    await dropFixture(a.studentId);
    throw error;
  }
}
async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(accounts[0].email);
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill(accounts[0].password);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Hoy, con vos." }),
  ).toBeVisible();
}

test("moves just one visit, preserves recurring schedule and persists the linked history", async ({
  page,
}) => {
  const a = await fixture();
  try {
    const before = await a.client
      .from("schedule_rules")
      .select("*")
      .eq("student_id", a.studentId);
    await login(page);
    await page.getByLabel("Fecha de agenda").fill(a.date);
    const open = () =>
      page
        .getByRole("button", { name: "Reprogramar a " + a.name, exact: true })
        .click();
    await open();
    let dialog = page.getByRole("dialog", { name: "Reprogramar visita" });
    await expect(dialog.getByLabel("Fecha de esta visita")).toHaveValue(a.date);
    await expect(dialog.getByLabel("Horario de esta visita")).toHaveValue(
      "09:45",
    );
    await dialog
      .getByRole("button", { name: "Reprogramar", exact: true })
      .click();
    await expect(dialog.getByRole("alert")).toContainText("diferente");
    await dialog.getByLabel("Horario de esta visita").fill("10:30");
    await dialog.getByRole("button", { name: "Volver", exact: true }).click();
    expect(
      (await a.client.from("visits").select("status").eq("id", a.id).single())
        .data?.status,
    ).toBe("pending");
    await open();
    await expect(dialog.getByLabel("Horario de esta visita")).toHaveValue(
      "09:45",
    );
    await dialog.getByLabel("Horario de esta visita").fill("10:30");
    await dialog
      .getByRole("button", { name: "Reprogramar", exact: true })
      .click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("status")).toContainText("10:30");
    const moved = await a.client
      .from("visits")
      .select("*")
      .eq("rescheduled_from", a.id)
      .single();
    expect(moved.data).toMatchObject({
      date: a.date,
      time: "10:30:00",
      status: "pending",
      source: "rescheduled",
    });
    expect(
      (await a.client.from("visits").select("status").eq("id", a.id).single())
        .data?.status,
    ).toBe("rescheduled");
    expect(
      (
        await a.client
          .from("schedule_rules")
          .select("*")
          .eq("student_id", a.studentId)
      ).data,
    ).toEqual(before.data);
    await open();
    const nextDate = plusDays(a.date, 2);
    await dialog.getByLabel("Fecha de esta visita").fill(nextDate);
    await dialog
      .getByRole("button", { name: "Reprogramar", exact: true })
      .click();
    await expect(dialog).toBeHidden();
    await expect(page.getByLabel("Fecha de agenda")).toHaveValue(nextDate);
    await expect(
      page.locator(".agenda-row").filter({ hasText: a.name }),
    ).toContainText("Visita reprogramada desde");
    await page.reload();
    await page.getByLabel("Fecha de agenda").fill(nextDate);
    await expect(
      page.getByRole("button", {
        name: "Reprogramar a " + a.name,
        exact: true,
      }),
    ).toBeVisible();
    const destination = await a.client
      .from("visits")
      .select("id,date")
      .eq("rescheduled_from", moved.data.id)
      .single();
    expect(destination.data?.date).toBe(nextDate);
    await page.getByLabel("Fecha de agenda").fill(a.date);
    await page
      .getByRole("button", { name: new RegExp("Ver nuevo turno:.*10:30") })
      .last()
      .click();
    await expect(page.getByLabel("Fecha de agenda")).toHaveValue(nextDate);
  } finally {
    await dropFixture(a.studentId);
  }
});

test("lost response can be retried without duplicating a visit, with mobile layout", async ({
  page,
}) => {
  const a = await fixture();
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page);
    await page.getByLabel("Fecha de agenda").fill(a.date);
    await page
      .getByRole("button", { name: "Reprogramar a " + a.name, exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "Reprogramar visita" });
    await dialog.getByLabel("Horario de esta visita").fill("11:15");
    const payloads: unknown[] = [];
    await page.route("**/rest/v1/rpc/apply_training_command", async (route) => {
      const body = route.request().postDataJSON();
      if (body.command.kind !== "reschedule_visit") return route.continue();
      payloads.push(body.command);
      if (payloads.length === 1) {
        const response = await route.fetch();
        expect(response.ok()).toBe(true);
        await route.abort("failed");
      } else await route.continue();
    });
    await dialog
      .getByRole("button", { name: "Reprogramar", exact: true })
      .click();
    await expect(
      dialog.getByRole("button", { name: "Reintentar reprogramación" }),
    ).toBeEnabled();
    await expect(dialog.getByLabel("Horario de esta visita")).toBeDisabled();
    // Reload after the server applied the command but its response was lost.
    // The original visit is already marked reprogrammed, so the recovery
    // action must remain available independently of its normal row button.
    await page.reload();
    await page
      .getByRole("button", { name: "Revisar reprogramación", exact: true })
      .click();
    await expect(dialog.getByLabel("Horario de esta visita")).toHaveValue(
      "11:15",
    );
    await expect(dialog.getByLabel("Horario de esta visita")).toBeDisabled();
    await dialog
      .getByRole("button", { name: "Reintentar reprogramación" })
      .click();
    await expect(dialog).toBeHidden();
    expect(payloads).toHaveLength(2);
    expect(payloads[1]).toEqual(payloads[0]);
    const destinations = await a.client
      .from("visits")
      .select("id")
      .eq("rescheduled_from", a.id);
    expect(destinations.data).toHaveLength(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: "Reprogramar a " + a.name, exact: true })
      .click();
    await expect(dialog.getByLabel("Horario de esta visita")).toHaveValue(
      "11:15",
    );
    await page.screenshot({
      path: ".local/agenda-reschedule/mobile.png",
      fullPage: false,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      path: ".local/agenda-reschedule/desktop.png",
      fullPage: false,
    });
  } finally {
    await dropFixture(a.studentId);
  }
});

test("a rescheduled visit beyond the downloaded range remains visible after reload", async ({
  page,
}) => {
  const a = await fixture();
  try {
    await login(page);
    await page.getByLabel("Fecha de agenda").fill(a.date);
    await page
      .getByRole("button", { name: "Reprogramar a " + a.name, exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "Reprogramar visita" });
    const date = plusDays(todayKey(), 90);
    await dialog.getByLabel("Fecha de esta visita").fill(date);
    await dialog
      .getByRole("button", { name: "Reprogramar", exact: true })
      .click();
    await expect(dialog).toBeHidden();
    await expect(page.getByLabel("Fecha de agenda")).toHaveValue(date);
    await expect(
      page.locator(".agenda-row").filter({ hasText: a.name }),
    ).toContainText("09:45");
    await page.reload();
    await page.getByLabel("Fecha de agenda").fill(date);
    await expect(
      page.getByRole("button", {
        name: "Reprogramar a " + a.name,
        exact: true,
      }),
    ).toBeVisible();
  } finally {
    await dropFixture(a.studentId);
  }
});
