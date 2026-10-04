import { test, expect } from "@playwright/test";
import { prepared } from "../fixtures/prepared";
import { accounts, command, execute, dropFixture } from "../fixtures/cloud";

test("history shows audit changes without session or export controls and retains original series data", async ({
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
      page.getByRole("heading", { name: "Registro de cambios", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Entrenamiento cerrado", { exact: false }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /exportar/i })).toHaveCount(
      0,
    );
    await expect(
      page.getByText("Sesiones y registros", { exact: true }),
    ).toHaveCount(0);
    const results = await a.client
      .from("session_sets")
      .select("ordinal,state,weight,reps")
      .eq("item_id", item.id)
      .order("ordinal");
    expect(results.error).toBeNull();
    expect(results.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ordinal: 1, state: "skipped" }),
        expect.objectContaining({
          ordinal: 2,
          state: "done",
          weight: 20,
          reps: 10,
        }),
      ]),
    );
  } finally {
    await dropFixture(a.studentId);
  }
});
