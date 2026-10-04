// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LocalStore } from "@pulso/sync/local-db";
const context = vi.hoisted(() => ({ db: null as LocalStore | null }));
vi.mock("../../apps/web/src/app/DataProvider", () => ({
  useData: () => ({ db: context.db }),
}));
import {
  AppUpdates,
  canReloadApp,
} from "../../apps/web/src/components/AppUpdates";
afterEach(async () => {
  cleanup();
  await context.db?.delete();
  document.body.innerHTML = "";
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
async function store() {
  const db = new LocalStore({
    userId: crypto.randomUUID(),
    workspaceId: crypto.randomUUID(),
  });
  context.db = db;
  await db.open();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  return db;
}
test("saved drafts allow idle updates and remain stored; pending writes defer only the reload", async () => {
  const db = await store();
  const drafts = [
    { key: "draft:student", value: { name: "Borrador" } },
    { key: "template-draft:local", value: { name: "Plantilla" } },
  ];
  await db.meta.bulkPut(drafts);
  expect(await canReloadApp(db, "/hoy")).toBe(true);
  for (const key of ["admin:student", "library-pending"]) {
    await db.meta.put({ key, value: {} });
    expect(await canReloadApp(db, "/hoy")).toBe(false);
    await db.meta.delete(key);
  }
  expect(await db.meta.bulkGet(drafts.map((draft) => draft.key))).toEqual(
    drafts,
  );
  expect(await canReloadApp(db, "/alumnos/new/rutina")).toBe(false);
  const field = document.createElement("input");
  document.body.append(field);
  field.focus();
  expect(await canReloadApp(db, "/hoy")).toBe(false);
  field.remove();
  const dialog = document.createElement("div");
  dialog.setAttribute("role", "dialog");
  document.body.append(dialog);
  expect(await canReloadApp(db, "/hoy")).toBe(false);
});
test("new shell activates without rendering synchronization notices or buttons", async () => {
  vi.stubEnv("PROD", true);
  const db = await store();
  await db.meta.put({ key: "admin:student", value: {} });
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
  const result = render(
    <MemoryRouter initialEntries={["/hoy"]}>
      <AppUpdates />
    </MemoryRouter>,
  );
  await waitFor(() =>
    expect(postMessage).toHaveBeenCalledWith("ACTIVATE_REVIEWED_UPDATE"),
  );
  expect(result.container.innerHTML).toBe("");
  expect(await db.meta.get("admin:student")).toBeTruthy();
});
