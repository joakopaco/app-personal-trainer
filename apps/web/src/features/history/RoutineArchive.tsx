import { useEffect, useState } from "react";
import { routineSchema, type RoutineDocument } from "@pulso/domain/routines";
import { cloud } from "../../adapters/supabase";
import { formatRestMinutes } from "../../components/rest-minutes";
import { loadAllPages } from "./history-progress-model";
import "./history.css";

type Period = {
  id: string;
  month: string;
  current_revision_id: string | null;
  continued_from: string | null;
};
type Revision = {
  id: string;
  period_id: string;
  created_at: string;
  document: unknown;
};
const monthLabel = (month: string) =>
  new Date(month + "-01T12:00:00").toLocaleDateString("es-AR", {
    month: "long",
    year: "numeric",
  });

export function ArchivedRoutine({ document }: { document: RoutineDocument }) {
  const [week, setWeek] = useState(0),
    [day, setDay] = useState(0);
  const selectedDay = document.weeks[week]?.[day];
  return (
    <div className="history-routine-document">
      <h3>{document.name}</h3>
      <div
        className="history-segments"
        aria-label="Semanas de la rutina archivada"
      >
        {document.weeks.map((_, index) => (
          <button
            type="button"
            key={index}
            aria-pressed={week === index}
            onClick={() => {
              setWeek(index);
              setDay(0);
            }}
          >
            Semana {index + 1}
          </button>
        ))}
      </div>
      <div
        className="history-segments history-day-selector"
        aria-label="Días de la rutina archivada"
      >
        {document.weeks[week].map((entry, index) => (
          <button
            type="button"
            key={entry.id}
            aria-pressed={day === index}
            onClick={() => setDay(index)}
          >
            {entry.name}
          </button>
        ))}
      </div>
      {selectedDay && (
        <>
          <h4>{selectedDay.name}</h4>
          {selectedDay.blocks.length ? (
            selectedDay.blocks.map((block) => (
              <section className="history-archive-block" key={block.id}>
                <h4>
                  {block.name}{" "}
                  <span>
                    {block.type === "main"
                      ? "Principal"
                      : block.type === "mobility"
                        ? "Movilidad"
                        : "Aproximación"}
                  </span>
                </h4>
                <p className="muted">
                  Pausa macro:{" "}
                  {block.macroRest === null
                    ? "Sin indicar"
                    : formatRestMinutes(block.macroRest) + " min"}{" "}
                  · Entre{" "}
                  {block.macroTarget === "series" ? "series" : "bloques"}
                </p>
                {block.exercises.length ? (
                  <div className="table-scroll">
                    <table className="history-archive-table" role="table">
                      <thead>
                        <tr>
                          <th>Ejercicio</th>
                          <th>Series</th>
                          <th>Carga</th>
                          <th>Reps / tiempo</th>
                          <th>Pausa micro</th>
                        </tr>
                      </thead>
                      <tbody>
                        {block.exercises.map((exercise) => (
                          <tr key={exercise.id} role="row">
                            <td role="cell">
                              <strong>{exercise.name}</strong>
                              <small className="history-exercise-group">
                                {exercise.group}
                                {exercise.warmup ? " · Calentamiento" : ""}
                              </small>
                            </td>
                            <td role="cell">
                              <span
                                className="archive-field-label"
                                aria-hidden="true"
                              >
                                Series
                              </span>
                              {exercise.prescription.sets ?? "—"}
                            </td>
                            <td role="cell">
                              <span
                                className="archive-field-label"
                                aria-hidden="true"
                              >
                                Peso
                              </span>
                              {exercise.type === "load_reps" &&
                              exercise.prescription.weight !== null
                                ? exercise.prescription.weight + " kg"
                                : "—"}
                            </td>
                            <td role="cell">
                              <span
                                className="archive-field-label"
                                aria-hidden="true"
                              >
                                {exercise.type === "time"
                                  ? "Duración"
                                  : "Repeticiones"}
                              </span>
                              {exercise.type === "time"
                                ? exercise.prescription.durationSec === null
                                  ? "—"
                                  : exercise.prescription.durationSec + " s"
                                : exercise.prescription.reps === null
                                  ? "—"
                                  : exercise.prescription.reps + " reps"}
                            </td>
                            <td role="cell">
                              <span
                                className="archive-field-label"
                                aria-hidden="true"
                              >
                                Descanso micro
                              </span>
                              {exercise.prescription.microRest === null
                                ? "—"
                                : formatRestMinutes(
                                    exercise.prescription.microRest,
                                  ) + " min"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p>Este bloque no tenía ejercicios.</p>
                )}
              </section>
            ))
          ) : (
            <p>Este día no tenía bloques.</p>
          )}
        </>
      )}
    </div>
  );
}

export function RoutineArchive({
  studentId,
  currentRevisionId,
  currentPeriodId,
}: {
  studentId: string;
  currentRevisionId?: string;
  currentPeriodId?: string;
}) {
  const [periods, setPeriods] = useState<Period[]>([]),
    [periodId, setPeriodId] = useState("");
  const [revisions, setRevisions] = useState<Revision[]>([]),
    [revisionId, setRevisionId] = useState("");
  const [loading, setLoading] = useState(true),
    [revisionsLoading, setRevisionsLoading] = useState(false),
    [error, setError] = useState(""),
    [revisionError, setRevisionError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setPeriods([]);
    setRevisions([]);
    setPeriodId("");
    void loadAllPages<Period>(
      (start, end) =>
        cloud()
          .from("routine_periods")
          .select("id,month,current_revision_id,continued_from")
          .eq("student_id", studentId)
          .order("month", { ascending: false })
          .order("id")
          .range(start, end),
      100,
      1200,
    )
      .then((result) => {
        if (!active) return;
        if (result.truncated) {
          setError(
            "Hay más de 1.200 períodos. No se pudo cargar el archivo completo.",
          );
          return;
        }
        setPeriods(result.rows);
        setPeriodId(
          result.rows.find((period) => period.id === currentPeriodId)?.id ||
            result.rows[0]?.id ||
            "",
        );
      })
      .catch(() => {
        if (active)
          setError(
            "No se pudo cargar el archivo de rutinas. Verificá tu conexión.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [studentId, currentPeriodId, currentRevisionId, retry]);
  useEffect(() => {
    let active = true;
    setRevisions([]);
    setRevisionId("");
    setRevisionError("");
    if (!periodId) return;
    setRevisionsLoading(true);
    void loadAllPages<Revision>(
      (start, end) =>
        cloud()
          .from("routine_revisions")
          .select("id,period_id,created_at,document")
          .eq("student_id", studentId)
          .eq("period_id", periodId)
          .order("created_at", { ascending: false })
          .order("id")
          .range(start, end),
      100,
      1000,
    )
      .then((result) => {
        if (!active) return;
        if (result.truncated) {
          setRevisionError(
            "Este mes supera las 1.000 versiones. No se pudo cargar el archivo completo.",
          );
          return;
        }
        setRevisions(result.rows);
        const current = periods.find(
          (period) => period.id === periodId,
        )?.current_revision_id;
        setRevisionId(
          result.rows.find((revision) => revision.id === current)?.id ||
            result.rows[0]?.id ||
            "",
        );
      })
      .catch(() => {
        if (active)
          setRevisionError("No se pudieron cargar las versiones de este mes.");
      })
      .finally(() => {
        if (active) setRevisionsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [studentId, periodId, periods, retry]);
  const selected = revisions.find((revision) => revision.id === revisionId),
    parsed = selected ? routineSchema.safeParse(selected.document) : null;
  const selectedPeriod = periods.find((period) => period.id === periodId);
  const activePeriod = periods.find(
    (period) =>
      period.id === currentPeriodId ||
      period.current_revision_id === currentRevisionId,
  );
  return (
    <section
      className="card history-routine-archive blocks"
      aria-label="Archivo mensual de rutinas"
    >
      <p className="eyebrow">HISTORIAL DEL ALUMNO</p>
      <h2>Rutinas anteriores</h2>
      <p>
        Revisá cada mes y sus versiones publicadas. Este archivo es de solo
        lectura.
      </p>
      {activePeriod && (
        <p className="history-current-routine">
          <strong>Rutina activa:</strong> {monthLabel(activePeriod.month)} · Se
          identifica como vigente en el selector de versiones.
        </p>
      )}
      {loading ? (
        <p role="status">Cargando meses…</p>
      ) : error ? (
        <p className="error" role="alert">
          {error}{" "}
          <button
            className="link-button"
            onClick={() => setRetry((value) => value + 1)}
          >
            Reintentar archivo
          </button>
        </p>
      ) : !periods.length ? (
        <p className="history-empty">
          Todavía no hay rutinas publicadas para consultar.
        </p>
      ) : (
        <>
          <div className="history-archive-selectors">
            <label className="field">
              Mes de la rutina
              <select
                value={periodId}
                onChange={(event) => setPeriodId(event.target.value)}
              >
                {periods.map((period) => (
                  <option key={period.id} value={period.id}>
                    {monthLabel(period.month)}
                    {period.id === activePeriod?.id
                      ? " · Activa"
                      : " · Archivo"}
                  </option>
                ))}
              </select>
            </label>
            {revisions.length > 0 && (
              <label className="field">
                Versión publicada
                <select
                  value={revisionId}
                  onChange={(event) => setRevisionId(event.target.value)}
                >
                  {revisions.map((revision, index) => (
                    <option key={revision.id} value={revision.id}>
                      {new Date(revision.created_at).toLocaleString("es-AR")} ·{" "}
                      {revision.id === currentRevisionId
                        ? "Vigente"
                        : revision.id === selectedPeriod?.current_revision_id
                          ? "Última del mes"
                          : "Versión anterior"}{" "}
                      · v{revisions.length - index}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {revisionsLoading ? (
            <p role="status">Cargando versiones…</p>
          ) : revisionError ? (
            <p className="error" role="alert">
              {revisionError}{" "}
              <button
                className="link-button"
                onClick={() => setRetry((value) => value + 1)}
              >
                Reintentar versiones
              </button>
            </p>
          ) : parsed?.success ? (
            <>
              <p className="history-readonly">
                {selected?.id === currentRevisionId
                  ? "VERSIÓN VIGENTE"
                  : "VERSIÓN ARCHIVADA"}{" "}
                · Solo lectura · Publicada el{" "}
                {new Date(selected!.created_at).toLocaleString("es-AR")}
              </p>
              <ArchivedRoutine key={selected!.id} document={parsed.data} />
            </>
          ) : selected ? (
            <p role="alert" className="error">
              Esta versión tiene un formato que no se puede mostrar. El
              documento original permanece conservado.
            </p>
          ) : (
            <p>Este mes todavía no tiene versiones publicadas.</p>
          )}
        </>
      )}
    </section>
  );
}
