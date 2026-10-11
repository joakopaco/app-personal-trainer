import { test, expect } from "@playwright/test";
import { prepared } from "../fixtures/prepared";
import { accounts, dropFixture } from "../fixtures/cloud";
test("five simultaneous students keep their own weight while switching immediately", async ({
  page,
}) => {
  test.setTimeout(60000);
  const students: Awaited<ReturnType<typeof prepared>>[] = [];
  try {
    for (let n = 0; n < 5; n++) students.push(await prepared());
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/hoy");
    await page.getByLabel("Email").fill(accounts[0].email);
    await page
      .getByLabel("Contraseña", { exact: true })
      .fill(accounts[0].password);
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await expect(page.getByRole("navigation")).toBeVisible();
    await page.goto("/entrenar/" + students[0].studentId);
    for (let n = 0; n < 5; n++) {
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        students[n].snapshot.student.name,
      );

      await page.getByLabel("Peso serie 1").fill(String(21 + n * 5));
      if (n < 4)
        await page
          .locator(".active-strip")
          .getByRole("link", { name: students[n + 1].snapshot.student.name })
          .click();
      else await page.getByLabel("Peso serie 1").blur();
    }
    for (let n = 0; n < 5; n++) {
      await page
        .locator(".active-strip")
        .getByRole("link", { name: students[n].snapshot.student.name })
        .click();
      await expect(page.getByLabel("Peso serie 1")).toHaveValue(
        String(21 + n * 5),
      );
      await page
        .getByRole("button", { name: "Registrar serie 1", exact: true })
        .click();
      await expect
        .poll(
          async () => {
            const r = await students[n].client
              .from("session_sets")
              .select("weight")
              .order("ordinal")
              .eq("student_id", students[n].studentId);
            return r.data?.map((s) => s.weight);
          },
          { timeout: 20000 },
        )
        .toEqual([21 + n * 5, 20]);
    }
    const overflow = await page.evaluate(() =>
      Array.from(document.querySelectorAll("body *"))
        .filter((e) => e.getBoundingClientRect().right > innerWidth + 1)
        .map((e) => ({
          tag: e.tagName,
          cls: e.className,
          width: e.getBoundingClientRect().width,
        })),
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      JSON.stringify(overflow),
    ).toBe(true);
  } finally {
    for (const a of students) await dropFixture(a.studentId);
  }
});
