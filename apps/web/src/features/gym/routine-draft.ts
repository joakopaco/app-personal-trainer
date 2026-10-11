import { z } from "zod";
import {
  routineSchema,
  daySchema,
  blockSchema,
  type RoutineDocument,
} from "@pulso/domain/routines";
import { parseDisplayedNumber } from "../../components/rest-minutes";
import { limits, type NumericField } from "@pulso/domain/numbers";

// Draft names may be temporarily empty. Numeric text lives beside the document.
const editableDocument = routineSchema.extend({
  name: z.string(),
  weeks: z
    .array(
      z
        .array(
          daySchema.extend({
            name: z.string(),
            blocks: z.array(blockSchema.extend({ name: z.string() })).max(30),
          }),
        )
        .min(1)
        .max(14),
    )
    .length(4),
});
const pendingSchema = z.object({
  operationId: z.uuid(),
  kind: z.enum([
    "save_routine",
    "publish_routine",
    "discard_routine",
    "retire_routine",
  ]),
  payload: z.record(z.string(), z.unknown()),
});
export type PendingRoutineCommand = z.infer<typeof pendingSchema>;
const draftSchema = z.object({
  base: z.string(),
  baseRevision: z.number().int().optional(),
  document: editableDocument,
  rawValues: z.record(z.string(), z.string()).default({}),
  pending: pendingSchema.nullable().default(null),
});
export type GymRoutineDraft = z.infer<typeof draftSchema>;

export function sameGymRoutineBase(base: string, document: RoutineDocument) {
  const canonical = (value: unknown): string =>
    JSON.stringify(value, (_key, entry) =>
      entry && typeof entry === "object" && !Array.isArray(entry)
        ? Object.fromEntries(
            Object.entries(entry).sort(([a], [b]) => a.localeCompare(b)),
          )
        : entry,
    );
  try {
    return canonical(JSON.parse(base)) === canonical(document);
  } catch {
    return false;
  }
}

export function parseGymRoutineDraft(value: string): GymRoutineDraft {
  const parsed = JSON.parse(value);
  // Recover commands written by the previous editor without changing their ID.
  if (parsed.pendingSave && !parsed.pending)
    parsed.pending = { ...parsed.pendingSave, kind: "save_routine" };
  return draftSchema.parse(parsed);
}

export function invalidRoutineInputs(values: Record<string, string>) {
  return new Set(
    Object.entries(values)
      .filter(([key, raw]) => {
        const field = key.split(":").at(-1) as NumericField;
        return (
          !(field in limits) ||
          (raw !== "" && !parseDisplayedNumber(field, raw).ok)
        );
      })
      .map(([key]) => key),
  );
}

export function downloadGymRoutineDraft(routineId: string, snapshot: unknown) {
  const url = URL.createObjectURL(
    new Blob(
      [
        JSON.stringify(
          {
            format: "pulso-gym-routine-recovery",
            version: 1,
            routineId,
            exportedAt: new Date().toISOString(),
            snapshot,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    ),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `pulso-rutina-${routineId}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function pruneRoutineInputs(
  document: RoutineDocument,
  values: Record<string, string>,
) {
  const ids = new Set(
    document.weeks.flatMap((week) =>
      week.flatMap((day) =>
        day.blocks.flatMap((block) => [
          block.id,
          ...block.exercises.map((exercise) => exercise.id),
        ]),
      ),
    ),
  );
  return Object.fromEntries(
    Object.entries(values).filter(([key]) => ids.has(key.split(":")[0])),
  );
}

export class GymDraftConflict extends Error {
  constructor() {
    super(
      "La preparación cambió en otra pestaña. Exportá tus cambios o volvé a cargar la versión guardada.",
    );
  }
}

/** Versioned, serialized writes prevent a stale tab from replacing or reviving a draft. */
export class GymRoutineDraftStorage {
  private version: string | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    readonly key: string,
    private providedStorage?: Storage,
  ) {}
  // Access can throw SecurityError before getItem is called. Resolve it only
  // inside the asynchronous read/write callbacks so the editor can recover.
  private get storage(): Storage {
    return this.providedStorage ?? localStorage;
  }
  private get versionKey() {
    return this.key + ":version";
  }
  private lock<T>(run: () => T): Promise<T> {
    return typeof navigator !== "undefined" && navigator.locks
      ? navigator.locks.request(this.key, run)
      : Promise.resolve().then(run);
  }
  async read() {
    await this.queue.catch(() => undefined);
    return this.lock(() => {
      this.version = this.storage.getItem(this.versionKey);
      return this.storage.getItem(this.key);
    });
  }
  write(draft: GymRoutineDraft) {
    return this.mutate(JSON.stringify(draft));
  }
  remove() {
    return this.mutate(null);
  }
  private mutate(value: string | null): Promise<void> {
    const pending = this.queue
      .catch(() => undefined)
      .then(() =>
        this.lock(() => {
          if (this.storage.getItem(this.versionKey) !== this.version)
            throw new GymDraftConflict();
          const next = crypto.randomUUID();
          // Write the version first: even an exhausted quota cannot permit a stale overwrite.
          this.storage.setItem(this.versionKey, next);
          this.version = next;
          if (value === null) this.storage.removeItem(this.key);
          else this.storage.setItem(this.key, value);
        }),
      );
    this.queue = pending;
    return pending;
  }
}
