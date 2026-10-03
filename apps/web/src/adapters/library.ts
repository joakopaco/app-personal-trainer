import type { LocalStore } from "@pulso/sync/local-db";
import { cloud } from "./supabase";
export type LibraryCommand = {
  workspaceId: string;
  operationId: string;
  id?: string;
  expectedRevision?: number;
  kind: string;
  payload: Record<string, unknown>;
};
export async function saveLibrary(db: LocalStore, proposed: LibraryCommand) {
  const key = "library-pending",
    owner = crypto.randomUUID();
  if (proposed.workspaceId !== db.scope.workspaceId)
    throw Error("Cuenta incorrecta");
  if (!(await db.acquireLease(key, owner)))
    throw Error("Hay otra operación en curso.");
  try {
    const old = (await db.meta.get(key))?.value as LibraryCommand | undefined;
    if (
      old &&
      (old.kind !== proposed.kind ||
        JSON.stringify(old.payload) !== JSON.stringify(proposed.payload))
    )
      throw Error(
        "Reintentá primero la operación pendiente de biblioteca desde el centro de sincronización.",
      );
    const command = old ?? proposed;
    if (!old) await db.meta.put({ key, value: command });
    const session = await cloud().auth.getSession();
    if (session.data.session?.user.id !== db.scope.userId)
      throw Error("Volvé a ingresar a la misma cuenta.");
    const { data, error } = await cloud().rpc("save_library_entry", {
      command,
    });
    if (error) {
      if (
        error.code &&
        ["22023", "42501", "23514", "23502", "23503"].includes(error.code)
      )
        await db.meta.delete(key);
      throw Error(
        error.code
          ? "No se pudo guardar. Revisá los valores y la versión actual."
          : "Sin confirmación. La operación quedó pendiente para reintentar.",
      );
    }
    const current = await cloud().auth.getSession();
    if (current.data.session?.user.id !== db.scope.userId)
      throw Error("La cuenta cambió. La operación se conserva.");
    await db.meta.delete(key);
    return data;
  } finally {
    if (db.isOpen()) await db.releaseLease(key, owner);
  }
}
