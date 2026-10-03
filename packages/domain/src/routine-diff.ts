import type { RoutineDocument } from "./routines";
export type FieldConflict = {
  path: string;
  base: unknown;
  local: unknown;
  remote: unknown;
};
export function mergeRoutine(
  base: RoutineDocument,
  local: RoutineDocument,
  remote: RoutineDocument,
  choices: Record<string, "local" | "remote">,
): { document: RoutineDocument; conflicts: FieldConflict[] } {
  const conflicts: FieldConflict[] = [];
  const equal = (a: unknown, b: unknown) =>
    JSON.stringify(a) === JSON.stringify(b);
  function visit(b: unknown, l: unknown, r: unknown, path: string): unknown {
    if (equal(l, b)) return structuredClone(r);
    if (equal(r, b) || equal(l, r)) return structuredClone(l);
    if (
      Array.isArray(b) &&
      Array.isArray(l) &&
      Array.isArray(r) &&
      b.length === l.length &&
      b.length === r.length &&
      b.every(
        (item, i) =>
          !item?.id || (item.id === l[i]?.id && item.id === r[i]?.id),
      )
    )
      return b.map((item, i) => visit(item, l[i], r[i], path + "/" + i));
    if (
      b &&
      l &&
      r &&
      typeof b === "object" &&
      typeof l === "object" &&
      typeof r === "object" &&
      !Array.isArray(b) &&
      !Array.isArray(l) &&
      !Array.isArray(r)
    ) {
      const bo = b as Record<string, unknown>,
        lo = l as Record<string, unknown>,
        ro = r as Record<string, unknown>;
      return Object.fromEntries(
        [
          ...new Set([
            ...Object.keys(bo),
            ...Object.keys(lo),
            ...Object.keys(ro),
          ]),
        ].map((k) => [k, visit(bo[k], lo[k], ro[k], path + "/" + k)]),
      );
    }
    if (choices[path])
      return structuredClone(choices[path] === "local" ? l : r);
    conflicts.push({ path, base: b, local: l, remote: r });
    return structuredClone(r);
  }
  return {
    document: visit(base, local, remote, "rutina") as RoutineDocument,
    conflicts,
  };
}

const fieldLabels: Record<string, string> = {
  name: "Nombre",
  weight: "Peso (kg)",
  reps: "Repeticiones",
  sets: "Series",
  durationSec: "Duración (s)",
  microRest: "Descanso micro (s)",
  macroRest: "Descanso macro (s)",
  macroTarget: "Descanso entre",
  type: "Tipo",
  warmup: "Aproximación",
  exercises: "Ejercicios",
  blocks: "Bloques",
  weeks: "Semanas",
};
export function conflictLabel(path: string, doc: RoutineDocument): string {
  const parts = path.split("/").slice(1),
    labels: string[] = [];
  let current: unknown = doc;
  for (let n = 0; n < parts.length; n++) {
    const part = parts[n];
    if (Array.isArray(current)) {
      const index = Number(part),
        entry = current[index];
      labels.push(
        parts[n - 1] === "weeks"
          ? `Semana ${index + 1}`
          : (entry?.name ?? `Día ${index + 1}`),
      );
      current = entry;
    } else if (current && typeof current === "object") {
      current = (current as Record<string, unknown>)[part];
      if (n === parts.length - 1) labels.push(fieldLabels[part] ?? "Contenido");
    }
  }
  return labels.join(" · ") || "Rutina completa";
}
export function conflictValue(value: unknown): string {
  if (value === null || value === undefined) return "Sin definir";
  if (Array.isArray(value))
    return value.length
      ? value
          .map((v, n) =>
            Array.isArray(v)
              ? `Semana ${n + 1}: ${conflictValue(v)}`
              : conflictValue(v),
          )
          .join(" / ")
      : "Vacío";
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    return (
      String(o.name ?? "Contenido") +
      (o.blocks
        ? ": " + conflictValue(o.blocks)
        : o.exercises
          ? ": " + conflictValue(o.exercises)
          : "")
    );
  }
  if (typeof value === "boolean") return value ? "Sí" : "No";
  return (
    (
      {
        series: "series",
        blocks: "bloques",
        main: "Principal",
        mobility: "Movilidad",
        approximation: "Aproximación",
        load_reps: "Carga y repeticiones",
        reps: "Repeticiones",
        time: "Tiempo",
      } as Record<string, string>
    )[String(value)] ?? String(value)
  );
}
