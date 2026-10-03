import { test, expect } from "@playwright/test";
import { adminClient } from "../fixtures/cloud";

test("the local recovery email completes the PKCE callback and changes the intended account", async ({
  page,
  request,
}) => {
  const admin = adminClient(),
    email = "pkce-" + crypto.randomUUID() + "@pulso.local";
  const created = await admin.auth.admin.createUser({
    email,
    password: "Before-" + crypto.randomUUID(),
    email_confirm: true,
  });
  expect(created.error).toBeNull();
  const id = created.data.user!.id;
  try {
    await page.goto("/login");
    await page.getByRole("button", { name: "Olvidé mi contraseña" }).click();
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Enviar enlace" }).click();
    await expect(page.getByRole("status")).toContainText("recibirás");
    let messageId = "";
    await expect
      .poll(async () => {
        const response = await request.get(
          "http://127.0.0.1:54344/api/v1/messages",
        );
        const body = await response.json();
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
      .match(/href="([^"]*\/auth\/v1\/verify[^"]*)"/)?.[1]
      .replaceAll("&amp;", "&");
    expect(link).toBeTruthy();
    await page.goto(link!);
    await expect(page.getByLabel("Nueva contraseña")).toBeVisible();
    await page
      .getByLabel("Nueva contraseña")
      .fill("After-" + crypto.randomUUID());
    await page.getByRole("button", { name: "Guardar contraseña" }).click();
    await expect(page.getByRole("navigation")).toBeVisible();
  } finally {
    await admin.from("workspaces").delete().eq("owner_user_id", id);
    await admin.auth.admin.deleteUser(id);
  }
});
