// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, expect, test, vi } from "vitest";
import {
  cleanup,
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
});
test("update readiness follows administrative drafts as well as the training queue", async () => {
  vi.stubEnv("PROD", true);
  const db = new LocalStore({
    userId: crypto.randomUUID(),
    workspaceId: crypto.randomUUID(),
  });
  context.db = db;
  await db.open();
  await db.meta.put({ key: "library-pending", value: {} });
  const postMessage = vi.fn();
  const registration = Object.assign(new EventTarget(), {
    waiting: { postMessage },
    installing: null,
  });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: Object.assign(new EventTarget(), {
      register: vi.fn(async () => registration),
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
  await db.meta.delete("library-pending");
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
});
