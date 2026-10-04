// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, expect, test, vi } from "vitest";
import {
  cleanup,
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { LocalStore } from "@pulso/sync/local-db";
const context = vi.hoisted(() => ({ db: null as LocalStore | null }));
vi.mock("../../apps/web/src/app/DataProvider", () => ({
  useData: () => ({ db: context.db }),
}));
import { UpdateAvailable } from "../../apps/web/src/components/UpdateAvailable";
afterEach(async () => {
  cleanup();
  await context.db?.delete();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
test.each(["library-pending", "template-draft:local"])(
  "update readiness follows pending %s as well as the training queue",
  async (pendingKey) => {
    vi.stubEnv("PROD", true);
    const db = new LocalStore({
      userId: crypto.randomUUID(),
      workspaceId: crypto.randomUUID(),
    });
    context.db = db;
    await db.open();
    await db.meta.put({ key: pendingKey, value: {} });
    const postMessage = vi.fn();
    const registration = Object.assign(new EventTarget(), {
      waiting: { postMessage },
      installing: null,
    });
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: Object.assign(new EventTarget(), {
        register: vi.fn(async () => registration),
        getRegistration: vi.fn(async () => registration),
        controller: {},
      }),
    });
    render(<UpdateAvailable />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Actualizar ahora" }),
    );
    await screen.findByText(
      "Guardá y sincronizá los pendientes antes de actualizar.",
    );
    expect(postMessage).not.toHaveBeenCalled();
    await db.meta.delete(pendingKey);
    await screen.findByText("Hay una nueva versión disponible.");
    expect(
      screen.queryByText(
        "Guardá y sincronizá los pendientes antes de actualizar.",
      ),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Actualizar ahora" }));
    await waitFor(() =>
      expect(postMessage).toHaveBeenCalledWith("ACTIVATE_REVIEWED_UPDATE"),
    );
    expect(screen.getByText("Actualizando la aplicación…")).toBeTruthy();
  },
);

test("activation uses the current waiting worker and permits retry if the browser does not respond", async () => {
  vi.stubEnv("PROD", true);
  const db = new LocalStore({
    userId: crypto.randomUUID(),
    workspaceId: crypto.randomUUID(),
  });
  context.db = db;
  await db.open();
  const oldPost = vi.fn(),
    currentPost = vi.fn();
  const registration = Object.assign(new EventTarget(), {
    waiting: { postMessage: oldPost },
    installing: null,
  });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: Object.assign(new EventTarget(), {
      register: vi.fn(async () => registration),
      getRegistration: vi.fn(async () => ({
        waiting: { postMessage: currentPost },
      })),
      controller: {},
    }),
  });
  render(<UpdateAvailable />);
  const button = await screen.findByRole("button", {
    name: "Actualizar ahora",
  });
  const timeout = vi.spyOn(window, "setTimeout");
  fireEvent.click(button);
  await waitFor(() =>
    expect(currentPost).toHaveBeenCalledWith("ACTIVATE_REVIEWED_UPDATE"),
  );
  expect(oldPost).not.toHaveBeenCalled();
  expect((button as HTMLButtonElement).disabled).toBe(true);
  const onTimeout = timeout.mock.calls.find((call) => call[1] === 10000)?.[0];
  expect(typeof onTimeout).toBe("function");
  act(() => {
    if (typeof onTimeout === "function") onTimeout();
  });
  expect((button as HTMLButtonElement).disabled).toBe(false);
  expect(
    screen.getByText(
      "La actualización no respondió. Tus cambios se conservan. Volvé a intentar.",
    ),
  ).toBeTruthy();
  fireEvent.click(button);
  await waitFor(() => expect(currentPost).toHaveBeenCalledTimes(2));
});
