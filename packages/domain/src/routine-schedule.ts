import {
  blankRoutine,
  cloneRoutineDocument,
  type RoutineDocument,
} from "./routines";
export const weekdayNames = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];
export function scheduledDays(weekdays: number[] = []) {
  return [
    ...new Set(weekdays.filter((n) => Number.isInteger(n) && n >= 1 && n <= 7)),
  ].sort((a, b) => a - b);
}
export function routineForSchedule(
  source: RoutineDocument | undefined,
  weekdays: number[],
  days = 1,
): RoutineDocument {
  const schedule = scheduledDays(weekdays);
  const count = schedule.length || Math.max(1, Math.min(6, days));
  if (source && schedule.length && source.weeks.some((w) => w.length > count))
    throw Error(
      "La base tiene más días que su agenda. Elegí una base compatible o actualizá los días de asistencia del alumno antes de copiarla.",
    );
  const doc = source ? cloneRoutineDocument(source) : blankRoutine();
  if (schedule.length || !source)
    doc.weeks = doc.weeks.map((week) =>
      Array.from({ length: count }, (_, n) => ({
        id: source && week[n] ? week[n].id : crypto.randomUUID(),
        name: `Día ${n + 1}`,
        blocks: source ? (week[n]?.blocks ?? []) : [],
      })),
    );
  for (const week of doc.weeks)
    for (const day of week)
      for (const b of day.blocks) b.macroTarget = "blocks";
  return doc;
}
