import { test, expect } from "@playwright/test";
import { accounts, adminClient, config, dropFixture } from "../fixtures/cloud";
import { createClient } from "@supabase/supabase-js";
import { prepared } from "../fixtures/prepared";
test("logout blocks pending edits, then another trainer never sees the prior cache", async ({
  page,
}) => {
  const a = await prepared();
  try {
    await page.goto("/hoy");
    await page.getByLabel("Email").fill(accounts[0].email);
    await page
      .getByLabel("Contraseña", { exact: true })
      .fill(accounts[0].password);
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await expect(page.getByRole("navigation")).toBeVisible();
    await page.goto("/entrenar/" + a.studentId);
    // Download the student before cutting network access; navigation alone
    // does not mean React's async data fetch has completed.
    await expect(page.getByLabel("Peso kg")).toHaveValue("20");
    await page.route("http://127.0.0.1:54341/**", (r) => r.abort());
    await page.getByLabel("Peso kg").fill("32");
    await page.getByLabel("Peso kg").blur();
    await expect(page.locator(".save-indicator")).toContainText(
      "Guardado en este dispositivo",
    );
    await page.getByRole("link", { name: "Ajustes", exact: true }).click();
    await page
      .getByRole("button", { name: "Cerrar sesión", exact: true })
      .click();
    await expect(
      page.getByText(
        "Hay cambios sin confirmar. Volvé al entrenamiento y revisalos antes de salir.",
      ),
    ).toBeVisible();
    await page.unroute("http://127.0.0.1:54341/**");
    await page.goto("/entrenar/" + a.studentId);
    await page.getByRole("button", { name: "Reintentar guardado" }).click();
    await expect(page.getByText("Guardado", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Ajustes", exact: true }).click();
    await page
      .getByRole("button", { name: "Cerrar sesión", exact: true })
      .click();
    await expect(page.getByLabel("Email")).toBeVisible();
    await page.getByLabel("Email").fill(accounts[1].email);
    await page
      .getByLabel("Contraseña", { exact: true })
      .fill(accounts[1].password);
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await expect(page.getByRole("navigation")).toBeVisible();
    await page.getByRole("link", { name: "Alumnos", exact: true }).click();
    await expect(
      page.getByText(a.snapshot.student.name, { exact: true }),
    ).toHaveCount(0);
  } finally {
    await dropFixture(a.studentId);
  }
});
test("invitation establishes password and an unconfirmed identity cannot bootstrap a workspace", async ({
  page,
}) => {
  const email = "invite-" + crypto.randomUUID() + "@pulso.local";
  const admin = adminClient();
  let user: string | undefined;
  try {
    const invitation = await admin.auth.admin.generateLink({
      type: "invite",
      email,
    });
    if (invitation.error) throw invitation.error;
    user = invitation.data.user.id;
    await page.goto(
      "/auth/callback?type=invite&token_hash=" +
        invitation.data.properties.hashed_token,
    );
    await expect(page.getByLabel("Nueva contraseña")).toBeVisible();
    await page
      .getByLabel("Nueva contraseña")
      .fill("Local-fixture-" + crypto.randomUUID());
    await page.getByRole("button", { name: "Guardar contraseña" }).click();
    await expect(page.getByRole("navigation")).toBeVisible();
    await page.goto(
      "/auth/callback?type=invite&token_hash=" +
        invitation.data.properties.hashed_token,
    );
    await expect(page.getByRole("alert")).toContainText("utilizado o venció");
    await expect(page.getByLabel("Nueva contraseña")).toHaveCount(0);
  } finally {
    if (user) {
      await admin.from("workspaces").delete().eq("owner_user_id", user);
      await admin.auth.admin.deleteUser(user);
    }
  }
  const password = "Unconfirmed-fixture-" + crypto.randomUUID();
  const made = await admin.auth.admin.createUser({
    email: "unconfirmed-" + crypto.randomUUID() + "@pulso.local",
    password,
    email_confirm: false,
  });
  expect(made.error).toBeNull();
  const id = made.data.user!.id;
  try {
    const c = createClient(config.url, config.anonKey, {
      auth: { persistSession: false },
    });
    const signed = await c.auth.signInWithPassword({
      email: made.data.user!.email!,
      password,
    });
    if (signed.data.session) {
      expect((await c.rpc("ensure_workspace")).error).toBeTruthy();
    } else expect(signed.error).toBeTruthy();
  } finally {
    await admin.auth.admin.deleteUser(id);
  }
});
