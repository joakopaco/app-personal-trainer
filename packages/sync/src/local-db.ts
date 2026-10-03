import Dexie, { type Table } from "dexie";
import type {
  AccountScope,
  CommandEnvelope,
  CommandReply,
  StudentSnapshot,
} from "@pulso/domain/contracts";
import { projectCommand } from "@pulso/domain/session-projection";
export type StoredStudent = {
  studentId: string;
  confirmed: StudentSnapshot;
  projection: StudentSnapshot;
};
export type PendingCommand = {
  seq?: number;
  operationId: string;
  studentId: string;
  command: CommandEnvelope;
  predecessorId: string | null;
  state: "queued" | "sending" | "conflict" | "rejected";
  attempts: number;
  nextAttempt: number;
  error?: string;
  remote?: StudentSnapshot;
  base: StudentSnapshot;
  frozen: boolean;
};
export type RawInput = {
  id: string;
  studentId: string;
  sessionId: string;
  itemId: string;
  setId?: string;
  field: string;
  raw: string;
  revision: number;
  baseValue?: unknown;
  scope?: "session_only" | "session_and_future";
};
export class LocalStore extends Dexie {
  students!: Table<StoredStudent, string>;
  outbox!: Table<PendingCommand, number>;
  rawInputs!: Table<RawInput, string>;
  meta!: Table<{ key: string; value: unknown }, string>;
  leases!: Table<{ id: string; owner: string; expires: number }, string>;
  constructor(public readonly scope: AccountScope) {
    super("pulso:" + scope.userId + ":" + scope.workspaceId);
    this.version(1).stores({
      students: "studentId",
      outbox: "++seq,&operationId,studentId,state",
      rawInputs: "id,studentId",
      meta: "key",
      leases: "id",
    });
  }
  async cache(snapshot: StudentSnapshot) {
    if (snapshot.student.workspace_id !== this.scope.workspaceId)
      throw Error("Cuenta incorrecta");
    await this.transaction(
      "rw",
      this.students,
      this.outbox,
      this.rawInputs,
      async () => {
        const pending = await this.listPending(snapshot.student.id);
        const raw = await this.rawInputs
          .where("studentId")
          .equals(snapshot.student.id)
          .count();
        const old = await this.students.get(snapshot.student.id);
        if (old && old.confirmed.revision > snapshot.revision) return;
        if (pending.length || raw) {
          if (
            pending.length &&
            old &&
            snapshot.revision > old.confirmed.revision &&
            !pending[0].frozen
          )
            await this.outbox.update(pending[0].seq!, {
              state: "conflict",
              remote: snapshot,
              error: "Hay una versión nueva en otro dispositivo.",
            });
          return;
        }
        await this.students.put({
          studentId: snapshot.student.id,
          confirmed: snapshot,
          projection: snapshot,
        });
      },
    );
  }
  async stage(command: CommandEnvelope, rawId?: string) {
    if (command.workspaceId !== this.scope.workspaceId)
      throw Error("Cuenta incorrecta");
    await this.transaction(
      "rw",
      this.students,
      this.outbox,
      this.rawInputs,
      async () => {
        const row = await this.students.get(command.studentId);
        if (!row) throw Error("Descargá primero el alumno.");
        const queue = await this.listPending(command.studentId);
        if (queue.some((q) => q.state === "conflict" || q.state === "rejected"))
          throw Error("Revisá los cambios pendientes antes de continuar.");
        if (
          queue.some((q) =>
            ["finish_session", "reconcile_offline_session"].includes(
              q.command.kind,
            ),
          )
        )
          throw Error("La finalización está pendiente de confirmar.");
        if (rawId) {
          const input = await this.rawInputs.get(rawId);
          if (!input) return;
          const item = row.projection.sessions
            .find((s) => s.id === input.sessionId)
            ?.items.find((i) => i.id === input.itemId);
          const currentValue = input.setId
            ? item?.sets.find((s) => s.id === input.setId)
            : input.field === "macroRest"
              ? item?.macro_rest
              : item?.prescription[
                  input.field as keyof NonNullable<typeof item>["prescription"]
                ];
          if (
            !item ||
            JSON.stringify(currentValue) !== JSON.stringify(input.baseValue)
          )
            throw Error(
              "El valor de este campo cambió. Revisalo antes de confirmar.",
            );
          command = { ...command, expectedRevision: row.confirmed.revision };
        } else if (command.expectedRevision !== row.confirmed.revision)
          throw Error("El contexto cambió. Revisá el valor y volvé a guardar.");
        const projection = projectCommand(row.projection, command);
        await this.outbox.add({
          operationId: command.operationId,
          studentId: command.studentId,
          command,
          predecessorId: queue.at(-1)?.operationId ?? null,
          state: "queued",
          attempts: 0,
          nextAttempt: 0,
          base: row.projection,
          frozen: false,
        });
        await this.students.put({ ...row, projection });
        if (rawId) await this.rawInputs.delete(rawId);
      },
    );
  }
  async listPending(studentId?: string) {
    return studentId
      ? this.outbox.where("studentId").equals(studentId).sortBy("seq")
      : this.outbox.orderBy("seq").toArray();
  }
  async read(id: string) {
    return this.students.get(id);
  }
  async hasPending() {
    return (await this.outbox.count()) + (await this.rawInputs.count()) > 0;
  }
  async exportPending() {
    return {
      schemaVersion: 1,
      scope: this.scope,
      capturedAt: new Date().toISOString(),
      commands: await this.listPending(),
      rawInputs: await this.rawInputs.toArray(),
      students: await this.students.toArray(),
    };
  }
  async acknowledge(operationId: string, reply: CommandReply) {
    await this.transaction("rw", this.students, this.outbox, async () => {
      const current = await this.outbox
        .where("operationId")
        .equals(operationId)
        .first();
      if (!current) return;
      if (reply.status === "rejected") {
        await this.outbox.update(current.seq!, {
          state: "rejected",
          error: reply.message,
        });
        return;
      }
      if (reply.status === "conflict") {
        await this.outbox.update(current.seq!, {
          state: "conflict",
          remote: reply.current,
          error: "Cambió en otro dispositivo.",
        });
        return;
      }
      if (
        reply.operationId !== operationId ||
        reply.patch.student.id !== current.studentId ||
        reply.patch.student.workspace_id !== this.scope.workspaceId
      )
        throw Error("Respuesta de otra operación");
      await this.outbox.delete(current.seq!);
      const remaining = await this.listPending(current.studentId);
      let projection = reply.patch;
      for (const row of remaining) {
        try {
          projection = projectCommand(projection, row.command);
        } catch {
          await this.outbox.update(row.seq!, {
            state: "conflict",
            remote: reply.patch,
            error: "La operación depende de un contexto que cambió.",
          });
          break;
        }
      }
      const next = remaining[0];
      if (next && !next.frozen && next.predecessorId === operationId)
        await this.outbox.update(next.seq!, {
          command: { ...next.command, expectedRevision: reply.revision },
          predecessorId: null,
        });
      await this.students.put({
        studentId: current.studentId,
        confirmed: reply.patch,
        projection,
      });
    });
  }
  async discardStudentQueue(studentId: string, remote: StudentSnapshot) {
    if (
      remote.student.id !== studentId ||
      remote.student.workspace_id !== this.scope.workspaceId
    )
      throw Error("Cuenta incorrecta");
    await this.transaction(
      "rw",
      this.students,
      this.outbox,
      this.rawInputs,
      async () => {
        await this.outbox.where("studentId").equals(studentId).delete();
        await this.rawInputs.where("studentId").equals(studentId).delete();
        await this.students.put({
          studentId,
          confirmed: remote,
          projection: remote,
        });
      },
    );
  }
  async reapplyStudentQueue(studentId: string, remote: StudentSnapshot) {
    if (
      remote.student.id !== studentId ||
      remote.student.workspace_id !== this.scope.workspaceId
    )
      throw Error("Cuenta incorrecta");
    await this.transaction("rw", this.students, this.outbox, async () => {
      const pending = await this.listPending(studentId);
      let projection = remote;
      let predecessorId: string | null = null;
      const rebuilt: PendingCommand[] = [];
      for (const [index, row] of pending.entries()) {
        if (
          ![
            "adjust_prescription",
            "record_set",
            "skip_item",
            "finish_session",
          ].includes(row.command.kind)
        )
          throw Error(
            "Esta operación necesita reconciliación estructural. Exportá los pendientes.",
          );
        // Explicitly applying the head does not grant permission to overwrite unrelated dependent fields.
        if (index > 0 && row.command.kind === "adjust_prescription") {
          const p = row.command.payload;
          const get = (s: StudentSnapshot) =>
            s.sessions
              .find((se) => se.id === p.sessionId)
              ?.items.find((i) => i.id === p.itemId);
          const before = get(row.base),
            now = get(projection);
          const field = String(p.field);
          const val = (i: typeof now) =>
            field === "macroRest"
              ? i?.macro_rest
              : field === "macroTarget"
                ? i?.macro_target
                : i?.prescription[
                    field as keyof NonNullable<typeof i>["prescription"]
                  ];
          if (JSON.stringify(val(before)) !== JSON.stringify(val(now)))
            throw Error(
              "Otro campo dependiente también cambió. Exportá y revisá la cola antes de reemplazarlo.",
            );
        }
        const command = {
          ...row.command,
          operationId: crypto.randomUUID(),
          expectedRevision: remote.revision,
          capturedAt: new Date().toISOString(),
        };
        const base = projection;
        projection = projectCommand(projection, command);
        rebuilt.push({
          operationId: command.operationId,
          studentId,
          command,
          predecessorId,
          state: "queued",
          attempts: 0,
          nextAttempt: 0,
          base,
          frozen: false,
        });
        predecessorId = command.operationId;
      }
      await this.outbox.where("studentId").equals(studentId).delete();
      await this.outbox.bulkAdd(rebuilt);
      await this.students.put({ studentId, confirmed: remote, projection });
    });
  }
  async reconcileHistorical(
    studentId: string,
    remote: StudentSnapshot,
    reason: string,
  ) {
    if (
      remote.student.id !== studentId ||
      remote.student.workspace_id !== this.scope.workspaceId
    )
      throw Error("Cuenta incorrecta");
    await this.transaction(
      "rw",
      this.students,
      this.outbox,
      this.rawInputs,
      async () => {
        if (await this.rawInputs.where("studentId").equals(studentId).count())
          throw Error(
            "Hay campos sin confirmar. Conservá y revisá esos valores primero.",
          );
        const row = await this.students.get(studentId);
        const session = row?.projection.sessions[0];
        const queue = await this.listPending(studentId);
        if (!session || !queue.length)
          throw Error("No hay sesión pendiente para recuperar.");
        const previous = queue.find(
          (p) => p.command.kind === "reconcile_offline_session",
        );
        if (previous)
          throw Error(
            "La recuperación ya está preparada. Reintentá la sincronización.",
          );
        const command: CommandEnvelope = {
          ...queue[0].command,
          operationId: crypto.randomUUID(),
          expectedRevision: remote.revision,
          capturedAt: new Date().toISOString(),
          kind: "reconcile_offline_session",
          payload: {
            sessionId: session.id,
            reason,
            operations: queue.map((p) => p.command),
            quickConfirmItemIds: session.items
              .filter((i) => !i.skipped)
              .map((i) => i.id),
            allowEmpty: false,
          },
        };
        await this.outbox.where("studentId").equals(studentId).delete();
        await this.outbox.add({
          operationId: command.operationId,
          studentId,
          command,
          predecessorId: null,
          state: "queued",
          attempts: 0,
          nextAttempt: 0,
          base: row!.projection,
          frozen: false,
        });
        await this.students.put({
          studentId,
          confirmed: remote,
          projection: row!.projection,
        });
      },
    );
  }
  async purge() {
    if (await this.hasPending())
      throw Error("Hay datos pendientes. Exportá y resolvé antes de salir.");
    await this.delete();
  }
  async acquireLease(id: string, owner: string, now = Date.now()) {
    return this.transaction("rw", this.leases, async () => {
      const old = await this.leases.get(id);
      if (old && old.expires > now && old.owner !== owner) return false;
      await this.leases.put({ id, owner, expires: now + 30_000 });
      return true;
    });
  }
  async releaseLease(id: string, owner: string) {
    await this.transaction("rw", this.leases, async () => {
      if ((await this.leases.get(id))?.owner === owner)
        await this.leases.delete(id);
    });
  }
}
