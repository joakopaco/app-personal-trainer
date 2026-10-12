import { LoadingState } from "../../components/LoadingState";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
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
            Día {index + 1}
          </button>
        ))}
      </div>
      {selectedDay && (
        <>
          <h4>Día {day + 1}</h4>
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
                              {exercise.prescription.progression &&
                              exercise.type === "load_reps" ? (
                                <div className="version-series-values">
                                  {exercise.prescription.progression.map(
                                    (set, index) => (
                                      <span key={index}>
                                        Serie {index + 1}: {set.weight ?? "—"}{" "}
                                        kg
                                      </span>
                                    ),
                                  )}
                                </div>
                              ) : exercise.type === "load_reps" &&
                                exercise.prescription.weight !== null ? (
                                exercise.prescription.weight + " kg"
                              ) : (
                                "—"
                              )}
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
                              {exercise.prescription.progression ? (
                                <div className="version-series-values">
                                  {exercise.prescription.progression.map(
                                    (set, index) => (
                                      <span key={index}>
                                        Serie {index + 1}: {set.reps ?? "—"}{" "}
                                        reps
                                      </span>
                                    ),
                                  )}
                                </div>
                              ) : exercise.type === "time" ? (
                                exercise.prescription.durationSec === null ? (
                                  "—"
                                ) : (
                                  exercise.prescription.durationSec + " s"
                                )
                              ) : exercise.prescription.reps === null ? (
                                "—"
                              ) : (
                                exercise.prescription.reps + " reps"
                              )}
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
  mode = "archive",
}: {
  studentId: string;
  currentRevisionId?: string;
  studentName?: string;
  mode?: "archive" | "versions";
}) {
  const [entries, setEntries] = useState<RoutineEntry[]>([]);
  const [selected, setSelected] = useState<RoutineEntry | null>(null);
  const [versionIndex, setVersionIndex] = useState(0);
  function open(entry: RoutineEntry) {
    setVersionIndex(entry.versions.length - 1);
    setSelected(entry);
  }
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
          .select(
            "id,created_at,document,previous_revision_id,source_session_id",
          )
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
  const previous = entries
    .filter((entry) => mode === "versions" || !entry.current)
    .reverse();
  const current = entries.find((entry) => entry.current);
  const version = selected?.versions[versionIndex];
  const title =
    mode === "versions" ? "Versiones de rutinas" : "Rutinas anteriores";
  return (
    <section
      className="card history-routine-archive"
      aria-label={title}
      id={mode === "versions" ? "versiones" : undefined}
    >
      <h2>{title}</h2>
      <p className="muted">
        {mode === "versions"
          ? "Cada rutina reúne sus versiones. Al finalizar un entrenamiento con cambios, podés consultar cómo estaba antes y cómo quedó."
          : "Cada rutina con sus fechas de inicio y fin. Los ajustes del entrenamiento se guardan como versiones de esa misma rutina."}
      </p>
      {current && (
        <p className="routine-current-since">
          Rutina actual en curso desde el {routineDate(current.start)}.
          {mode === "archive" && (
            <>
              {" "}
              <Link to={`/historial/${studentId}#versiones`}>
                Ver versiones
              </Link>
            </>
          )}
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
                  {entry.current
                    ? "En curso"
                    : entry.end
                      ? routineDate(entry.end)
                      : "Sin fecha registrada"}
                </p>
                {mode === "versions" && (
                  <p className="muted">
                    {entry.versions.length}{" "}
                    {entry.versions.length === 1 ? "versión" : "versiones"}
                  </p>
                )}
              </div>
              <div className="row">
                {mode === "archive" && (
                  <Link
                    className="button secondary"
                    to={`/alumnos/${studentId}/borradores/editar?nueva=1&base=archive:${entry.id}`}
                  >
                    Usar como base
                  </Link>
                )}
                <button
                  className="button secondary"
                  onClick={() => open(entry)}
                  aria-label={`${mode === "versions" ? "Ver versiones de" : "Ver rutina"} ${entry.document.name}`}
                >
                  {mode === "versions" ? "Ver versiones" : "Ver rutina"}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="history-empty">
          {mode === "versions"
            ? "Todavía no hay una rutina con versiones guardadas."
            : "Todavía no hay rutinas anteriores. Aparecerán acá cuando actives una rutina diferente."}
        </p>
      )}
      {selected && version && (
        <div className="modal-backdrop">
          <section
            className="card modal routine-archive-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`${mode === "versions" ? "Versiones de" : "Rutina anterior:"} ${selected.document.name}`}
          >
            <div className="row spread">
              <div>
                <p className="eyebrow">VERSIONES DE LA RUTINA · SOLO LECTURA</p>
                <p>
                  Inicio: {routineDate(selected.start)} · Fin:{" "}
                  {selected.current
                    ? "En curso"
                    : selected.end
                      ? routineDate(selected.end)
                      : "Sin fecha registrada"}
                </p>
              </div>
              <button
                className="button secondary routine-version-icon"
                onClick={() => setSelected(null)}
                aria-label="Cerrar"
                data-dialog-close
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            <div className="routine-version-controls">
              <button
                className="button secondary routine-version-icon"
                aria-label="Versión anterior"
                disabled={versionIndex === 0}
                onClick={() => setVersionIndex((n) => n - 1)}
              >
                <ChevronLeft size={20} aria-hidden="true" />
              </button>
              <label className="field">
                Versión de la rutina
                <select
                  aria-label="Versión de la rutina"
                  value={versionIndex}
                  onChange={(event) =>
                    setVersionIndex(Number(event.target.value))
                  }
                >
                  {selected.versions.map((entry, index) => (
                    <option key={entry.id} value={index}>
                      Versión {index + 1}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="button secondary routine-version-icon"
                aria-label="Versión siguiente"
                disabled={versionIndex === selected.versions.length - 1}
                onClick={() => setVersionIndex((n) => n + 1)}
              >
                <ChevronRight size={20} aria-hidden="true" />
              </button>
            </div>
            <p className="muted routine-version-note">
              {version.sourceSessionId
                ? "Actualizada al finalizar el entrenamiento"
                : versionIndex === 0
                  ? "Versión inicial"
                  : "Rutina actualizada"}{" "}
              · {new Date(version.createdAt).toLocaleString("es-AR")}
            </p>
            <ArchivedRoutine key={version.id} document={version.document} />
            <footer className="student-routine-actions">
              {studentName && (
                <ExportRoutine
                  document={version.document}
                  student={studentName}
                  month={`Versión ${versionIndex + 1} · ${routineDate(version.createdAt)}`}
                />
              )}
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}
