import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { prepared } from "../fixtures/prepared";
import { accounts, command, execute, dropFixture } from "../fixtures/cloud";

test("history and CSV retain the original series ordinal after an omitted series", async ({
  page,
}, info) => {
  const a = await prepared();
  let revision = a.snapshot.revision;
  try {
    const session = a.snapshot.sessions[0],
      item = session.items[0];
    for (const set of item.sets) {
      const reply = await execute(
        a.client,
        command(
          a.workspaceId,
          a.studentId,
          "record_set",
          {
            sessionId: session.id,
            itemId: item.id,
            setId: set.id,
            ordinal: set.ordinal,
            state: set.ordinal === 1 ? "skipped" : "done",
            weight: 20,
            reps: 10,
            durationSec: null,
          },
          revision,
        ),
      );
      expect(reply.status).toBe("applied");
      revision = reply.revision;
    }
    const closed = await execute(
      a.client,
      command(
        a.workspaceId,
        a.studentId,
        "finish_session",
        {
          sessionId: session.id,
          quickConfirmItemIds: [item.id],
          allowEmpty: false,
        },
        revision,
      ),
    );
    expect(closed.status).toBe("applied");
    await page.goto("/login");
    await page.getByLabel("Email").fill(accounts[0].email);
    await page
      .getByLabel("Contraseña", { exact: true })
      .fill(accounts[0].password);
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await expect(page.getByRole("navigation")).toBeVisible();
    await page.goto("/historial/" + a.studentId);
    await expect(
      page.getByRole("heading", { name: "Historial y progreso" }),
    ).toBeVisible();
    const downloaded = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Exportar resultados de esta página" })
      .click();
    const file = info.outputPath("series.csv");
    await (await downloaded).saveAs(file);
    const csv = readFileSync(file, "utf8");
    expect(csv).toContain(';"2";"20";"10";');
    expect(csv).not.toContain(';"1";"20";"10";');
  } finally {
    await dropFixture(a.studentId);
  }
});
