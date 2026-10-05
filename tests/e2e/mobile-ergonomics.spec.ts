import { test, expect, type Page } from "@playwright/test";
import { prepared } from "../fixtures/prepared";
import { accounts, command, execute, dropFixture } from "../fixtures/cloud";
import { routineFixture } from "../fixtures/routine";
import { cloneRoutineDocument } from "@pulso/domain/routines";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(accounts[0].email);
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill(accounts[0].password);
  await page.getByRole("button", { name: "Ingresar", exact: true }).tap();
  await expect(
    page.getByRole("heading", { name: "Hoy, con vos." }),
  ).toBeVisible();
}
async function fits(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const overflow = await page
    .locator("main input:not([type=checkbox]), main select")
    .evaluateAll((nodes) =>
      nodes
        .filter((n) => {
          const r = n.getBoundingClientRect(),
            p = n.parentElement!.getBoundingClientRect();
          return r.width && (r.left < p.left - 1 || r.right > p.right + 1);
        })
        .map((n) => n.outerHTML.slice(0, 130)),
    );
  expect(overflow).toEqual([]);
  const collisions = await page.locator("main .button").evaluateAll((nodes) => {
    const boxes = nodes
      .map((n) => ({ text: n.textContent, r: n.getBoundingClientRect() }))
      .filter((n) => n.r.width && n.r.height);
    return boxes.flatMap((a, i) =>
      boxes
        .slice(i + 1)
        .filter(
          (b) =>
            Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left) > 1 &&
            Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top) > 1,
        )
        .map((b) => [a.text, b.text]),
    );
  });
  expect(collisions).toEqual([]);
}
test("touch arrival flow and persistent visual rest timer", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const doc = routineFixture();
  const extra = cloneRoutineDocument(doc);
  doc.weeks.forEach((w, i) => {
    extra.weeks[i][0].name = "Día 2";
    w.push(extra.weeks[i][0]);
  });
  const f = await prepared(doc);
  const other = await prepared();
  try {
    const s = f.snapshot.sessions[0];
    const closed = await execute(
      f.client,
      command(
        f.workspaceId,
        f.studentId,
        "finish_session",
        {
          sessionId: s.id,
          quickConfirmItemIds: s.items.map((i: { id: string }) => i.id),
          allowEmpty: false,
        },
        f.snapshot.revision,
      ),
    );
    expect(closed.status).toBe("applied");
    await login(page);
    await page
      .getByRole("button", { name: "Agregar ahora", exact: true })
      .tap();
    const modal = page.getByRole("dialog", { name: "Agregar entrenamiento" });
    await modal.getByRole("button", { name: "Cerrar", exact: true }).tap();
    await expect(modal).toHaveCount(0);
    await page
      .getByRole("button", { name: "Agregar ahora", exact: true })
      .tap();
    await modal.getByLabel("Buscar alumno").fill(f.snapshot.student.name);
    await page.screenshot({
      path: `.local/screens/mobile/${info.project.name}-student-picker.png`,
      scale: "css",
    });
    await modal
      .getByRole("button", { name: f.snapshot.student.name, exact: true })
      .tap();
    await modal
      .getByRole("button", { name: "Cambiar alumno", exact: true })
      .tap();
    await modal
      .getByRole("button", { name: f.snapshot.student.name, exact: true })
      .tap();
    await modal.getByRole("button", { name: "Semana 2", exact: true }).tap();
    await expect(
      modal.getByRole("button", { name: "Semana 2", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await modal.getByRole("button", { name: "Semana 1", exact: true }).tap();
    const dayPicker = modal.locator(".arrival-day-trigger");
    await dayPicker.tap();
    await expect(dayPicker).toHaveAttribute("aria-expanded", "true");
    await modal
      .locator(".arrival-day-options")
      .getByRole("button", { name: "Día 2", exact: true })
      .tap();
    await expect(dayPicker).toHaveText("Día 2");
    await expect(dayPicker).toHaveAttribute("aria-expanded", "false");
    await page.screenshot({
      path: `.local/screens/mobile/${info.project.name}-arrival.png`,
    });
    await modal
      .getByRole("button", { name: "Iniciar entrenamiento", exact: true })
      .tap();
    await expect(page).toHaveURL(new RegExp("/entrenar/" + f.studentId));
    await expect
      .poll(async () => {
        const { data } = await f.client.rpc("fetch_student", {
          workspace_id: f.workspaceId,
          student_id: f.studentId,
        });
        return data?.sessions?.[0]?.day_id;
      })
      .toBe(doc.weeks[0][1].id);
    const timer = page.getByRole("region", {
      name: "Temporizador de descanso",
    });
    await expect(timer.getByRole("timer")).toHaveText("1:00");
    await timer
      .getByRole("button", { name: "Iniciar descanso", exact: true })
      .tap();
    await expect(
      timer.getByRole("button", { name: "Pausar descanso" }),
    ).toBeVisible();
    await timer.getByRole("button", { name: "Pausar descanso" }).tap();
    await expect(
      timer.getByRole("button", { name: "Continuar descanso" }),
    ).toBeVisible();
    const before = await timer.getByRole("timer").innerText();
    await timer.getByRole("button", { name: "Agregar 15 segundos" }).tap();
    const seconds = (v: string) =>
      v.split(":").reduce((a, b) => a * 60 + Number(b), 0);
    await expect
      .poll(async () => seconds(await timer.getByRole("timer").innerText()))
      .toBe(seconds(before) + 15);
    const after = await timer.getByRole("timer").innerText();
    expect(seconds(after) - seconds(before)).toBe(15);
    await page.reload();
    await expect(timer.getByRole("timer")).toHaveText(after);
    await expect(
      timer.getByRole("button", { name: "Continuar descanso" }),
    ).toBeVisible();
    await page.goto("/entrenar/" + other.studentId);
    await expect(timer.getByRole("timer")).toHaveText("1:00");
    await page.goto("/entrenar/" + f.studentId);
    await expect(timer.getByRole("timer")).toHaveText(after);
    await fits(page);
    await page.screenshot({
      path: `.local/screens/mobile/${info.project.name}-timer.png`,
      fullPage: true,
      scale: "css",
    });
    await timer.getByRole("button", { name: "Continuar descanso" }).tap();
    await expect
      .poll(async () => seconds(await timer.getByRole("timer").innerText()), {
        timeout: 5000,
      })
      .toBeLessThan(seconds(after));
    await timer.getByRole("button", { name: "Reiniciar descanso" }).tap();
    await expect(timer.getByRole("timer")).toHaveText("1:00");
    await timer
      .getByRole("button", { name: "Iniciar descanso", exact: true })
      .tap();
    await page.clock.install();
    await page.clock.fastForward(61000);
    await expect(timer.getByRole("timer")).toHaveText("0:00");
    await expect(
      timer.getByText("Descanso terminado", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Finalizar entrenamiento", exact: true })
      .scrollIntoViewIfNeeded();
    const topbar = page.locator(".training-topbar");
    const back = topbar.getByRole("link", { name: "Volver a Hoy" });
    await expect(back).toBeVisible();
    expect((await topbar.boundingBox())!.y).toBeGreaterThanOrEqual(0);
    expect((await topbar.boundingBox())!.y).toBeLessThan(2);
    const nameBox = (await topbar.locator("h1").boundingBox())!;
    const backBox = (await back.boundingBox())!;
    expect(nameBox.x).toBeGreaterThan(backBox.x + backBox.width);
    expect(
      Math.abs(nameBox.y + nameBox.height / 2 - backBox.y - backBox.height / 2),
    ).toBeLessThan(2);
    await page.screenshot({
      path: `.local/screens/mobile/${info.project.name}-sticky-training.png`,
      scale: "css",
    });
    await page
      .getByRole("button", { name: "Finalizar entrenamiento", exact: true })
      .tap();
    await page
      .getByRole("button", { name: "Confirmar cierre", exact: true })
      .tap();
    await expect(
      page.getByRole("heading", { name: "Entrenamiento finalizado" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Ver progreso", exact: true }),
    ).toHaveCount(0);
  } finally {
    await dropFixture(f.studentId);
    await dropFixture(other.studentId);
  }
});

test("all primary screens fit narrow phones and tablet, including native date fields", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const f = await prepared();
  try {
    await login(page);
    for (const width of [320, 375, 768]) {
      await page.setViewportSize({ width, height: 844 });
      for (const [name, route, ready] of [
        ["today", "/hoy", ".agenda-date-controls input"],
        ["students", "/alumnos", ".student-card"],
        ["profile", `/alumnos/${f.studentId}`, ".student-heading"],
        ["routine", `/alumnos/${f.studentId}/rutina`, ".student-heading"],
        ["progress", `/progreso/${f.studentId}`, ".student-heading"],
        ["history", `/historial/${f.studentId}`, ".history-dates"],
        ["live", `/entrenar/${f.studentId}`, ".training-header"],
        ["catalog", "/rutinas", "h1"],
        ["library", "/biblioteca", "h1"],
        ["settings", "/ajustes", "h1"],
      ]) {
        await page.goto(route);
        await expect(page.locator(ready).first()).toBeVisible();
        await fits(page);
        await page.screenshot({
          path: `.local/screens/mobile/${info.project.name}-${width}-${name}.png`,
          fullPage: name !== "library",
          scale: "css",
        });
        if (width === 320) {
          if (name === "students") {
            await page
              .getByRole("button", { name: "Agregar alumno", exact: true })
              .tap();
            await expect(
              page.getByRole("heading", { name: "Nuevo alumno" }),
            ).toBeVisible();
          } else if (name === "routine") {
            await page
              .getByRole("button", { name: "Editar rutina", exact: true })
              .tap();
            await expect(page.getByLabel("Nombre de la rutina")).toBeVisible();
          } else if (name === "settings") {
            await page
              .getByRole("button", { name: "Cambiar contraseña", exact: true })
              .tap();
          } else if (name === "library") {
            await page
              .getByRole("button", {
                name: "Crear ejercicio propio",
                exact: true,
              })
              .tap();
          }
          await fits(page);
          await page.screenshot({
            path: `.local/screens/mobile/${info.project.name}-${width}-${name}-form.png`,
            scale: "css",
          });
        }
        if (name === "history") {
          await page.getByLabel("Desde", { exact: true }).fill("2026-01-01");
          await page.getByLabel("Hasta", { exact: true }).fill("2026-12-31");
          await fits(page);
        }
      }
    }
  } finally {
    await dropFixture(f.studentId);
  }
});
