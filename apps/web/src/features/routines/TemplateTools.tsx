import { useEffect, useState } from "react";
import { cloud } from "../../adapters/supabase";
import { useData } from "../../app/DataProvider";
import {
  type RoutineDocument,
} from "@pulso/domain/routines";
import { loadAllPages } from "../history/history-progress-model";
import {
  routineTimeline,
  routineDate,
  type RoutineRevision,
} from "../history/routine-history-model";

import { routineForSchedule, scheduledDays, weekdayNames } from "@pulso/domain/routine-schedule";

type Source = { id: string; name: string; document: RoutineDocument };
export function TemplateTools({
  studentId,
  hasDraft,
  initialSource = "",
  onApply,
  onCancel,
}: {
  studentId: string;
  hasDraft: boolean;
  initialSource?: string;
  onApply: (doc: RoutineDocument) => Promise<void>;
  onCancel?: () => void;
}) {
  const { rows } = useData();
  const current = rows.find((r) => r.studentId === studentId)?.confirmed;
  const [templates, setTemplates] = useState<Source[]>([]);
  const [archives, setArchives] = useState<Source[]>([]);
  const [selected, setSelected] = useState(initialSource);
  const [name, setName] = useState("Nueva rutina");
  const weekdays = scheduledDays(current?.schedule?.weekdays);
  const [days, setDays] = useState(current?.schedule?.weekdays.length || 1);
  const [replace, setReplace] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const students: Source[] = rows
    .filter(
      (r) =>
        r.studentId !== studentId &&
        r.confirmed.routine &&
        !r.confirmed.student.archived,
    )
    .map((r) => ({
      id: "student:" + r.studentId,
      name:
        r.confirmed.student.name + " · " + r.confirmed.routine!.document.name,
      document: r.confirmed.routine!.document,
    }));
  const source = [...templates, ...students, ...archives].find(
    (s) => s.id === selected,
  );
  useEffect(() => {
    let active = true;
    void (async () => {
      const results = await Promise.allSettled([
        loadAllPages<Source>(
          (start, end) =>
            cloud()
              .from("routine_templates")
              .select("id,name,document")
              .order("name")
              .order("id")
              .range(start, end),
          200,
          5000,
        ),
        loadAllPages<RoutineRevision>(
          (start, end) =>
            cloud()
              .from("routine_revisions")
              .select("id,created_at,document")
              .eq("student_id", studentId)
              .order("created_at")
              .order("id")
              .range(start, end),
          200,
          5000,
        ),
      ]);
      if (!active) return;
      const [t, a] = results;
      if (t.status === "fulfilled" && !t.value.truncated)
        setTemplates(t.value.rows);
      if (a.status === "fulfilled" && !a.value.truncated)
        setArchives(
          routineTimeline(a.value.rows, current?.routine?.id)
            .filter((e) => !e.current)
            .reverse()
            .map((e) => ({
              id: "archive:" + e.id,
              name: `${e.document.name} · ${routineDate(e.start)}${e.end ? " — " + routineDate(e.end) : ""}`,
              document: e.document,
            })),
        );
      if (results.some((r) => r.status === "rejected" || r.value.truncated))
        setLoadError(
          "No se pudieron cargar todas las bases. Podés usar las disponibles o volver a intentar abriendo Nueva rutina.",
        );
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [studentId, current?.routine?.id]);
  return (
    <section className="card routine-start stack" aria-label="Crear rutina">
      <div>
        <p className="eyebrow">NUEVA RUTINA</p>
        <h2>Elegí cómo empezar</h2>
        <p className="muted">
          Desde cero, una plantilla, otro alumno o una rutina anterior. Cada
          base se copia completa y la original se conserva.
        </p>
      </div>
      {hasDraft && (
        <div className="notice stack">
          <strong>Ya tenés un borrador pendiente</strong>
          <span>
            Podés volver a él o reemplazarlo para empezar esta nueva rutina.
          </span>
          <label className="row">
            <input
              type="checkbox"
              checked={replace}
              onChange={(e) => setReplace(e.target.checked)}
            />{" "}
            Reemplazar el borrador pendiente
          </label>
        </div>
      )}
      <label className="field">
        Punto de partida
        <select
          aria-label="Punto de partida"
          value={selected}
          disabled={busy}
          onChange={(e) => {
            setSelected(e.target.value);
            const picked = [...templates, ...students, ...archives].find(
              (s) => s.id === e.target.value,
            );
            setName(
              picked
                ? picked.document.name.slice(0, 110) + " · nueva"
                : "Nueva rutina",
            );
          }}
        >
          <option value="">Desde cero</option>
          <optgroup label="Plantillas del catálogo">
            {templates.length ? (
              templates.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))
            ) : (
              <option disabled>Sin plantillas disponibles</option>
            )}
          </optgroup>
          <optgroup label="Rutinas de otros alumnos">
            {students.length ? (
              students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))
            ) : (
              <option disabled>Sin rutinas de otros alumnos</option>
            )}
          </optgroup>
          <optgroup label="Rutinas anteriores de este alumno">
            {archives.length ? (
              archives.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))
            ) : (
              <option disabled>Sin rutinas anteriores</option>
            )}
          </optgroup>
        </select>
      </label>
      <label className="field">
        Nombre de la nueva rutina
        <input
          value={name}
          maxLength={120}
          disabled={busy}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      {weekdays.length > 0 && <div className="scheduled-days"><strong>Días de su agenda</strong><div className="row">{weekdays.map(n => <span className="badge" key={n}>{weekdayNames[n-1]}</span>)}</div><small>Se preparan estos días en las cuatro semanas.</small></div>}
      {!selected && !weekdays.length && (
        <label className="field">
          Cantidad de días por semana
          <select
            aria-label="Cantidad de días por semana"
            value={days}
            disabled={busy}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            {Array.from({ length: 6 }, (_, i) => (
              <option key={i} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
        </label>
      )}
      {source && (
        <p className="muted">
          Base: {source.document.name} · 4 semanas ·{" "}
          {source.document.weeks[0].length} días en la primera semana. Podés
          ajustar los días y ejercicios en el editor.
        </p>
      )}
      <p className="notice">
        Primero preparás un borrador.{" "}
        {current?.routine
          ? "La rutina actual sigue activa hasta que guardes y actives la nueva; después quedará en Rutinas anteriores."
          : "Guardalo y luego pulsá Activar rutina para empezar a entrenar."}
      </p>
      {loading && <small role="status">Cargando bases de rutina…</small>}
      {loadError && (
        <p className="error" role="alert">
          {loadError}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <button
          className="button"
          disabled={
            busy ||
            !name.trim() ||
            (hasDraft && !replace) ||
            (!!selected && !source)
          }
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const next = routineForSchedule(source?.document, weekdays, days);
              next.name = name.trim();
              await onApply(next);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Creando…" : "Crear rutina"}
        </button>
        {onCancel && (
          <button
            className="button secondary"
            disabled={busy}
            onClick={onCancel}
          >
            {hasDraft ? "Volver al borrador" : "Volver a la rutina"}
          </button>
        )}
      </div>
    </section>
  );
}
