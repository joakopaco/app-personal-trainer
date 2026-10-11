// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { Settings } from "../../apps/web/src/features/settings/Settings";

const mocks = vi.hoisted(() => ({
  profile: vi.fn(),
  rpc: vi.fn(),
  password: vi.fn(),
  sync: vi.fn(),
  refresh: vi.fn(),
  data: {
    db: { scope: { userId: "trainer" } },
    rows: [
      { studentId: "student-1", projection: { student: { name: "Ana" } } },
    ],
    pending: [] as { state: string; studentId: string }[],
    error: "",
  },
  session: { user: { email: "trainer@example.test" } },
}));

vi.mock("../../apps/web/src/app/DataProvider", () => ({
  useData: () => ({ ...mocks.data, sync: mocks.sync, refresh: mocks.refresh }),
}));
vi.mock("../../apps/web/src/features/auth/AuthProvider", () => ({
  useAuth: () => ({ session: mocks.session }),
}));
vi.mock("../../apps/web/src/features/auth/SignOutButton", () => ({
  SignOutButton: () => <button>Cerrar sesión</button>,
}));
vi.mock("../../apps/web/src/adapters/supabase", () => ({
  cloud: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ single: mocks.profile }) }),
    }),
    rpc: mocks.rpc,
  }),
  updateVerifiedPassword: mocks.password,
}));

beforeEach(() => {
  mocks.data.pending = [];
  mocks.data.error = "";
  mocks.profile.mockResolvedValue({
    data: { display_name: "Entrenador" },
    error: null,
  });
  mocks.rpc.mockResolvedValue({
    data: { display_name: "Nuevo nombre" },
    error: null,
  });
  mocks.sync.mockResolvedValue(undefined);
  mocks.refresh.mockResolvedValue(undefined);
  mocks.password.mockResolvedValue(undefined);
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

function settings() {
  return (
    <MemoryRouter>
      <Settings />
    </MemoryRouter>
  );
}

test("training status distinguishes queued changes, conflicts and no pending sends", async () => {
  mocks.data.pending = [{ state: "queued", studentId: "student-1" }];
  const view = render(settings());
  expect(screen.getByText("1 cambio por enviar")).toBeTruthy();
  expect(
    screen.queryByText("Sin envíos de entrenamiento pendientes"),
  ).toBeNull();

  mocks.data.pending = [{ state: "conflict", studentId: "student-1" }];
  view.rerender(settings());
  expect(screen.getByText("Hay cambios que necesitan revisión")).toBeTruthy();
  expect(
    screen
      .getByRole("link", { name: "Revisar entrenamiento de Ana" })
      .getAttribute("href"),
  ).toBe("/entrenar/student-1");

  mocks.data.pending = [];
  view.rerender(settings());
  expect(
    screen.getByText("Sin envíos de entrenamiento pendientes"),
  ).toBeTruthy();
  expect(
    screen.getByText(/Los borradores se conservan en sus pantallas/),
  ).toBeTruthy();
  await screen.findByDisplayValue("Entrenador");
});

test("sync retry reports failures and never treats a retry as confirmed saving", async () => {
  mocks.data.pending = [{ state: "queued", studentId: "student-1" }];
  mocks.sync.mockRejectedValueOnce(Error("network failed"));
  render(settings());
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Actualizar estado" }));
  expect(mocks.sync).toHaveBeenCalledWith(true);
  expect(mocks.refresh).not.toHaveBeenCalled();
  expect(
    await screen.findByText(
      "No se pudo actualizar el estado. Revisá la conexión e intentá de nuevo.",
    ),
  ).toBeTruthy();
  expect(screen.getByText("1 cambio por enviar")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Actualizar estado" }));
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
  expect(screen.getByText("1 cambio por enviar")).toBeTruthy();
});

test("offline changes update connection information and disable network refresh", async () => {
  render(settings());
  await screen.findByDisplayValue("Entrenador");
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  act(() => window.dispatchEvent(new Event("offline")));
  expect(screen.getByText("Sin conexión a internet")).toBeTruthy();
  expect(
    (
      screen.getByRole("button", {
        name: "Actualizar estado",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  act(() => window.dispatchEvent(new Event("online")));
  expect(
    (
      screen.getByRole("button", {
        name: "Actualizar estado",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(false);
});

test("server errors remain visible while the device has a network connection", async () => {
  mocks.data.error =
    "Sin conexión al servidor. Podés trabajar con los alumnos ya descargados.";
  mocks.data.pending = [{ state: "sending", studentId: "student-1" }];
  render(settings());
  await screen.findByDisplayValue("Entrenador");
  expect(screen.getByText("Red disponible")).toBeTruthy();
  expect(screen.getByRole("alert").textContent).toBe(mocks.data.error);
  expect(screen.getByText("Enviando cambios de entrenamiento")).toBeTruthy();
  expect(
    screen.queryByText("Sin envíos de entrenamiento pendientes"),
  ).toBeNull();
});

test("profile saves use the verified response and preserve the input after a failure", async () => {
  render(settings());
  const user = userEvent.setup();
  const name = await screen.findByDisplayValue("Entrenador");
  await user.clear(name);
  await user.type(name, " Nuevo nombre ");
  await user.click(screen.getByRole("button", { name: "Guardar datos" }));
  expect(mocks.rpc).toHaveBeenCalledWith("update_my_profile", {
    p_display_name: "Nuevo nombre",
  });
  expect(await screen.findByText("Perfil guardado.")).toBeTruthy();
  expect((name as HTMLInputElement).value).toBe("Nuevo nombre");
  expect((screen.getByLabelText("Email") as HTMLInputElement).readOnly).toBe(
    true,
  );

  mocks.rpc.mockResolvedValueOnce({ data: null, error: Error("Disconnected") });
  await user.clear(name);
  await user.type(name, "Nombre pendiente");
  await user.click(screen.getByRole("button", { name: "Guardar datos" }));
  expect(
    await screen.findByText(/No pudimos confirmar el guardado del perfil/),
  ).toBeTruthy();
  expect(screen.queryByText("Perfil guardado.")).toBeNull();
  expect((name as HTMLInputElement).value).toBe("Nombre pendiente");
});

test("password change retains current-password verification and mismatch handling", async () => {
  render(settings());
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Cambiar contraseña" }));
  await user.type(
    screen.getByLabelText("Contraseña actual", { exact: true }),
    "Current123",
  );
  await user.type(
    screen.getByLabelText("Nueva contraseña", { exact: true }),
    "Different123",
  );
  await user.type(
    screen.getByLabelText("Repetí la nueva contraseña"),
    "Different456",
  );
  await user.click(screen.getByRole("button", { name: "Guardar contraseña" }));
  expect(screen.getByText("Las contraseñas no coinciden.")).toBeTruthy();
  expect(mocks.password).not.toHaveBeenCalled();
  await user.clear(screen.getByLabelText("Repetí la nueva contraseña"));
  await user.type(
    screen.getByLabelText("Repetí la nueva contraseña"),
    "Different123",
  );
  await user.click(screen.getByRole("button", { name: "Guardar contraseña" }));
  expect(mocks.password).toHaveBeenCalledWith(
    mocks.session,
    "Different123",
    "Current123",
  );
  expect(await screen.findByText(/Contraseña actualizada/)).toBeTruthy();
  expect(
    screen.queryByLabelText("Contraseña actual", { exact: true }),
  ).toBeNull();
});
