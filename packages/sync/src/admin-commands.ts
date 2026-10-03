import type { CommandEnvelope, CommandReply } from "@pulso/domain/contracts";
import type { LocalStore } from "./local-db";
export async function sendAdministrative(
  db: LocalStore,
  proposed: CommandEnvelope,
  execute: (c: CommandEnvelope) => Promise<CommandReply>,
  isActive = () => true,
) {
  const key = "admin:" + proposed.studentId,
    owner = crypto.randomUUID();
  if (!isActive()) throw Error("La cuenta cambió. Volvé a ingresar.");
  if (!(await db.acquireLease(key, owner)))
    throw Error("Ya se está enviando una operación de este alumno.");
  try {
    if (
      (await db.listPending(proposed.studentId)).length ||
      (await db.rawInputs.where("studentId").equals(proposed.studentId).count())
    )
      throw Error(
        "Sincronizá los cambios de este alumno antes de modificar su programación.",
      );
    const command = await db.transaction("rw", db.meta, async () => {
      const old = (await db.meta.get(key))?.value as
        CommandEnvelope | undefined;
      if (old) {
        if (
          old.kind !== proposed.kind ||
          JSON.stringify(old.payload) !== JSON.stringify(proposed.payload)
        )
          throw Error(
            "Hay una operación administrativa sin confirmar. Reintentala desde el centro de sincronización.",
          );
        return old;
      }
      await db.meta.put({ key, value: proposed });
      return proposed;
    });
    if (!isActive())
      throw Error("La cuenta cambió. Los pendientes se conservan.");
    const reply = await execute(command);
    if (!isActive())
      throw Error("La cuenta cambió. Los pendientes se conservan.");
    if (
      (reply.status === "applied" || reply.status === "duplicate") &&
      reply.operationId !== command.operationId
    )
      throw Error("Respuesta no reconocida. Reintentá la operación.");
    // Clear only after the canonical response is durably stored.
    if (reply.status === "applied" || reply.status === "duplicate")
      await db.cache(reply.patch);
    else if (reply.status === "conflict") await db.cache(reply.current);
    await db.meta.delete(key);
    if (reply.status === "rejected") throw Error(reply.message);
    if (reply.status === "conflict")
      throw Error(
        "Los datos cambiaron en otro dispositivo. Revisá la versión actual antes de guardar.",
      );
    return reply.patch;
  } finally {
    if (db.isOpen()) await db.releaseLease(key, owner);
  }
}
