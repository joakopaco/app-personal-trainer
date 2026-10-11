import { csvCell } from "@pulso/domain/metrics";
import type { ExerciseProgress } from "../history/history-progress-model";

/** Use the viewer's calendar day consistently in filters, charts and history. */
export function sessionDate(value: string, timeZone?: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function progressCsv(name: string, exercises: ExerciseProgress[]) {
  const rows = [
    [
      "Entrenado",
      "Grupo muscular",
      "Ejercicio",
      "Fecha",
      "Valor",
      "Unidad",
      "Repeticiones",
      "Series confirmadas",
      "Volumen kg × reps",
    ],
    ...exercises.flatMap((e) =>
      e.points.map((p) => [
        name,
        e.group,
        e.name,
        p.date,
        String(p.value),
        e.unit,
        p.reps === null ? "" : String(p.reps),
        String(p.sets),
        p.volume === null ? "" : String(p.volume),
      ]),
    ),
  ];
  return "\uFEFF" + rows.map((r) => r.map(csvCell).join(";")).join("\r\n");
}
