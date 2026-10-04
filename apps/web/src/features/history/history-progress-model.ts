export type ResultSet = {
  id: string;
  ordinal: number;
  state: string;
  source: string;
  weight: number | null;
  reps: number | null;
  duration_sec: number | null;
};
export type ResultItem = {
  id: string;
  name: string;
  type: string;
  warmup: boolean;
  skipped: boolean;
  exercise_id: string;
  group: string;
  session_sets: ResultSet[];
};
export type ResultSession = {
  id: string;
  date: string;
  ended_at: string;
  session_items: ResultItem[];
};
export const muscleGroups = [
  "Pecho",
  "Espalda",
  "Hombros",
  "Trapecios",
  "Bíceps",
  "Tríceps",
  "Antebrazos",
  "Abdominales",
  "Oblicuos",
  "Lumbares",
  "Glúteos",
  "Abductores",
  "Aductores",
  "Cuádriceps",
  "Isquios",
  "Pantorrillas",
  "Tibial anterior",
];
const normalize = (value: string) =>
  value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
export function canonicalMuscleGroup(name: string) {
  const key = normalize(name);
  const aliases: Record<string, string> = {
    abdomen: "Abdominales",
    abdominal: "Abdominales",
    gluteo: "Glúteos",
    gemelos: "Pantorrillas",
    gemelo: "Pantorrillas",
    soleo: "Pantorrillas",
    isquiotibiales: "Isquios",
    femorales: "Isquios",
    dorsales: "Espalda",
    deltoides: "Hombros",
    trapecio: "Trapecios",
    lumbar: "Lumbares",
    antebrazo: "Antebrazos",
    tibiales: "Tibial anterior",
  };
  return (
    muscleGroups.find((group) => normalize(group) === key) ||
    aliases[key] ||
    name.trim()
  );
}
export type ProgressPoint = {
  sessionId: string;
  date: string;
  value: number;
  reps: number | null;
  sets: number;
  volume: number | null;
  source: string;
};
export type ExerciseProgress = {
  key: string;
  exerciseId: string;
  name: string;
  group: string;
  type: string;
  unit: string;
  points: ProgressPoint[];
};
/** Compare only the same exercise, tracking type and principal muscle. Never mix units. */
export function buildProgress(sessions: ResultSession[]): ExerciseProgress[] {
  const exercises = new Map<string, ExerciseProgress>();
  for (const session of [...sessions].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.ended_at.localeCompare(b.ended_at) ||
      a.id.localeCompare(b.id),
  )) {
    const sessionItems = new Map<
      string,
      { item: ResultItem; sets: ResultSet[] }
    >();
    for (const item of session.session_items) {
      if (item.skipped || item.warmup) continue;
      const key = JSON.stringify([
        item.exercise_id,
        item.type,
        canonicalMuscleGroup(item.group),
      ]);
      const valid = item.session_sets.filter(
        (set) =>
          set.state === "done" &&
          (item.type === "load_reps"
            ? set.weight !== null && set.reps !== null
            : item.type === "reps"
              ? set.reps !== null
              : item.type === "time" && set.duration_sec !== null),
      );
      if (!valid.length) continue;
      const previous = sessionItems.get(key);
      sessionItems.set(key, {
        item,
        sets: [...(previous?.sets || []), ...valid],
      });
    }
    for (const [key, { item, sets }] of sessionItems) {
      const valueOf = (set: ResultSet) =>
        (item.type === "load_reps"
          ? set.weight
          : item.type === "reps"
            ? set.reps
            : set.duration_sec)!;
      const best = [...sets].sort(
        (a, b) => valueOf(b) - valueOf(a) || (b.reps ?? 0) - (a.reps ?? 0),
      )[0];
      let exercise = exercises.get(key);
      if (!exercise) {
        exercise = {
          key,
          exerciseId: item.exercise_id,
          name: item.name,
          group: canonicalMuscleGroup(item.group),
          type: item.type,
          unit:
            item.type === "load_reps"
              ? "kg"
              : item.type === "reps"
                ? "reps"
                : "s",
          points: [],
        };
        exercises.set(key, exercise);
      }
      exercise.points.push({
        sessionId: session.id,
        date: session.date,
        value: valueOf(best),
        reps: best.reps,
        sets: sets.length,
        volume:
          item.type === "load_reps"
            ? sets.reduce((total, set) => total + set.weight! * set.reps!, 0)
            : null,
        source: best.source,
      });
    }
  }
  return [...exercises.values()];
}
export type PageResult<T> = { data: T[] | null; error: unknown };
/** Ask for an extra page to distinguish exactly-at-limit history from truncated history. */
export async function loadAllPages<T>(
  fetchPage: (start: number, end: number) => PromiseLike<PageResult<T>>,
  pageSize = 200,
  limit = 5000,
): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = [];
  for (let start = 0; start <= limit; start += pageSize) {
    const size = Math.min(pageSize, limit - start + 1);
    const result = await fetchPage(start, start + size - 1);
    if (result.error) throw result.error;
    const page = result.data || [];
    rows.push(...page);
    if (rows.length > limit)
      return { rows: rows.slice(0, limit), truncated: true };
    if (page.length < size) return { rows, truncated: false };
  }
  return { rows, truncated: false };
}
