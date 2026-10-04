import {
  cloneRoutineDocument,
  routineSchema,
  type RoutineDocument,
} from "@pulso/domain/routines";
import type { LocalStore } from "@pulso/sync/local-db";

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
) {
  const draft: TemplateDraft = {
    id: crypto.randomUUID(),
    document: cloneRoutineDocument(document),
    revision: 0,
    rawValues: {},
  };
  await db.meta.put({ key: templateDraftKey(draft.id), value: draft });
  return draft.id;
}
