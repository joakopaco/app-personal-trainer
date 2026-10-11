import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { prepared } from "../fixtures/prepared";
import { accounts, dropFixture, command, execute } from "../fixtures/cloud";

async function capture(page: Page, name: string) {
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: `.local/screens/front-review/${name}.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    `${name}: horizontal overflow`,
  ).toBe(true);
  await page.screenshot({
    path: `.local/screens/front-review/${name}-viewport.png`,
  });
  const overlaps = await page.locator("main .button").evaluateAll((buttons) => {
    const visible = buttons
      .map((el) => ({
        text: el.textContent?.trim(),
        box: el.getBoundingClientRect(),
      }))
      .filter(({ box }) => box.width && box.height);
    return visible.flatMap((a, i) =>
      visible
        .slice(i + 1)
        .filter(
          (b) =>
            Math.min(a.box.right, b.box.right) -
              Math.max(a.box.left, b.box.left) >
              1 &&
            Math.min(a.box.bottom, b.box.bottom) -
              Math.max(a.box.top, b.box.top) >
              1,
        )
        .map((b) => [a.text, b.text]),
    );
  });
  expect(overlaps, `${name}: overlapping buttons`).toEqual([]);
  const clipped = await page
    .locator("main input:not([type=checkbox]), main select, main textarea")
    .evaluateAll((nodes) =>
      nodes
        .filter((n) => {
          const r = n.getBoundingClientRect(),
            p = n.parentElement!.getBoundingClientRect();
          return r.width > 0 && (r.left < p.left - 1 || r.right > p.right + 1);
        })
        .map((n) => n.outerHTML.slice(0, 160)),
    );
  expect(clipped, `${name}: fields outside container`).toEqual([]);
}

for (const width of [320, 390, 768, 1024, 1440])
  test(`frontend review and stable student header at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    mkdirSync(".local/screens/front-review", { recursive: true });
    const fixture = await prepared();
    try {
      const session = fixture.snapshot.sessions[0];
      const closed = await execute(
        fixture.client,
        command(
          fixture.workspaceId,
          fixture.studentId,
          "finish_session",
          {
            sessionId: session.id,
            quickConfirmItemIds: session.items.map((i: { id: string }) => i.id),
            allowEmpty: false,
          },
          fixture.snapshot.revision,
        ),
      );
      expect(closed.status).toBe("applied");
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/login");
      await expect(
        page.getByRole("button", { name: "Ingresar", exact: true }),
      ).toBeVisible();
      await capture(page, `${width}-login`);
      await page
        .getByRole("button", { name: "Crear cuenta", exact: true })
        .click();
      await page.screenshot({
        path: `.local/screens/front-review/${width}-register.png`,
        fullPage: true,
      });
      await page.reload();
      await page
        .getByRole("button", { name: "Olvidé mi contraseña", exact: true })
        .click();
      await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
      await page
        .getByLabel("Email", { exact: true })
        .fill("ejemplo@correo.com");
      await page.screenshot({
        path: `.local/screens/front-review/${width}-forgot-password.png`,
        fullPage: true,
      });
      await page.reload();
      await page.getByLabel("Email", { exact: true }).fill(accounts[0].email);
      await page
        .getByLabel("Contraseña", { exact: true })
        .fill(accounts[0].password);
      await page.getByRole("button", { name: "Ingresar", exact: true }).click();
      await expect(page.getByRole("navigation")).toBeVisible();
      let frame: number[] | undefined;
      for (const [name, route] of [
        ["profile", `/alumnos/${fixture.studentId}`],
        ["routine", `/alumnos/${fixture.studentId}/rutina`],
        ["progress", `/progreso/${fixture.studentId}`],
        ["history", `/historial/${fixture.studentId}`],
      ]) {
        await page.goto(route);
        await expect(page.locator(".student-heading")).toBeVisible();
        await expect(
          page.getByRole("navigation", { name: "Secciones del alumno" }),
        ).toBeVisible();
        const navSizes = await page
          .locator(".student-navigation a")
          .evaluateAll((links) =>
            links.map((link) => {
              const box = link.getBoundingClientRect();
              return { width: box.width, height: box.height };
            }),
          );
        expect(navSizes).toHaveLength(5);
        expect(
          Math.max(...navSizes.map((s) => s.height)) -
            Math.min(...navSizes.map((s) => s.height)),
        ).toBeLessThanOrEqual(1);
        expect(
          Math.max(...navSizes.map((s) => s.width)) -
            Math.min(...navSizes.map((s) => s.width)),
        ).toBeLessThanOrEqual(1);
        const positions = await page
          .locator(".student-back, .student-heading, .student-navigation")
          .evaluateAll((nodes) =>
            nodes.flatMap((node) => {
              const r = node.getBoundingClientRect();
              return [r.x, r.y, r.width, r.height];
            }),
          );
        if (!frame) frame = positions;
        else
          for (let i = 0; i < frame.length; i++)
            expect(
              Math.abs(positions[i] - frame[i]),
              `${name}: header position ${i}`,
            ).toBeLessThanOrEqual(1);
        if (name === "profile")
          await expect(
            page.getByText("Todavía no hay rutinas anteriores.", {
              exact: false,
            }),
          ).toBeVisible();
        if (name === "progress") {
          await expect(
            page.getByRole("button", {
              name: "Exportar progreso",
              exact: true,
            }),
          ).toBeEnabled();
          await expect(page.locator(".history-chart-date")).toHaveCount(1);
        }
        if (name === "history")
          await expect(
            page.getByText("Entrenamiento cerrado", { exact: false }),
          ).toBeVisible();
        await capture(page, `${width}-${name}`);
        if (name === "routine") {
          await page
            .getByRole("button", { name: "Editar rutina", exact: true })
            .click();
          await expect(page.getByLabel("Nombre de la rutina")).toBeVisible();
          await capture(page, `${width}-routine-editor`);
          await page
            .getByRole("button", { name: "Copiar semana 1 a…", exact: true })
            .click();
          const copyPanel = page.getByRole("dialog", {
            name: "Copiar semana 1",
            exact: true,
          });
          await expect(copyPanel).toBeVisible();
          const panelBox = await copyPanel.boundingBox();
          const programBox = await page
            .locator(".routine-program-settings")
            .boundingBox();
          expect(panelBox!.x).toBeGreaterThanOrEqual(programBox!.x);
          expect(panelBox!.x + panelBox!.width).toBeLessThanOrEqual(
            programBox!.x + programBox!.width,
          );
          await page.screenshot({
            path: `.local/screens/front-review/${width}-week-menu.png`,
          });
          await copyPanel
            .getByRole("button", { name: "Cancelar", exact: true })
            .click();
        }
        if (name === "progress") {
          await page
            .getByRole("button", { name: "Exportar progreso", exact: true })
            .click();
          await expect(
            page.getByRole("img", { name: "Anatomía frontal del progreso" }),
          ).toBeVisible();
          await page.screenshot({
            path: `.local/screens/front-review/${width}-progress-export.png`,
          });
          const exportHeights = await page
            .locator(".document-toolbar > .row > .button")
            .evaluateAll((buttons) =>
              buttons.map((button) => button.getBoundingClientRect().height),
            );
          expect(exportHeights).toHaveLength(2);
          expect(
            Math.abs(exportHeights[0] - exportHeights[1]),
          ).toBeLessThanOrEqual(1);
          await page.emulateMedia({ media: "print" });
          await page.pdf({
            path: `.local/screens/front-review/${width}-progress.pdf`,
            format: "A4",
            printBackground: true,
          });
          await page.emulateMedia({ media: "screen" });
          await page
            .getByRole("button", { name: "Volver", exact: true })
            .click();
        }
      }
      for (const [name, route, heading] of [
        ["today", "/hoy", "Hoy, con vos."],
        ["students", "/alumnos", "Alumnos"],
        ["catalog", "/rutinas", "Rutinas"],
        ["exercises", "/biblioteca", "Ejercicios"],
        ["settings", "/ajustes", "Mi perfil"],
      ]) {
        await page.goto(route);
        await expect(
          page.getByRole("heading", { name: heading, exact: true }),
        ).toBeVisible();
        await capture(page, `${width}-${name}`);
        if (name === "catalog") {
          await page
            .getByRole("button", { name: "Crear plantilla", exact: true })
            .click();
          await expect(page.getByLabel("Nombre de la rutina")).toBeVisible();
          await capture(page, `${width}-template-editor`);
          await page
            .getByRole("button", { name: "Agregar bloque", exact: true })
            .click();
          await page
            .getByRole("button", { name: "Agregar ejercicio", exact: true })
            .click();
          await page
            .getByRole("button", { name: "Sentadilla con barra", exact: true })
            .waitFor();
          await page.screenshot({
            path: `.local/screens/front-review/${width}-exercise-picker.png`,
          });
        }
        if (name === "settings") {
          await page
            .getByRole("button", { name: "Cambiar contraseña", exact: true })
            .click();
          await capture(page, `${width}-password-form`);
        }
        if (name === "students") {
          await page
            .getByRole("button", { name: "Agregar alumno", exact: true })
            .click();
          await expect(
            page.getByRole("heading", { name: "Nuevo alumno" }),
          ).toBeVisible();
          await capture(page, `${width}-student-form`);
        }
        if (name === "exercises") {
          const actionHeights = await page
            .locator(".exercise-card")
            .first()
            .locator(".exercise-actions > .button")
            .evaluateAll((buttons) =>
              buttons.map((button) => button.getBoundingClientRect().height),
            );
          expect(actionHeights).toHaveLength(2);
          expect(
            Math.abs(actionHeights[0] - actionHeights[1]),
          ).toBeLessThanOrEqual(1);
          await page
            .getByRole("button", { name: "Crear ejercicio propio" })
            .click();
          await capture(page, `${width}-exercise-form`);
          await page
            .getByRole("button", { name: "Cancelar", exact: true })
            .click();
          await page
            .getByRole("button", { name: "Ver detalle", exact: true })
            .first()
            .click();
          await expect(page.getByRole("dialog")).toBeVisible();
          await page.screenshot({
            path: `.local/screens/front-review/${width}-exercise-detail.png`,
          });
          await page.keyboard.press("Escape");
        }
      }
    } finally {
      await dropFixture(fixture.studentId);
    }
  });
