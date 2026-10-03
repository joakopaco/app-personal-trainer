type ObjectValue = Record<string, unknown>;
const object = (v: unknown): ObjectValue =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as ObjectValue) : {};
const array = (v: unknown): ObjectValue[] =>
  Array.isArray(v) ? v.map(object) : [];
export const eventNames: Record<string, string> = {
  create_student: "Alumno agregado",
  update_student: "Ficha actualizada",
  archive_student: "Estado del alumno",
  start_session: "Entrenamiento iniciado",
  adjust_prescription: "Rutina ajustada",
  record_set: "Serie registrada",
  skip_item: "Ejercicio omitido o recuperado",
  finish_session: "Entrenamiento cerrado",
  correct_result: "Resultado corregido",
  save_draft: "Borrador guardado",
  publish_routine: "Rutina activada",
  ensure_period: "Renovación mensual",
  mark_absent: "Inasistencia registrada",
  reschedule_visit: "Turno reprogramado",
  create_visit: "Turno agregado",
  save_schedule: "Horario actualizado",
  reconcile_offline_session: "Entrenamiento recuperado",
  import_legacy_v6: "Datos anteriores importados",
};
export function auditChanges(before: unknown, after: unknown) {
  const collect = (value: unknown) => {
    const root = object(value),
      result = object(root.result);
    const items = array(result.session_items).length
      ? array(result.session_items)
      : array(root.sessions).flatMap((s) => array(s.items));
    const sets: ObjectValue[] = array(result.session_sets).length
      ? array(result.session_sets)
      : items.flatMap((i) =>
          array(i.sets).map((s) => ({ ...s, item_id: i.id })),
        );
    const fields = new Map<string, { label: string; value: unknown }>();
    for (const item of items) {
      const rx = object(item.prescription);
      for (const [field, label] of Object.entries({
        weight: "peso (kg)",
        reps: "repeticiones",
        sets: "series",
        durationSec: "duración (s)",
        microRest: "descanso micro (s)",
      }))
        fields.set(String(item.id) + ":" + field, {
          label: item.name + " · " + label,
          value: rx[field],
        });
      fields.set(String(item.id) + ":macro", {
        label: item.name + " · descanso macro (s)",
        value: item.macro_rest,
      });
    }
    for (const set of sets) {
      const name = items.find((i) => i.id === set.item_id)?.name ?? "Ejercicio";
      for (const [field, label] of Object.entries({
        weight: "peso (kg)",
        reps: "repeticiones",
        duration_sec: "duración (s)",
      }))
        fields.set(String(set.id) + ":" + field, {
          label: name + " · serie " + set.ordinal + " · " + label,
          value: set[field],
        });
    }
    return fields;
  };
  const a = collect(before),
    b = collect(after);
  return [...b.entries()]
    .filter(([key, v]) => a.has(key) && a.get(key)?.value !== v.value)
    .map(([key, v]) => ({
      label: v.label,
      before: a.get(key)!.value ?? "—",
      after: v.value ?? "—",
    }));
}
