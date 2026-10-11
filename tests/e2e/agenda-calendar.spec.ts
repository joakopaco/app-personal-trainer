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

test("weekly calendar aligns with title and shows daily details below one row at desktop and mobile sizes", async ({
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
    const { error } = await adminClient().from("visits").insert({
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
      await page.setViewportSize({ width, height: 740 });
      const triggerBox = (await trigger.boundingBox())!;
      const titleBox = (await page
        .getByRole("heading", { name: "Hoy, con vos." })
        .boundingBox())!;
      expect(Math.abs(triggerBox.width - triggerBox.height)).toBeLessThan(1);
      expect(
        Math.abs(
          triggerBox.y +
            triggerBox.height / 2 -
            titleBox.y -
            titleBox.height / 2,
        ),
      ).toBeLessThan(2);
      await expect(trigger).toHaveText("");
      await page.screenshot({
        path: `.local/screens/calendar-trigger-${width}.png`,
        fullPage: true,
      });
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
      const strip = dialog.getByRole("group", { name: "Días de la semana" });
      await expect(strip.getByRole("button")).toHaveCount(7);
      const positions = await strip
        .getByRole("button")
        .evaluateAll((nodes) =>
          nodes.map((n) => n.getBoundingClientRect().top),
        );
      expect(new Set(positions).size).toBe(1);
      const stripBox = (await strip.boundingBox())!;
      const rosterBox = (await roster.boundingBox())!;
      expect(rosterBox.y).toBeGreaterThanOrEqual(stripBox.y + stripBox.height);
      expect(rosterBox.y).toBeLessThan(400);
      const close = dialog.getByRole("button", { name: "Cerrar calendario" });
      await expect(close).toHaveText("");
      const sizes = await dialog
        .locator(".calendar-controls .button, .calendar-close")
        .evaluateAll((nodes) =>
          nodes.map((n) => n.getBoundingClientRect().height),
        );
      expect(sizes.every((h) => h === 44)).toBe(true);
      await page.screenshot({
        path: `.local/screens/calendar-${width}.png`,
        fullPage: true,
      });
      await page.keyboard.press("Escape");
      await expect(dialog).not.toBeVisible();
      await expect(trigger).toBeFocused();
    }
    await trigger.click();
    let dialog = page.getByRole("dialog", { name: "Calendario de alumnos" });
    const selectedDay = await dialog
      .locator('[aria-pressed="true"]')
      .getAttribute("aria-label");
    await dialog.getByRole("button", { name: "Semana siguiente" }).click();
    await expect(dialog.locator('[aria-pressed="true"]')).not.toHaveAttribute(
      "aria-label",
      selectedDay!,
    );
    await dialog.getByRole("button", { name: "Semana anterior" }).click();
    await expect(dialog.locator('[aria-pressed="true"]')).toHaveAttribute(
      "aria-label",
      selectedDay!,
    );
    await dialog.getByRole("button", { name: "Cerrar calendario" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
    const futureDate = shiftMonth(today.slice(0, 7), 4) + "-15";
    await page.getByLabel("Fecha de agenda").fill(futureDate);
    await trigger.click();
    dialog = page.getByRole("dialog", { name: "Calendario de alumnos" });
    // A far week loads real visits beyond the snapshot window; Monday also
    // retains the habitual preview even when the week spans two months.
    await dialog.getByRole("button", { name: /^lunes,/ }).click();
    await expect(
      dialog.getByText(/Los horarios habituales son una previsión/),
    ).toBeVisible();
    await dialog.getByRole("button", { name: /, 15 de / }).click();
    const roster = dialog.getByRole("region", { name: "Alumnos del día" });
    await expect(
      roster
        .locator("li")
        .filter({ hasText: "09:45" })
        .getByRole("link", { name, exact: true }),
    ).toBeVisible();
    await expect(roster.getByText("09:45")).toBeVisible();
    await dialog.getByRole("button", { name: "Ver agenda del día" }).click();
    await expect(page.getByLabel("Fecha de agenda")).toHaveValue(
      shiftMonth(today.slice(0, 7), 4) + "-15",
    );
    await expect(page.getByText("09:45", { exact: true })).toBeVisible();

    // A year boundary must keep all seven days on one line even on a small phone.
    await page
      .getByLabel("Fecha de agenda")
      .fill(`${Number(today.slice(0, 4)) + 1}-01-01`);
    await trigger.click();
    await expect(
      dialog
        .getByRole("group", { name: "Días de la semana" })
        .getByRole("button"),
    ).toHaveCount(7);
    expect(
      await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    await dialog.getByRole("button", { name: "Hoy", exact: true }).click();
    await expect(dialog.locator('[aria-pressed="true"]')).toHaveAttribute(
      "aria-current",
      "date",
    );
    await dialog.getByRole("button", { name: "Cerrar calendario" }).click();
  } finally {
    await dropFixture(a.studentId);
  }
});
