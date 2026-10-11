import { test, expect, type Page } from "@playwright/test";
import { gymFixture } from "../fixtures/gym";
import { mkdirSync } from "node:fs";

async function capture(page: Page, name: string) {
  await expect(
    page.getByText("Cargando tu espacio…", { exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const overlaps = await page.evaluate(() => {
    const dialog = document.querySelector("[role=dialog]");
    const nodes = [
      ...(dialog || document.querySelector("main")!).querySelectorAll(
        "button,a.button",
      ),
    ].filter((n) => {
      const r = n.getBoundingClientRect();
      return r.width && r.height && getComputedStyle(n).visibility !== "hidden";
    });
    const result: string[] = [];
    nodes.forEach((a, i) =>
      nodes.slice(i + 1).forEach((b) => {
        if (a.contains(b) || b.contains(a)) return;
        const x = a.getBoundingClientRect(),
          y = b.getBoundingClientRect();
        if (
          Math.min(x.right, y.right) - Math.max(x.left, y.left) > 2 &&
          Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top) > 2
        )
          result.push((a.textContent || "") + " / " + (b.textContent || ""));
      }),
    );
    return result;
  });
  expect(overlaps).toEqual([]);
  const dialog = await page.getByRole("dialog").count();
  if (!dialog) await page.evaluate(() => scrollTo(0, 0));
  const engine = page.context().browser()!.browserType().name();
  await page.screenshot({
    path: `.local/screens/front-audit/${engine}-${name}.png`,
    fullPage: !dialog,
    scale: "css",
  });
}

for (const width of [320, 768, 1440])
  test(`gym action audit: profiles, assignment, exports, duplication, own routine and timer at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    mkdirSync(".local/screens/front-audit", { recursive: true });
    const f = await gymFixture();
    const login = async (index: number) => {
      await page.goto("/login");
      await page
        .getByLabel("Email", { exact: true })
        .fill(f.accounts[index].email);
      await page
        .getByLabel("Contraseña", { exact: true })
        .fill(f.accounts[index].password);
      await page.getByRole("button", { name: "Ingresar", exact: true }).click();
      await expect(
        page.getByRole("navigation", { name: "Principal" }),
      ).toBeVisible();
    };
    try {
      await page.setViewportSize({ width, height: 900 });
      await login(0);
      await expect(
        page.getByRole("heading", { name: "Actividad reciente" }),
      ).toBeVisible();
      await capture(page, `admin-home-${width}`);
      await page.getByRole("link", { name: "Entrenados", exact: true }).click();
      await page.getByLabel("Buscar entrenado").fill("no existe");
      await expect(
        page.getByRole("heading", { name: "Sin coincidencias" }),
      ).toBeVisible();
      await page.getByLabel("Buscar entrenado").fill("Alex");
      await page.getByRole("link", { name: /Alex García/ }).click();
      await expect(
        page.getByRole("button", { name: "Editar ficha", exact: true }),
      ).toBeVisible();
      await capture(page, `member-profile-${width}`);
      await page
        .getByRole("button", { name: "Editar ficha", exact: true })
        .click();
      await page.getByLabel("Nombre y apellido").fill("Alex García López");
      await page.getByLabel("Género").selectOption("female");
      await page
        .getByLabel("Notas privadas")
        .fill("Nota exclusiva del gimnasio");
      await capture(page, `edit-profile-${width}`);
      await page
        .getByRole("button", { name: "Guardar ficha", exact: true })
        .click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "Alex García López",
      );
      await page
        .getByRole("button", { name: "Suspender acceso", exact: true })
        .click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Cerrar", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Asignar rutina", exact: true })
        .click();
      await page
        .getByRole("dialog")
        .getByRole("combobox")
        .selectOption(f.revisionId);
      await capture(page, `assign-${width}`);
      await page
        .getByRole("button", { name: "Preparar copia", exact: true })
        .click();
      await expect(page.getByLabel("Nombre de la rutina")).toHaveValue(
        "Fuerza inicial",
      );
      await page
        .getByRole("button", { name: "Publicar rutina", exact: true })
        .click();
      await expect(page).toHaveURL(/\/gimnasio\/entrenados\//);
      await page.goto("/gimnasio/rutinas");
      await page
        .getByRole("button", { name: "Ver rutina", exact: true })
        .click();
      const labels = await page
        .locator(".routine-summary-exercises dt")
        .evaluateAll((nodes) =>
          nodes.map((n) => {
            const range = document.createRange();
            range.selectNodeContents(n);
            const r = range.getBoundingClientRect();
            return {
              left: r.left,
              right: r.right,
              top: r.top,
              bottom: r.bottom,
            };
          }),
        );
      for (let i = 0; i < labels.length; i++)
        for (let j = i + 1; j < labels.length; j++) {
          const a = labels[i],
            b = labels[j];
          expect(
            Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0 &&
              Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0,
          ).toBe(false);
        }
      await capture(page, `routine-detail-${width}`);
      await page
        .getByRole("button", { name: "Exportar rutina", exact: true })
        .click();
      await page.evaluate(() => {
        window.print = () => {
          document.body.dataset.printed = "yes";
        };
      });
      await page
        .getByRole("button", { name: "Guardar PDF / imprimir" })
        .click();
      expect(await page.locator("body").getAttribute("data-printed")).toBe(
        "yes",
      );
      await capture(page, `routine-export-${width}`);
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Volver", exact: true })
        .click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Cerrar", exact: true })
        .click();
      await page.getByRole("button", { name: "Duplicar", exact: true }).click();
      await expect(page.getByLabel("Nombre de la rutina")).toHaveValue(
        "Fuerza inicial · Copia",
      );
      await page
        .getByRole("button", { name: "Descartar borrador", exact: true })
        .click();
      await capture(page, `discard-${width}`);
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Descartar borrador", exact: true })
        .click();
      await page.getByRole("link", { name: "Ajustes", exact: true }).click();
      await page.getByLabel("Nombre del gimnasio").fill("Horizonte Fitness");
      await page
        .getByRole("button", { name: "Guardar nombre", exact: true })
        .click();
      await expect(
        page.getByText("Nombre guardado.", { exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Cerrar sesión", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Ingresar", exact: true }),
      ).toBeVisible();
      await expect(page).toHaveURL(/\/$/);
      await login(1);
      await expect(
        page.getByRole("link", { name: "Explorar rutinas", exact: true }),
      ).toBeVisible();
      await capture(page, `member-home-${width}`);
      await expect(page.getByText("Nota exclusiva del gimnasio")).toHaveCount(
        0,
      );
      await page.getByRole("link", { name: "Rutinas", exact: true }).click();
      await page.getByRole("button", { name: "Para mí", exact: true }).click();
      await page
        .getByRole("button", { name: "Elegir rutina", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "En uso", exact: true }),
      ).toBeDisabled();
      await capture(page, `personal-routines-${width}`);
      await page
        .getByRole("button", { name: "Mi rutina", exact: true })
        .click();
      await page
        .getByRole("link", { name: "Crear mi rutina", exact: true })
        .click();
      await page.getByLabel("Nombre de la rutina").fill("Mi fuerza");
      await page
        .getByRole("button", { name: "Agregar bloque", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Agregar ejercicio", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Sentadilla con barra", exact: true })
        .click();
      await page.getByLabel("Series", { exact: true }).selectOption("3");
      await page.getByLabel("Peso kg", { exact: true }).fill("20");
      await page.getByLabel("Repeticiones", { exact: true }).selectOption("8");
      await page.getByRole("button", { name: /Copiar semana 1 a/ }).click();
      await page
        .getByRole("button", { name: "Copiar a 3 semanas", exact: true })
        .click();
      await capture(page, `own-editor-${width}`);
      await page
        .getByRole("button", { name: "Guardar borrador", exact: true })
        .click();
      await expect(page).not.toHaveURL(/\/nueva$/);
      await page
        .getByRole("button", { name: "Publicar rutina", exact: true })
        .click();
      await expect(page).toHaveURL(/\/mi-entrenamiento\/rutinas$/);
      await page
        .getByRole("button", { name: "Mi rutina", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Elegir rutina", exact: true })
        .click();
      await page.getByRole("link", { name: "Entrenar", exact: true }).click();
      await page
        .getByRole("button", { name: "Empezar entrenamiento", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Iniciar descanso", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Pausar descanso", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Agregar 15 segundos", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Reiniciar descanso", exact: true })
        .click();
      await page
        .getByLabel("Confirmar serie 1 de Sentadilla con barra")
        .check();
      await page
        .getByRole("button", { name: "Guardar entrenamiento", exact: true })
        .click();
      await page.evaluate(() => scrollTo(0, 0));
      await capture(page, `training-${width}`);
      await page
        .getByRole("button", { name: "Finalizar entrenamiento", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Confirmar finalización", exact: true })
        .click();
      await page.getByRole("link", { name: "Progreso", exact: true }).click();
      await expect(page.getByText("160 kg", { exact: true })).toBeVisible();
      await page.locator(".gym-history-item summary").click();
      await capture(page, `progress-${width}`);
      await page
        .getByRole("button", { name: "Exportar progreso", exact: true })
        .click();
      await expect(
        page.getByRole("dialog").locator("svg").first(),
      ).toBeVisible();
      await capture(page, `progress-export-${width}`);
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Volver", exact: true })
        .click();
      await page.getByRole("link", { name: "Mi cuenta", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Mi perfil", exact: true }),
      ).toBeVisible();
      await capture(page, `member-account-${width}`);
    } finally {
      await f.cleanup();
    }
  });
