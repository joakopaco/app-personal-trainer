import { beforeEach, expect, test, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";
const api = vi.hoisted(() => ({ setSession: vi.fn(), updateUser: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: api }),
}));
import { updateVerifiedPassword } from "../../apps/web/src/adapters/supabase";
const session = {
  user: { id: "trainer-a" },
  access_token: "fixture-access",
  refresh_token: "fixture-refresh",
} as Session;
beforeEach(() => {
  vi.clearAllMocks();
  api.setSession.mockResolvedValue({
    data: { user: session.user },
    error: null,
  });
  api.updateUser.mockResolvedValue({ error: null });
});
test("account password change passes current password to Auth and propagates rejection", async () => {
  const rejected = { code: "current_password_mismatch" };
  api.updateUser.mockResolvedValue({ error: rejected });
  await expect(
    updateVerifiedPassword(session, "NextPass1", "WrongPass1"),
  ).rejects.toBe(rejected);
  expect(api.updateUser).toHaveBeenCalledWith({
    password: "NextPass1",
    current_password: "WrongPass1",
  });
});
test("identity mismatch cannot update another account's password", async () => {
  api.setSession.mockResolvedValue({
    data: { user: { id: "trainer-b" } },
    error: null,
  });
  await expect(
    updateVerifiedPassword(session, "NextPass1", "OldPass1"),
  ).rejects.toThrow();
  expect(api.updateUser).not.toHaveBeenCalled();
});
test("verified recovery links keep working without the forgotten current password", async () => {
  await updateVerifiedPassword(session, "NextPass1");
  expect(api.updateUser).toHaveBeenCalledWith({ password: "NextPass1" });
});
