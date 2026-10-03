// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const auth = vi.hoisted(() => ({ signUp: vi.fn(), signOut: vi.fn() }));
vi.mock("../../apps/web/src/adapters/supabase", () => ({
  supabase: { auth },
  cloud: () => ({ auth }),
}));
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:54341");
  vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "");
  vi.stubEnv("VITE_AUTH_EMAIL_ENABLED", "false");
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

async function signup(password = "Long-password-123") {
  const { Login } = await import("../../apps/web/src/features/auth/Login");
  render(<Login />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /^Crear cuenta$/ }));
  await user.type(
    screen.getByLabelText("Email", { exact: true }),
    "Trainer@Example.test",
  );
  await user.type(
    screen.getByLabelText("Contraseña", { exact: true }),
    password,
  );
  await user.type(screen.getByLabelText("Repetí la contraseña"), password);
  await user.click(screen.getByRole("button", { name: "Crear mi cuenta" }));
}

test("an immediate signup session is retained and never asks for an unsent email", async () => {
  auth.signUp.mockResolvedValue({
    error: null,
    data: { user: { id: "trainer" }, session: { user: { id: "trainer" } } },
  });
  await signup();
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toContain("Cuenta creada"),
  );
  expect(auth.signOut).not.toHaveBeenCalled();
  expect(auth.signUp).toHaveBeenCalledWith(
    expect.objectContaining({ email: "trainer@example.test" }),
  );
});

test("email-free pilot does not offer unavailable recovery or confirmation delivery", async () => {
  const { Login } = await import("../../apps/web/src/features/auth/Login");
  render(<Login />);
  expect(
    screen.queryByRole("button", { name: "Olvidé mi contraseña" }),
  ).toBeNull();
  expect(
    screen.queryByRole("button", { name: "No recibí la confirmación" }),
  ).toBeNull();
});

test("a duplicate email never pretends to create a session or send mail during the pilot", async () => {
  auth.signUp.mockResolvedValue({
    error: { code: "user_already_exists" },
    data: { user: null, session: null },
  });
  await signup();
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toContain(
      "Intentá ingresar",
    ),
  );
  expect(screen.getByRole("status").textContent).not.toMatch(
    /recibirás|Cuenta creada/,
  );
});

test("verified-email mode still guides a pending signup to its confirmation", async () => {
  vi.stubEnv("VITE_AUTH_EMAIL_ENABLED", "true");
  auth.signUp.mockResolvedValue({
    error: null,
    data: { user: { id: "trainer" }, session: null },
  });
  await signup();
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toContain(
      "Revisá tu correo",
    ),
  );
});

test("an eight-character password with upper/lowercase and a digit can register", async () => {
  auth.signUp.mockResolvedValue({
    error: null,
    data: { user: { id: "trainer" }, session: { user: { id: "trainer" } } },
  });
  await signup("Entrena1");
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toContain("Cuenta creada"),
  );
});

test.each(["entrenamiento1", "Entrenamiento", "ENTRENAMIENTO1", "Entren1"])(
  "rejects password missing policy requirements: %s",
  async (password) => {
    await signup(password);
    expect(auth.signUp).not.toHaveBeenCalled();
  },
);
