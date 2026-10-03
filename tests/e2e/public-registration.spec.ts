import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { adminClient, config } from "../fixtures/cloud";

test("student access is upcoming and never sends an authentication request", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (r) => {
    if (/\/auth\/v1\/(signup|token)/.test(r.url())) requests.push(r.url());
  });
  await page.goto("/login");
  await page.getByLabel("Tipo de cuenta").selectOption("student");
  await expect(
    page.getByRole("heading", { name: "Alumnos, próximamente" }),
  ).toBeVisible();
  await expect(page.getByLabel("Email", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Ingresar", exact: true }),
  ).toHaveCount(0);
  expect(requests).toEqual([]);
  await page.getByLabel("Tipo de cuenta").selectOption("trainer");
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
});

test("signup confirms email in a fresh browser and keeps one identity across profile metadata", async ({
  page,
  browser,
  request,
}) => {
  const admin = adminClient(),
    email = "signup-" + crypto.randomUUID() + "@pulso.local";
  // Eight characters is the actual minimum accepted by browser and Auth.
  const password = "Entrena1";
  const anonymous = createClient(config.url, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let userId: string | undefined;
  const fresh = await browser.newContext();
  try {
    await page.goto("/login");
    await page
      .getByRole("button", { name: "Crear cuenta", exact: true })
      .click();
    await page.getByLabel("Email", { exact: true }).fill(email.toUpperCase());
    await page.getByLabel("Contraseña", { exact: true }).fill(password);
    await page.getByLabel("Repetí la contraseña").fill(password);
    await page.getByRole("button", { name: "Crear mi cuenta" }).click();
    await expect(page.getByRole("status")).toContainText("Revisá tu correo");
    const before = await anonymous.auth.signInWithPassword({ email, password });
    expect(before.error?.code).toBe("email_not_confirmed");
    expect((await anonymous.rpc("ensure_workspace")).error).not.toBeNull();
    const users = await admin.auth.admin.listUsers();
    userId = users.data.users.find((u) => u.email === email)?.id;
    expect(userId).toBeTruthy();
    expect(
      (await admin.from("workspaces").select("id").eq("owner_user_id", userId!))
        .data,
    ).toEqual([]);
    let messageId = "";
    await expect
      .poll(async () => {
        const body = await (
          await request.get("http://127.0.0.1:54344/api/v1/messages")
        ).json();
        messageId =
          body.messages.find((m: { ID: string; To: { Address: string }[] }) =>
            m.To.some((t) => t.Address === email),
          )?.ID ?? "";
        return Boolean(messageId);
      })
      .toBe(true);
    const mail = await (
      await request.get("http://127.0.0.1:54344/api/v1/message/" + messageId)
    ).json();
    const link = (mail.HTML as string)
      .match(/href="([^"]*\/auth\/callback[^\"]*)"/)?.[1]
      .replaceAll("&amp;", "&");
    expect(link).toBeTruthy();
    const other = await fresh.newPage();
    await other.goto(link!);
    await expect(
      other.getByRole("button", { name: "Confirmar mi email" }),
    ).toBeVisible();
    await other.getByRole("button", { name: "Confirmar mi email" }).click();
    await expect(
      other.getByRole("navigation", { name: "Principal" }),
    ).toBeVisible();
    await other.goto(link!);
    await other.getByRole("button", { name: "Confirmar mi email" }).click();
    await expect(other.getByRole("alert")).toContainText("utilizado o venció");
    const duplicate = await anonymous.auth.signUp({
      email: email.toUpperCase(),
      password,
      options: { data: { role: "student" } },
    });
    expect(duplicate.error).toBeNull();
    expect(duplicate.data.session).toBeNull();
    const after = await admin.auth.admin.listUsers();
    expect(
      after.data.users.filter((u) => u.email?.toLowerCase() === email),
    ).toHaveLength(1);
  } finally {
    await fresh.close();
    if (!userId)
      userId = (await admin.auth.admin.listUsers()).data.users.find(
        (u) => u.email === email,
      )?.id;
    if (userId) {
      await admin.from("workspaces").delete().eq("owner_user_id", userId);
      await admin.auth.admin.deleteUser(userId);
    }
  }
});
