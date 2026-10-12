import { routineSchema, type RoutineDocument } from "@pulso/domain/routines";
export type RoutineRevision = {
  id: string;
  created_at: string;
  document: unknown;
  previous_revision_id?: string | null;
  source_session_id?: string | null;
};
export type RoutineVersion = {
  id: string;
  createdAt: string;
  document: RoutineDocument;
  sourceSessionId?: string | null;
};
export type RoutineEntry = {
  id: string;
  document: RoutineDocument;
  start: string;
  end: string | null;
  current: boolean;
  versions: RoutineVersion[];
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
    const version: RoutineVersion = {
      id: revision.id,
      createdAt: revision.created_at,
      document,
      sourceSessionId: revision.source_session_id,
    };
    if (
      previous &&
      (identity === previousIdentity ||
        revision.previous_revision_id === previous.id)
    ) {
      // A monthly renewal with the exact same document is not a new version.
      if (JSON.stringify(previous.document) !== JSON.stringify(document))
        previous.versions.push(version);
      previous.id = revision.id;
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
        versions: [version],
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
