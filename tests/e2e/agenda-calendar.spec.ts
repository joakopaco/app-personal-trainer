import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  accounts,
  command,
  execute,
  createStudent,
  dropFixture,
  adminClient,
} from "../fixtures/cloud";
import { todayKey } from "../../packages/domain/src/dates";
import { shiftMonth } from "../../apps/web/src/features/agenda/calendar";

test("calendar opens top right, shows real visits, future schedules and remote months at desktop and mobile sizes", async ({
  page,
}) => {
  const a = await createStudent();
  try {
    let revision = a.revision;
    const today = todayKey();
    const schedule = await execute(
      a.client,
      command(
        a.workspaceId,
        a.studentId,
        "save_schedule",
        { weekdays: [1, 3], time: "07:30" },
        revision,
      ),
    );
    expect(schedule.status).toBe("applied");
    revision = schedule.revision;
    const name = schedule.patch.student.name as string;
    for (const date of [today, shiftMonth(today.slice(0, 7), 4) + "-15"]) {
      const result = await execute(
        a.client,
        command(
          a.workspaceId,
          a.studentId,
          "create_visit",
          { visitId: randomUUID(), date, time: "09:45" },
          revision,
        ),
      );
      expect(result.status).toBe("applied");
      revision = result.revision;
    }
    const { error } = await adminClient()
      .from("visits")
      .insert({
        id: randomUUID(),
        workspace_id: a.workspaceId,
        student_id: a.studentId,
        date: today,
        time: "16:00",
        source: "extra",
        status: "cancelled",
      });
    expect(error).toBeNull();
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(accounts[0].email);
    await page
      .getByLabel("Contraseña", { exact: true })
      .fill(accounts[0].password);
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    const trigger = page.getByRole("button", {
      name: "Calendario",
      exact: true,
    });
    await expect(trigger).toBeVisible();
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await trigger.click();
      const dialog = page.getByRole("dialog", {
        name: "Calendario de alumnos",
      });
      const roster = dialog.getByRole("region", { name: "Alumnos del día" });
      await expect(roster.getByText(name, { exact: true })).toHaveCount(
        2 +
          (schedule.patch.visits.some((v: { date: string }) => v.date === today)
            ? 1
            : 0),
      );
      await expect(roster.getByText("09:45")).toBeVisible();
      await expect(roster.getByText("Cancelado")).toBeVisible();
      expect(
        await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      ).toBe(true);
      await page.screenshot({
        path: `.local/screens/calendar-${width}.png`,
        fullPage: true,
      });
      await page.keyboard.press("Escape");
      await expect(dialog).not.toBeVisible();
      await expect(trigger).toBeFocused();
    }
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Calendario de alumnos" });
    await dialog.getByRole("button", { name: "Mes siguiente" }).click();
    await expect(
      dialog.getByText(/Los horarios habituales son una previsión/),
    ).toBeVisible();
    for (let i = 0; i < 3; i++)
      await dialog.getByRole("button", { name: "Mes siguiente" }).click();
    const dayButton = dialog
      .locator(".calendar-day")
      .filter({ has: page.locator("span", { hasText: /^15$/ }) });
    await dayButton.click();
    const roster = dialog.getByRole("region", { name: "Alumnos del día" });
    await expect(roster.getByRole("link", { name, exact: true })).toBeVisible();
    await expect(roster.getByText("09:45")).toBeVisible();
    await dialog.getByRole("button", { name: "Ver agenda del día" }).click();
    await expect(page.getByLabel("Fecha de agenda")).toHaveValue(
      shiftMonth(today.slice(0, 7), 4) + "-15",
    );
    await expect(page.getByText("09:45", { exact: true })).toBeVisible();
  } finally {
    await dropFixture(a.studentId);
  }
});
