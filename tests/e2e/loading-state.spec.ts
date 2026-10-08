import { expect, test } from "@playwright/test";

test("boot loading indicator stays centered on mobile and honors reduced motion", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/src/app/router.tsx*", async (route) => {
    await gate;
    await route.continue();
  });
  try {
    await page.goto("/hoy", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("status")).toHaveText("Cargando…");
    const mark = page.locator(".pulso-loading-mark");
    await expect(mark).toBeVisible();
    const box = await mark.boundingBox();
    const contentWidth = await page.evaluate(
      () => document.documentElement.clientWidth,
    );
    expect(Math.abs(box!.x + box!.width / 2 - contentWidth / 2)).toBeLessThan(
      2,
    );
    expect(Math.abs(box!.y + box!.height / 2 - 422)).toBeLessThan(30);
    await expect(page.locator(".pulso-loading-ring")).toHaveCSS(
      "animation-name",
      "none",
    );
    await page.screenshot({ path: ".local/screens/loading-state-mobile.png" });
  } finally {
    release();
  }
});
