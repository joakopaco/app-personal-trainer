import "fake-indexeddb/auto";
import { expect, test, vi } from "vitest";
import { LocalStore } from "@pulso/sync/local-db";
const api = vi.hoisted(() => ({ rpc: vi.fn(), getSession: vi.fn() }));
vi.mock("../../apps/web/src/adapters/supabase", () => ({
  cloud: () => ({ rpc: api.rpc, auth: { getSession: api.getSession } }),
}));
import {
  saveLibrary,
  type LibraryCommand,
} from "../../apps/web/src/adapters/library";

test("an uncertain template save cannot be reused for a different target or revision", async () => {
  const db = new LocalStore({
    userId: crypto.randomUUID(),
    workspaceId: crypto.randomUUID(),
  });
  await db.open();
  try {
    const pending: LibraryCommand = {
      workspaceId: db.scope.workspaceId,
      id: crypto.randomUUID(),
      expectedRevision: 1,
      operationId: crypto.randomUUID(),
      kind: "template",
      payload: { document: { name: "Mismo contenido" } },
    };
    await db.meta.put({ key: "library-pending", value: pending });
    await expect(
      saveLibrary(db, { ...pending, id: crypto.randomUUID() }),
    ).rejects.toThrow("pendiente");
    await expect(
      saveLibrary(db, { ...pending, expectedRevision: 2 }),
    ).rejects.toThrow("pendiente");
    expect(api.rpc).not.toHaveBeenCalled();
    api.getSession.mockResolvedValue({
      data: { session: { user: { id: db.scope.userId } } },
    });
    api.rpc.mockResolvedValue({ data: { revision: 2 }, error: null });
    await expect(
      saveLibrary(db, { ...pending, operationId: crypto.randomUUID() }),
    ).resolves.toEqual({ revision: 2 });
    expect(api.rpc).toHaveBeenCalledWith("save_library_entry", {
      command: pending,
    });
    expect(await db.meta.get("library-pending")).toBeUndefined();
  } finally {
    await db.delete();
  }
});
