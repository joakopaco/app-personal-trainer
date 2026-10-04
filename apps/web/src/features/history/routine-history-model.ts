import { routineSchema, type RoutineDocument } from "@pulso/domain/routines";
export type RoutineRevision = {
  id: string;
  created_at: string;
  document: unknown;
};
export type RoutineEntry = {
  id: string;
  document: RoutineDocument;
  start: string;
  end: string | null;
  current: boolean;
};

// Renewals and live prescription edits retain the program's day IDs. New programs
// get new IDs; keeping adjacent revisions together avoids inventing monthly routines.
export function routineTimeline(
  revisions: RoutineRevision[],
  currentRevisionId?: string,
): RoutineEntry[] {
  const entries: RoutineEntry[] = [];
  let previousIdentity = "";
  for (const revision of [...revisions].sort(
    (a, b) =>
      a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  )) {
    const document = routineSchema.parse(revision.document);
    const identity = JSON.stringify([
      document.name,
      document.weeks.map((week) => week.map((day) => day.id)),
    ]);
    const previous = entries.at(-1);
    if (previous && identity === previousIdentity) {
      previous.document = document;
      previous.current ||= revision.id === currentRevisionId;
    } else {
      if (previous) previous.end = revision.created_at;
      entries.push({
        id: revision.id,
        document,
        start: revision.created_at,
        end: null,
        current: revision.id === currentRevisionId,
      });
    }
    previousIdentity = identity;
  }
  return entries;
}
export const routineDate = (value: string) =>
  new Date(value).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
