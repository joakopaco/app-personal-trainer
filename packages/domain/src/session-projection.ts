import { v5 } from "uuid";
import type {
  CommandEnvelope,
  StudentSnapshot,
  SessionItem,
} from "./contracts";
import type { Prescription } from "./routines";
export function projectCommand(
  input: StudentSnapshot,
  c: CommandEnvelope,
): StudentSnapshot {
  const snapshot = structuredClone(input),
    p = c.payload;
  if (c.kind === "reconcile_offline_session") return snapshot;
  if (c.kind === "start_session") {
    const day = snapshot.routine?.document.weeks[Number(p.week) - 1].find(
      (d) => d.id === p.dayId,
    );
    if (!day || snapshot.sessions.length)
      throw Error("No se puede iniciar la sesión con este contexto.");
    const sessionId = String(p.sessionId);
    let ordinal = 0;
    const items: SessionItem[] = day.blocks.flatMap((b) =>
      b.exercises.map((e) => {
        const id = v5(e.id, sessionId);
        return {
          id,
          position_id: e.id,
          lineage_id: e.lineageId,
          block_id: b.id,
          block_name: b.name,
          exercise_id: e.exerciseId,
          name: e.name,
          group: e.group,
          type: e.type,
          warmup: e.warmup,
          ordinal: ++ordinal,
          skipped: false,
          prescription: structuredClone(e.prescription),
          macro_rest: b.macroRest,
          macro_target: b.macroTarget,
          sets: Array.from({ length: e.prescription.sets! }, (_, index) => ({
            id: v5(String(index + 1), id),
            ordinal: index + 1,
            state: "pending" as const,
            source: "pending" as const,
            weight: e.prescription.weight,
            reps: e.prescription.reps,
            duration_sec: e.prescription.durationSec,
          })),
        };
      }),
    );
    snapshot.sessions.push({
      id: sessionId,
      student_id: c.studentId,
      period_id: String(p.periodId),
      routine_revision_id: String(p.routineRevisionId),
      day_id: String(p.dayId),
      week: Number(p.week),
      status: "open",
      date: String(p.date),
      started_at: c.capturedAt,
      ended_at: null,
      items,
    });
    return snapshot;
  }
  const session = snapshot.sessions.find((s) => s.id === p.sessionId);
  if (!session) throw Error("La sesión ya no está abierta.");
  if (c.kind === "finish_session") return snapshot; // Keep a provisional close visible until the server acknowledges it.
  const item = session.items.find((i) => i.id === p.itemId);
  if (!item) throw Error("El ejercicio ya no está disponible.");
  if (c.kind === "skip_item") item.skipped = Boolean(p.skipped);
  if (c.kind === "adjust_prescription") {
    const field = String(p.field),
      value = p.value as number | null;
    if (field === "macroRest" || field === "macroTarget") {
      for (const other of session.items.filter(
        (i) => i.block_id === item.block_id,
      )) {
        if (field === "macroRest") other.macro_rest = value;
        else other.macro_target = String(p.value);
      }
    } else {
      const next = { ...item.prescription, [field]: value };
      if (
        item.sets.some((s) => s.ordinal > next.sets! && s.state !== "pending")
      )
        throw Error("El nuevo objetivo no puede borrar series registradas.");
      item.prescription = next;
      item.sets = item.sets.filter((s) => s.ordinal <= next.sets!);
      for (let n = 1; n <= next.sets!; n++) {
        let set = item.sets.find((s) => s.ordinal === n);
        if (!set) {
          set = {
            id: v5(String(n), item.id),
            ordinal: n,
            state: "pending",
            source: "pending",
            weight: null,
            reps: null,
            duration_sec: null,
          };
          item.sets.push(set);
        }
        if (set.state === "pending") {
          set.weight = next.weight;
          set.reps = next.reps;
          set.duration_sec = next.durationSec;
        }
      }
    }
    if (p.scope === "session_and_future" && snapshot.routine) {
      for (const week of snapshot.routine.document.weeks.slice(
        session.week - 1,
      ))
        for (const day of week)
          for (const block of day.blocks)
            for (const e of block.exercises)
              if (e.lineageId === item.lineage_id) {
                if (field === "macroRest") block.macroRest = value;
                else if (field === "macroTarget")
                  block.macroTarget = p.value as "series" | "blocks";
                else
                  e.prescription = {
                    ...e.prescription,
                    [field]: value,
                  } as Prescription;
              }
    }
  }
  if (c.kind === "record_set") {
    const set = item.sets.find((s) => s.id === p.setId);
    if (!set || set.state !== "pending")
      throw Error("La serie requiere una corrección explícita.");
    Object.assign(set, {
      state: p.state,
      source: "observed",
      weight: p.state === "skipped" ? null : p.weight,
      reps: p.state === "skipped" ? null : p.reps,
      duration_sec: p.state === "skipped" ? null : p.durationSec,
    });
  }
  return snapshot;
}
