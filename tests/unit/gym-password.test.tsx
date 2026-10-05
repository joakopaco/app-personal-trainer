// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const mocks = vi.hoisted(() => ({
  change: vi.fn(),
  signIn: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("../../apps/web/src/adapters/supabase", () => ({
  cloud: () => ({ auth: { signInWithPassword: mocks.signIn }, rpc: mocks.rpc }),
}));
vi.mock("../../apps/web/src/features/auth/AuthProvider", () => ({
  useAuth: () => ({ user: null }),
}));
vi.mock("../../apps/web/src/features/gym/api", async (original) => ({
  ...(await original<object>()),
  accountAction: mocks.change,
}));
vi.mock("../../apps/web/src/features/auth/Captcha", () => ({
  captchaRequired: true,
  captchaSiteKey: "test-site",
  Captcha: ({ onToken }: { onToken: (v: string) => void }) => (
    <button type="button" onClick={() => onToken("challenge-token")}>
      Verificar conexión
    </button>
  ),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test("password change waits for production captcha and passes it to recovery reauthentication", async () => {
  const { PasswordForm } = await import("../../apps/web/src/features/gym/ui");
  const done = vi.fn(),
    user = userEvent.setup();
  mocks.change.mockRejectedValue(Error("Lost response"));
  mocks.signIn.mockResolvedValue({ error: null });
  mocks.rpc.mockResolvedValue({
    data: { blocked: false, mustChangePassword: false },
    error: null,
  });
  render(<PasswordForm email="member@example.test" required done={done} />);
  await user.type(
    screen.getByLabelText("Nueva contraseña", { exact: true }),
    "Different-password-123",
  );
  await user.type(
    screen.getByLabelText("Repetí la contraseña"),
    "Different-password-123",
  );
  const save = screen.getByRole("button", { name: "Guardar nueva contraseña" });
  expect((save as HTMLButtonElement).disabled).toBe(true);
  await user.click(screen.getByRole("button", { name: "Verificar conexión" }));
  await user.click(save);
  await waitFor(() => expect(done).toHaveBeenCalledOnce());
  expect(mocks.signIn).toHaveBeenCalledWith({
    email: "member@example.test",
    password: "Different-password-123",
    options: { captchaToken: "challenge-token" },
  });
});
