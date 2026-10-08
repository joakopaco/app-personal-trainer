import { LoadingState } from "../../components/LoadingState";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { type RoutineDocument } from "@pulso/domain/routines";
import { cloud } from "../../adapters/supabase";
import { formatRestDuration } from "../../components/rest-minutes";
import { loadAllPages } from "./history-progress-model";
import "./history.css";
import { ExportRoutine } from "../routines/ExportRoutine";

import {
  routineTimeline,
  routineDate,
  type RoutineEntry,
  type RoutineRevision,
} from "./routine-history-model";

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
                    : formatRestDuration(block.macroRest)}{" "}
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
                                : formatRestDuration(
                                    exercise.prescription.microRest,
                                  )}
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
  studentName,
}: {
  studentId: string;
  currentRevisionId?: string;
  studentName?: string;
}) {
  const [entries, setEntries] = useState<RoutineEntry[]>([]);
  const [selected, setSelected] = useState<RoutineEntry | null>(null);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setEntries([]);
    setSelected(null);
    void loadAllPages<RoutineRevision>(
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
    )
      .then((result) => {
        if (!active) return;
        if (result.truncated)
          throw Error("El archivo supera el límite de consulta.");
        setEntries(routineTimeline(result.rows, currentRevisionId));
      })
      .catch(() => {
        if (active)
          setError(
            "No se pudieron cargar las rutinas anteriores. Reintentá para consultar el archivo completo.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [studentId, currentRevisionId, retry]);
  const previous = entries.filter((entry) => !entry.current).reverse();
  const current = entries.find((entry) => entry.current);
  return (
    <section
      className="card history-routine-archive"
      aria-label="Rutinas anteriores"
    >
      <h2>Rutinas anteriores</h2>
      <p className="muted">
        Cada rutina con sus fechas de inicio y fin. Los ajustes durante el
        entrenamiento se conservan en Historial.
      </p>
      {current && (
        <p className="routine-current-since">
          Rutina actual en curso desde el {routineDate(current.start)}.
        </p>
      )}
      {loading ? (
        <LoadingState label="Cargando rutinas…" />
      ) : error ? (
        <div className="stack">
          <p className="error" role="alert">
            {error}
          </p>
          <button
            className="button secondary"
            onClick={() => setRetry((value) => value + 1)}
          >
            Reintentar
          </button>
        </div>
      ) : previous.length ? (
        <div className="student-archive-list">
          {previous.map((entry) => (
            <article key={entry.id}>
              <div>
                <h3>{entry.document.name}</h3>
                <p className="muted">
                  Inicio: {routineDate(entry.start)} · Fin:{" "}
                  {entry.end ? routineDate(entry.end) : "Sin fecha registrada"}
                </p>
              </div>
              <div className="row">
                <Link
                  className="button secondary"
                  to={`/alumnos/${studentId}/borradores/editar?nueva=1&base=archive:${entry.id}`}
                >
                  Usar como base
                </Link>
                <button
                  className="button secondary"
                  onClick={() => setSelected(entry)}
                  aria-label={`Ver rutina ${entry.document.name}`}
                >
                  Ver rutina
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="history-empty">
          Todavía no hay rutinas anteriores. Aparecerán acá cuando actives una
          rutina diferente.
        </p>
      )}
      {selected && (
        <div className="modal-backdrop">
          <section
            className="card modal routine-archive-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Rutina anterior: ${selected.document.name}`}
          >
            <div className="row spread">
              <div>
                <p className="eyebrow">RUTINA ANTERIOR · SOLO LECTURA</p>
                <p>
                  Inicio: {routineDate(selected.start)} · Fin:{" "}
                  {selected.end
                    ? routineDate(selected.end)
                    : "Sin fecha registrada"}
                </p>
              </div>
              <button
                className="button secondary"
                onClick={() => setSelected(null)}
              >
                Cerrar
              </button>
            </div>
            <ArchivedRoutine key={selected.id} document={selected.document} />
            <footer className="student-routine-actions">
              {studentName && (
                <ExportRoutine
                  document={selected.document}
                  student={studentName}
                  month={`Inicio: ${routineDate(selected.start)} · Fin: ${selected.end ? routineDate(selected.end) : "Sin fecha registrada"}`}
                />
              )}
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}
