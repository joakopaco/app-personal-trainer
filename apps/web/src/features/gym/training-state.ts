import { z } from "zod";
import type { GymResult, GymSession } from "./api";
import { parseNumber } from "@pulso/domain/numbers";

export type TrainingRawValues = Record<string, string>;
export function trainingInputKey(
  positionId: string,
  index: number,
  field: string,
) {
  return `${positionId}:${index}:${field}`;
}
export function invalidTrainingText(values: TrainingRawValues) {
  return Object.entries(values).some(([key, value]) => {
    const field = key.split(":").at(-1);
    return (
      (field === "weight" || field === "reps" || field === "durationSec") &&
      value !== "" &&
      !parseNumber(field, value).ok
    );
  });
}

export type TrainingRequest = {
  operationId: string;
  kind: "save_session" | "finish_session";
  payload: { id: string; expectedRevision: number; results: GymResult[] };
};
const resultSchema = z.array(
  z.object({
    positionId: z.string(),
    skipped: z.boolean(),
    sets: z
      .array(
        z.object({
          weight: z.number().nullable(),
          reps: z.number().nullable(),
          durationSec: z.number().nullable(),
          confirmed: z.boolean(),
        }),
      )
      .min(1)
      .max(50),
  }),
);
const draftSchema = z.object({
  revision: z.number().int().nonnegative(),
  results: resultSchema,
  rawValues: z.record(z.string(), z.string()).default({}),
  pending: z
    .object({
      operationId: z.uuid(),
      kind: z.enum(["save_session", "finish_session"]),
      payload: z.object({
        id: z.string(),
        expectedRevision: z.number().int().nonnegative(),
        results: resultSchema,
      }),
    })
    .nullable(),
});

export function initialTrainingResults(session: GymSession): GymResult[] {
  return session.day.blocks
    .flatMap((block) => block.exercises)
    .map(
      (exercise) =>
        session.results.find((result) => result.positionId === exercise.id) ?? {
          positionId: exercise.id,
          skipped: false,
          sets: Array.from(
            { length: exercise.prescription.sets || 1 },
            (_, index) => ({
              weight: (
                exercise.prescription.progression?.[index] ??
                exercise.prescription
              ).weight,
              reps: (
                exercise.prescription.progression?.[index] ??
                exercise.prescription
              ).reps,
              durationSec: exercise.prescription.durationSec,
              confirmed: false,
            }),
          ),
        },
    );
}

// Compare fields explicitly: Postgres jsonb can return a different key order.
export function sameTrainingResults(a: GymResult[], b: GymResult[]): boolean {
  return (
    a.length === b.length &&
    a.every((item) => {
      const other = b.find(
        (candidate) => candidate.positionId === item.positionId,
      );
      return (
        other &&
        item.skipped === other.skipped &&
        item.sets.length === other.sets.length &&
        item.sets.every((set, index) => {
          const next = other.sets[index];
          return (
            set.weight === next.weight &&
            set.reps === next.reps &&
            set.durationSec === next.durationSec &&
            set.confirmed === next.confirmed
          );
        })
      );
    })
  );
}

export function recoverTrainingDraft(raw: string | null, session: GymSession) {
  const fresh = {
    results: initialTrainingResults(session),
    rawValues: {} as TrainingRawValues,
    revision: session.revision,
    pending: null as TrainingRequest | null,
    dirty: false,
    conflict: false,
    error: "",
  };
  if (!raw) return fresh;
  try {
    const saved = draftSchema.parse(JSON.parse(raw));
    const positions = fresh.results.map((result) => result.positionId);
    if (
      saved.results.length !== positions.length ||
      new Set(saved.results.map((r) => r.positionId)).size !==
        positions.length ||
      saved.results.some((r) => !positions.includes(r.positionId)) ||
      (saved.pending &&
        (saved.pending.payload.id !== session.id ||
          saved.pending.payload.expectedRevision !== saved.revision ||
          !sameTrainingResults(saved.pending.payload.results, saved.results)))
    )
      throw Error("Invalid draft");
    if (
      sameTrainingResults(saved.results, fresh.results) &&
      !invalidTrainingText(saved.rawValues) &&
      (!saved.pending ||
        (session.revision > saved.revision &&
          saved.pending.kind === "save_session"))
    )
      return fresh;
    if (saved.revision === session.revision)
      return { ...fresh, ...saved, dirty: true };
    return {
      ...fresh,
      results: saved.results,
      rawValues: saved.rawValues,
      revision: saved.revision,
      dirty: true,
      conflict: true,
      error:
        "Este entrenamiento cambió en otra pestaña. Tu edición local se conserva para revisarla o descargarla.",
    };
  } catch {
    return {
      ...fresh,
      conflict: true,
      error:
        "No se pudo leer la edición local. Descargala antes de usar la versión guardada.",
    };
  }
}

export function trainingSetError(
  set: GymResult["sets"][number],
  type: string,
  requireValues = set.confirmed,
): string | null {
  for (const [field, minimum, maximum, label] of [
    ["weight", 0, 1000, "peso"],
    ["reps", 1, 500, "repeticiones"],
    ["durationSec", 1, 86400, "tiempo"],
  ] as const) {
    const value = set[field];
    const required =
      requireValues &&
      (field === "weight"
        ? type === "load_reps"
        : field === "reps"
          ? type !== "time"
          : type === "time");
    if (value === null && !required) continue;
    if (
      value === null ||
      !Number.isFinite(value) ||
      value < minimum ||
      value > maximum ||
      (field !== "weight" && !Number.isInteger(value)) ||
      (field === "weight" &&
        Math.abs(value * 100 - Math.round(value * 100)) > 0.000001)
    )
      return `Revisá ${label}: ${minimum}–${maximum}${field === "weight" ? " kg, hasta 2 decimales" : ", sin decimales"}.`;
  }
  return null;
}
