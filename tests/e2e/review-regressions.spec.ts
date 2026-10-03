import { test, expect, type Page } from "@playwright/test";
import { prepared } from "../fixtures/prepared";
import { readFileSync } from "node:fs";
import {
  accounts,
  adminClient,
  command,
  execute,
  dropFixture,
  createStudent,
} from "../fixtures/cloud";
async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(accounts[0].email);
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill(accounts[0].password);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page.getByRole("navigation")).toBeVisible();
}

test("unregistered annotations remain reviewable and exportable from sync center", async ({
  page,
}, info) => {
  const a = await prepared();
  try {
    await login(page);
    await page.goto("/entrenar/" + a.studentId);
    await page.getByRole("button", { name: /Detalle de series/ }).click();
    await page.getByLabel("Peso serie 2", { exact: true }).fill("27,5");
    await page.goto("/sincronizacion");
    await expect(
      page.getByRole("heading", { name: "Anotaciones sin registrar" }),
    ).toBeVisible();
    await expect(
      page.getByText("Peso: 27,5 · Reps: 10", { exact: true }),
    ).toBeVisible();
    page.on("dialog", (dialog) => dialog.accept());
    const pending = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Exportar y descartar anotación" })
      .click();
    const file = info.outputPath("annotation.json");
    await (await pending).saveAs(file);
    expect(JSON.parse(readFileSync(file, "utf8")).raw).toContain("27,5");
    await expect(
      page.getByRole("heading", { name: "Anotaciones sin registrar" }),
    ).toHaveCount(0);
    await page.goto("/entrenar/" + a.studentId);
    await expect(page.getByText("Sincronizado", { exact: true })).toBeVisible();
  } finally {
    await dropFixture(a.studentId);
  }
});

test("password callback waits for the link identity even while another trainer is signed in", async ({
  page,
}) => {
  const admin = adminClient(),
    email = "callback-" + crypto.randomUUID() + "@pulso.local";
  const invitation = await admin.auth.admin.generateLink({
    type: "invite",
    email,
  });
  expect(invitation.error).toBeNull();
  const user = invitation.data.user!.id;
  let release!: () => void, entered!: () => void;
  const wait = new Promise<void>((r) => (release = r)),
    started = new Promise<void>((r) => (entered = r));
  try {
    await login(page);
    await page.route("**/auth/v1/verify", async (route) => {
      entered();
      await wait;
      await route.continue();
    });
    await page.goto(
      "/auth/callback?type=invite&token_hash=" +
        invitation.data.properties!.hashed_token,
    );
    await started;
    await expect(page.getByLabel("Nueva contraseña")).toHaveCount(0);
    release();
    await expect(page.getByLabel("Nueva contraseña")).toBeVisible();
    await page
      .getByLabel("Nueva contraseña")
      .fill("Callback-checked-" + crypto.randomUUID());
    await page.getByRole("button", { name: "Guardar contraseña" }).click();
    await expect(page.getByRole("navigation")).toBeVisible();
  } finally {
    release();
    await admin.from("workspaces").delete().eq("owner_user_id", user);
    await admin.auth.admin.deleteUser(user);
  }
});

test("applying a one-day template while viewing day two keeps the builder usable", async ({
  page,
}) => {
  const a = await prepared(),
    id = crypto.randomUUID(),
    op = crypto.randomUUID();
  try {
    const template = await a.client.rpc("save_library_entry", {
      command: {
        workspaceId: a.workspaceId,
        operationId: op,
        id,
        kind: "template",
        expectedRevision: 0,
        payload: { document: a.snapshot.routine.document },
      },
    });
    expect(template.error).toBeNull();
    await login(page);
    await page.goto("/rutinas/" + a.studentId);
    await page.getByRole("button", { name: "+ Día", exact: true }).click();
    await page.getByRole("button", { name: "Día 2", exact: true }).click();
    await expect(page.getByLabel("Nombre del día")).toHaveValue("Día 2");
    await page
      .getByText("Plantillas reutilizables e impresión", { exact: true })
      .click();
    page.on("dialog", (d) => d.accept());
    await page.getByLabel("Aplicar plantilla").selectOption(id);
    await expect(page.getByLabel("Nombre del día")).toHaveValue("Día 1");
  } finally {
    await dropFixture(a.studentId);
    await adminClient().from("routine_templates").delete().eq("id", id);
    await adminClient()
      .from("administrative_receipts")
      .delete()
      .eq("operation_id", op);
  }
});

test("omitting an unperformed set accepts blank result fields without rejecting the queue", async () => {
  const a = await prepared();
  try {
    const se = a.snapshot.sessions[0],
      item = se.items[0],
      set = item.sets[0];
    const reply = await execute(
      a.client,
      command(
        a.workspaceId,
        a.studentId,
        "record_set",
        {
          sessionId: se.id,
          itemId: item.id,
          setId: set.id,
          ordinal: set.ordinal,
          state: "skipped",
          weight: null,
          reps: null,
          durationSec: null,
        },
        a.snapshot.revision,
      ),
    );
    expect(reply.status).toBe("applied");
    expect(reply.patch.sessions[0].items[0].sets[0]).toMatchObject({
      state: "skipped",
      weight: null,
      reps: null,
    });
  } finally {
    await dropFixture(a.studentId);
  }
});

test("archived students can be found and restored without knowing their URL", async ({
  page,
}) => {
  const a = await createStudent();
  try {
    const archived = await execute(
      a.client,
      command(
        a.workspaceId,
        a.studentId,
        "archive_student",
        { archived: true },
        a.revision,
      ),
    );
    expect(archived.status).toBe("applied");
    await login(page);
    await page.goto("/alumnos");
    await page.getByLabel("Mostrar alumnos archivados").check();
    await page
      .getByRole("link", { name: new RegExp(archived.patch.student.name) })
      .click();
    await page
      .getByRole("button", { name: "Restaurar alumno", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Archivar alumno", exact: true }),
    ).toBeVisible();
    await page.goto("/alumnos");
    await expect(
      page.getByRole("link", { name: new RegExp(archived.patch.student.name) }),
    ).toBeVisible();
  } finally {
    await dropFixture(a.studentId);
  }
});
