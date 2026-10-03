import { z } from "zod";
import { v5 } from "uuid";
import { routineSchema, type RoutineDocument } from "./routines";
const record = z
  .object({
    date: z.iso.date(),
    name: z.string(),
    group: z.string(),
    weight: z.number().nonnegative(),
    sets: z.number().int().nonnegative(),
    reps: z.number().int().nonnegative(),
  })
  .passthrough();
const person = z
  .object({
    id: z.string().min(1),
    name: z.string().trim().min(1).max(100),
    weekdays: z.array(z.string()),
    archives: z.array(z.unknown()),
    records: z.array(record).max(10000),
    history: z.array(z.unknown()),
    routine: z.unknown().optional(),
    draft: z.unknown().optional(),
  })
  .passthrough();
const schema = z.object({
  format: z.literal("pulso-backup"),
  data: z.object({
    version: z.literal(6),
    revision: z.number().int().nonnegative(),
    operationIds: z.array(z.string()),
    db: z.object({
      people: z.array(person).min(1).max(100),
      templates: z.array(z.unknown()),
      library: z.array(z.unknown()),
      branding: z.record(z.string(), z.unknown()),
      visits: z.array(
        z
          .object({ id: z.string(), personId: z.string(), date: z.iso.date() })
          .passthrough(),
      ),
      sessions: z.array(
        z
          .object({
            id: z.string(),
            personId: z.string(),
            status: z.enum(["open", "closed"]),
          })
          .passthrough(),
      ),
    }),
  }),
});
type LegacyRoutine = {
  name: string;
  period: string;
  weeks: {
    id: string;
    title: string;
    blocks: {
      id: string;
      name: string;
      type: "main" | "mobility" | "approximation";
      macroRest: number | null;
      macroTarget: "series" | "blocks";
      exercises: {
        id: string;
        name: string;
        group: string;
        weight: number | null;
        sets: number | null;
        reps: number | null;
        microRest: number | null;
      }[];
    }[];
  }[][];
};
const namespace = "e2607149-109a-47d7-b7f1-bcbb364de78b";
function convertRoutine(
  raw: unknown,
  sourceId: string,
): RoutineDocument | null {
  if (!raw) return null;
  const old = raw as LegacyRoutine;
  if (!Array.isArray(old.weeks) || old.weeks.length !== 4)
    throw Error("Rutina legada inválida");
  const document = {
    schemaVersion: 1 as const,
    name: old.name,
    weeks: old.weeks.map((week, wi) =>
      week.map((day, di) => ({
        id: v5(sourceId + ":" + wi + ":" + di, namespace),
        name: day.title,
        blocks: day.blocks.map((b, bi) => ({
          id: v5(sourceId + ":" + wi + ":" + di + ":" + bi, namespace),
          name: b.name,
          type: b.type,
          macroRest: b.macroRest ?? null,
          macroTarget: b.macroTarget,
          exercises: b.exercises.map((e, ei) => ({
            id: v5(
              sourceId + ":" + wi + ":" + di + ":" + bi + ":" + ei,
              namespace,
            ),
            lineageId: v5(
              sourceId + ":lineage:" + day.id + ":" + b.id + ":" + e.id,
              namespace,
            ),
            exerciseId:
              "legacy:" +
              e.name
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-"),
            name: e.name,
            group: e.group,
            type: "load_reps" as const,
            warmup: b.type !== "main",
            prescription: {
              weight: e.weight ?? null,
              sets: e.sets ?? null,
              reps: e.reps ?? null,
              durationSec: null,
              microRest: e.microRest ?? null,
            },
          })),
        })),
      })),
    ),
  };
  return routineSchema.parse(document);
}
export async function previewImport(text: string) {
  if (new TextEncoder().encode(text).length > 2_000_000)
    throw Error("La copia supera el límite de 2 MB para esta importación.");
  const parsed = schema.parse(JSON.parse(text));
  const db = parsed.data.db;
  const ids = new Set(db.people.map((p) => p.id));
  if (ids.size !== db.people.length) throw Error("Alumnos duplicados");
  for (const list of [db.visits, db.sessions]) {
    if (
      new Set(list.map((r) => r.id)).size !== list.length ||
      list.some((r) => !ids.has(r.personId))
    )
      throw Error("Referencias legadas inválidas");
  }
  const hash = Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
    ),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const students = db.people.map((p) => ({
    sourceId: p.id,
    name: p.name,
    routine: convertRoutine(p.routine, p.id),
    recordCount: p.records.length,
  }));
  return {
    hash,
    sourceText: text,
    students,
    recordCount: students.reduce((n, p) => n + p.recordCount, 0),
    openSessions: db.sessions.filter((s) => s.status === "open").length,
    possibleDemo: db.people.some((p) =>
      ["Joaquín Santa María", "Lucía Fernández", "Tomás Acosta"].includes(
        p.name,
      ),
    ),
  };
}
