import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { gymDocument, gymFixture } from "../fixtures/gym";
import { adminClient } from "../fixtures/cloud";

test("trainee can see rest and validation feedback beside the active exercise on long workouts", async ({
  page,
}) => {
  test.setTimeout(90000);
  const f = await gymFixture();
  const day = gymDocument().weeks[0][0];
  const original = day.blocks[0].exercises[0];
  day.blocks[0].exercises = [
    { ...original, prescription: { ...original.prescription, sets: 4 } },
    {
      ...original,
      id: randomUUID(),
      lineageId: randomUUID(),
      type: "reps",
      name: "Flexiones con pausa y apoyo de rodillas",
      group: "Pecho",
      prescription: { ...original.prescription, sets: 4 },
    },
    {
      ...original,
      id: randomUUID(),
      lineageId: randomUUID(),
      name: "Sentadilla goblet con pausa controlada al bajar",
      prescription: { ...original.prescription, sets: 4, microRest: 90 },
    },
  ];
  const exercise = day.blocks[0].exercises[2];
  try {
    const seeded = await adminClient().from("gym_sessions").insert({
      gym_id: f.gym.id,
      member_id: f.accounts[1].userId,
      routine_revision_id: f.revisionId,
      routine_name: "Fuerza y control · cuerpo completo",
      week: 0,
      day,
      status: "open",
    });
    if (seeded.error) throw seeded.error;
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(f.accounts[1].email);
    await page
      .getByLabel("Contraseña", { exact: true })
      .fill(f.accounts[1].password);
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await page.getByRole("link", { name: "Continuar entrenamiento" }).click();
    const card = page.locator("article").filter({
      has: page.getByRole("heading", { name: exercise.name, exact: true }),
    });
    const weight = card.getByLabel(`Peso serie 1 de ${exercise.name}`, {
      exact: true,
    });
    const confirmation = card.getByLabel(
      `Confirmar serie 1 de ${exercise.name}`,
    );
    const engine = page.context().browser()!.browserType().name();
    mkdirSync(".local/screens/ergonomics", { recursive: true });
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 700 });
      await expect(weight).toBeVisible();
      const controls = await page
        .locator(".gym-member-set input")
        .evaluateAll((nodes) =>
          nodes.map((node) => {
            const bounds = node.getBoundingClientRect();
            return {
              width: bounds.width,
              height: bounds.height,
              font: parseFloat(getComputedStyle(node).fontSize),
              type: (node as HTMLInputElement).type,
            };
          }),
        );
      for (const control of controls) {
        expect(control.width).toBeGreaterThanOrEqual(44);
        expect(control.height).toBeGreaterThanOrEqual(48);
        if (control.type !== "checkbox")
          expect(control.font).toBeGreaterThanOrEqual(16);
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await card
        .getByRole("button", {
          name: `Iniciar descanso entre series de ${exercise.name}`,
        })
        .click();
      await expect(page.getByRole("timer")).toBeInViewport();
      await expect(page.getByRole("timer")).toHaveCount(1);
      await page.screenshot({
        path: `.local/screens/ergonomics/${engine}-rest-${width}.png`,
        scale: "css",
      });
      const timerButtons = page.locator(".rest-clock button");
      await expect(timerButtons).toHaveCount(3);
      const dimensions = await timerButtons.evaluateAll((nodes) =>
        nodes.map((n) => ({
          w: n.getBoundingClientRect().width,
          h: n.getBoundingClientRect().height,
        })),
      );
      expect(
        Math.max(...dimensions.map((r) => r.h)) -
          Math.min(...dimensions.map((r) => r.h)),
      ).toBeLessThan(1);
      expect(
        Math.max(...dimensions.map((r) => r.w)) -
          Math.min(...dimensions.map((r) => r.w)),
      ).toBeLessThan(1);
      await weight.fill("");
      await confirmation.click();
      await expect(card.getByRole("alert")).toBeInViewport();
      await expect(confirmation).not.toBeChecked();
      await page.screenshot({
        path: `.local/screens/ergonomics/${engine}-feedback-${width}.png`,
        scale: "css",
      });
      await weight.fill("27.5");
      await confirmation.check();
      await expect(card.getByRole("alert")).toHaveCount(0);
      await card
        .getByRole("button", { name: `Corregir serie 1 de ${exercise.name}` })
        .click();
    }
    // Short viewport models reduced space while editing; focus must stay above navigation.
    await page.setViewportSize({ width: 390, height: 400 });
    await weight.click();
    await page.keyboard.press("Tab");
    const reps = card.getByLabel(`Repeticiones serie 1 de ${exercise.name}`, {
      exact: true,
    });
    await expect(reps).toBeFocused();
    const visible = await reps.evaluate((node) => {
      const r = node.getBoundingClientRect();
      const header = document
        .querySelector(".gym-training-header")!
        .getBoundingClientRect();
      const nav = document.querySelector(".sidebar")!.getBoundingClientRect();
      return r.top >= header.bottom && r.bottom <= nav.top;
    });
    expect(visible).toBe(true);
    await page.screenshot({
      path: `.local/screens/ergonomics/${engine}-short-viewport.png`,
      scale: "css",
    });
    // A rejected save/finalization must lead back to the actual invalid row.
    await reps.fill("0");
    await page
      .getByRole("button", { name: "Guardar entrenamiento", exact: true })
      .click();
    await expect(card.getByRole("alert")).toBeInViewport();
    await expect(page.getByText("Guardado", { exact: true })).toHaveCount(0);
    await page
      .getByRole("button", { name: "Finalizar entrenamiento", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirmar finalización", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(card.getByRole("alert")).toBeInViewport();
    await reps.fill("8");
    await weight.fill("");
    await weight.pressSequentially("27,5");
    await page
      .getByRole("button", { name: "Guardar entrenamiento", exact: true })
      .click();
    await expect(page.getByText("Guardado", { exact: true })).toBeVisible();
    await page.reload();
    await expect(weight).toHaveValue("27.5");
  } finally {
    await f.cleanup();
  }
});
