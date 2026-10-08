import {
  cloneRoutineDocument,
  routineSchema,
  type RoutineDocument,
} from "@pulso/domain/routines";
import type { LocalStore } from "@pulso/sync/local-db";
import { DraftStorage } from "./draft-storage";

export type TemplateDraft = {
  id: string;
  document: RoutineDocument;
  revision: number;
  rawValues: Record<string, string>;
};
export const templateDraftKey = (id: string) => "template-draft:" + id;
export const templatePath = (id: string) => "/rutinas/plantillas/" + id;

export function sameRoutineContent(a: unknown, b: unknown) {
  // JSONB returns keys in a different order. Parse both to the schema's order.
  const left = routineSchema.safeParse(a),
    right = routineSchema.safeParse(b);
  return (
    left.success &&
    right.success &&
    JSON.stringify(left.data) === JSON.stringify(right.data)
  );
}

export async function createTemplateDraft(
  db: LocalStore,
  document: RoutineDocument,
  rawValues: Record<string, string> = {},
) {
  if (document.weeks.some((week) => week.length > 6))
    throw Error(
      "Las plantillas admiten hasta 6 días. Revisá la distribución antes de copiarla; no se descartó ningún día.",
    );
  const copy = cloneRoutineDocument(document);
  const ids = new Map<string, string>();
  document.weeks.forEach((week, wi) =>
    week.forEach((day, di) =>
      day.blocks.forEach((block, bi) => {
        const cloned = copy.weeks[wi][di].blocks[bi];
        ids.set(block.id, cloned.id);
        block.exercises.forEach((exercise, ei) =>
          ids.set(exercise.id, cloned.exercises[ei].id),
        );
      }),
    ),
  );
  const draft: TemplateDraft = {
    id: crypto.randomUUID(),
    document: copy,
    revision: 0,
    rawValues: Object.fromEntries(
      Object.entries(rawValues).map(([key, value]) => {
        const [id, ...field] = key.split(":");
        return [[ids.get(id) ?? id, ...field].join(":"), value];
      }),
    ),
  };
  const storage = new DraftStorage(db, templateDraftKey(draft.id));
  await storage.read();
  await storage.write(draft);
  return draft.id;
}
