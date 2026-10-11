import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Play,
  Plus,
  Timer,
} from "lucide-react";
import { formatRestDuration } from "../../components/rest-minutes";
import { ExerciseArt } from "../catalog/ExerciseLibrary";
import { useDraftNavigation } from "../routines/use-draft-navigation";
import {
  initialTrainingResults,
  recoverTrainingDraft,
  trainingSetError,
  type TrainingRequest,
} from "./training-state";
import "./member-training.css";
import { cloud } from "../../adapters/supabase";
import { RestClock } from "../live/RestTimer";
import {
  command,
  gymError,
  rows,
  useResource,
  type GymSession,
  type GymRevision,
  type GymResult,
} from "./api";
import { useGym } from "./GymContext";
import { Empty, LoadState, Modal, PageHeading } from "./ui";

function exerciseCount(count: number) {
  return `${count} ${count === 1 ? "ejercicio" : "ejercicios"}`;
}

export function MemberHome() {
  const { access } = useGym(),
    navigate = useNavigate();
  const data = useResource(async () => {
    const [open, routine] = await Promise.all([
      rows<GymSession[]>(
        cloud()
          .from("gym_sessions")
          .select("*")
          .eq("status", "open")
          .eq("member_id", access.userId),
      ),
      access.selectedRevisionId
        ? rows<GymRevision>(
            cloud()
              .from("gym_routine_revisions")
              .select("*")
              .eq("id", access.selectedRevisionId)
              .single(),
          )
        : Promise.resolve(null),
    ]);
    return { open: open[0], routine };
  }, access.userId + access.selectedRevisionId);
  const [week, setWeek] = useState(0),
    [day, setDay] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    setWeek(0);
    setDay(0);
  }, [access.selectedRevisionId]);
  return (
    <>
      <PageHeading
        eyebrow={access.gymName}
        title="Entrená a tu ritmo"
        description={`Hola, ${access.name}. Cada avance cuenta.`}
      />
      <LoadState {...data} retry={data.reload} />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {data.value?.open ? (
        <section className="card stack gym-current-session">
          <span className="badge">En curso</span>
          <h2>{data.value.open.routine_name}</h2>
          <p>
            Semana {data.value.open.week + 1} · {data.value.open.day.name}
          </p>
          <Link
            className="button"
            to={"/mi-entrenamiento/sesion/" + data.value.open.id}
          >
            Continuar entrenamiento <ArrowRight size={18} />
          </Link>
        </section>
      ) : data.value?.routine ? (
        <section className="card stack gym-start gym-member-start">
          <div className="gym-heading-row">
            <div>
              <p className="eyebrow">TU RUTINA ELEGIDA</p>
              <h2>{data.value.routine.document.name}</h2>
            </div>
            <Link className="button secondary" to="/mi-entrenamiento/rutinas">
              Cambiar rutina
            </Link>
          </div>
          <fieldset>
            <legend>Semana</legend>
            <div className="gym-week-picker">
              {[0, 1, 2, 3].map((w) => (
                <button
                  className={"button " + (week === w ? "" : "secondary")}
                  key={w}
                  aria-pressed={week === w}
                  aria-label={`Semana ${w + 1}`}
                  onClick={() => {
                    setWeek(w);
                    setDay(0);
                  }}
                >
                  {w + 1}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Día de rutina</legend>
            <div className="gym-day-picker">
              {data.value.routine.document.weeks[week].map((d, i) => (
                <button
                  key={d.id}
                  className={"button " + (day === i ? "" : "secondary")}
                  aria-pressed={day === i}
                  onClick={() => setDay(i)}
                >
                  <strong>Día {i + 1}</strong>
                  <small>
                    {exerciseCount(
                      d.blocks.reduce(
                        (total, block) => total + block.exercises.length,
                        0,
                      ),
                    )}
                  </small>
                </button>
              ))}
            </div>
          </fieldset>
          <p className="muted">
            {exerciseCount(
              data.value.routine.document.weeks[week][day]?.blocks.reduce(
                (n, b) => n + b.exercises.length,
                0,
              ) ?? 0,
            )}{" "}
            para hoy
          </p>
          <div className="gym-day-preview">
            {data.value.routine.document.weeks[week][day]?.blocks.map(
              (block) => (
                <div key={block.id}>
                  <strong>{block.name}</strong>
                  <p className="muted">
                    {block.exercises
                      .map((exercise) => exercise.name)
                      .join(" · ")}
                  </p>
                </div>
              ),
            )}
          </div>
          <button
            className="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const s = await command("start_session", { week, day });
                navigate("/mi-entrenamiento/sesion/" + s.id);
              } catch (e) {
                setError(gymError(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <Play size={18} />
            {busy ? "Preparando…" : "Empezar entrenamiento"}
          </button>
        </section>
      ) : (
        data.value && (
          <Empty title="Elegí tu primera rutina">
            <p>
              Explorá el catálogo de tu gimnasio, las rutinas personalizadas o
              creá la tuya.
            </p>
            <Link className="button" to="/mi-entrenamiento/rutinas">
              Explorar rutinas <ArrowRight size={18} />
            </Link>
          </Empty>
        )
      )}
    </>
  );
}
export function MemberTraining() {
  const { id = "" } = useParams(),
    { access } = useGym();
  const data = useResource(
    () =>
      rows<GymSession>(
        cloud()
          .from("gym_sessions")
          .select("*")
          .eq("id", id)
          .eq("member_id", access.userId)
          .single(),
      ),
    access.userId + id,
  );
  return (
    <>
      <LoadState {...data} retry={data.reload} />
      {data.value && (
        <GymTrainingSession
          key={access.userId + data.value.id}
          initial={data.value}
        />
      )}
    </>
  );
}
type RestPreset = { seconds: number; label: string; token: number };

export function GymTrainingSession({ initial }: { initial: GymSession }) {
  const { access } = useGym(),
    navigate = useNavigate();
  const storageKey = "pulso-gym-session:" + access.userId + ":" + initial.id;
  const [recovered] = useState(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return {
        ...recoverTrainingDraft(raw, initial),
        raw,
        storageError: "",
      };
    } catch {
      return {
        ...recoverTrainingDraft(null, initial),
        raw: null,
        storageError:
          "No se pudo acceder al almacenamiento local. Guardá antes de salir.",
      };
    }
  });
  const [results, setResults] = useState(recovered.results),
    [revision, setRevision] = useState(recovered.revision),
    [dirty, setDirty] = useState(recovered.dirty),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(recovered.error),
    [storageError, setStorageError] = useState(recovered.storageError),
    [confirm, setConfirm] = useState(false),
    [resolve, setResolve] = useState(false),
    [conflict, setConflict] = useState(recovered.conflict),
    [pending, setPending] = useState<TrainingRequest | null>(recovered.pending),
    [restPreset, setRestPreset] = useState<RestPreset | null>(null);
  const resultsRef = useRef(results),
    requestLock = useRef(false);
  const { guard, allowNavigation } = useDraftNavigation(
    (dirty || !!pending) && (!!storageError || busy || conflict),
    () =>
      setError(
        "Guardá el entrenamiento antes de salir: hay cambios que todavía no están protegidos.",
      ),
  );
  const routine = useResource(
    () =>
      rows<GymRevision>(
        cloud()
          .from("gym_routine_revisions")
          .select("*")
          .eq("id", initial.routine_revision_id)
          .single(),
      ),
    initial.routine_revision_id,
  );
  const dayIndex =
    routine.value?.document.weeks[initial.week]?.findIndex(
      (day) => day.id === initial.day.id,
    ) ?? -1;
  const dayLabel = dayIndex >= 0 ? `Día ${dayIndex + 1}` : initial.day.name;

  useEffect(() => {
    if (initial.status === "finished") {
      allowNavigation();
      navigate("/mi-entrenamiento", { replace: true });
    }
  }, [initial.status, navigate]);
  useEffect(() => {
    const changedElsewhere = (event: StorageEvent) => {
      if (
        event.storageArea !== localStorage ||
        (event.key !== storageKey && event.key !== null)
      )
        return;
      setConflict(true);
      setConfirm(false);
      setError(
        "Este entrenamiento cambió en otra pestaña. Revisá ambas versiones antes de continuar.",
      );
    };
    window.addEventListener("storage", changedElsewhere);
    return () => window.removeEventListener("storage", changedElsewhere);
  }, [storageKey]);

  function persist(
    next: GymResult[],
    version = revision,
    request: TrainingRequest | null = pending,
  ) {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ results: next, revision: version, pending: request }),
      );
      setStorageError("");
    } catch {
      setStorageError(
        "No se pudo conservar en este dispositivo. Guardá el entrenamiento antes de salir.",
      );
    }
  }
  function clearDraft(operationId?: string) {
    try {
      if (operationId) {
        const raw = localStorage.getItem(storageKey);
        if (raw && JSON.parse(raw).pending?.operationId !== operationId) {
          setConflict(true);
          setError(
            "El guardado se completó, pero otra pestaña tiene cambios locales. Revisá las versiones antes de continuar.",
          );
          return;
        }
      }
      localStorage.removeItem(storageKey);
      setStorageError("");
    } catch {
      setStorageError(
        "El entrenamiento está guardado; no se pudo limpiar la copia local de este dispositivo.",
      );
    }
  }
  function change(fn: (copy: GymResult[]) => void) {
    if (requestLock.current || pending || conflict) return;
    const next = structuredClone(resultsRef.current);
    fn(next);
    resultsRef.current = next;
    setResults(next);
    setDirty(true);
    setError("");
    persist(next);
  }
  async function save(finish = false) {
    if (requestLock.current || conflict) return;
    if (!pending) {
      for (const item of resultsRef.current) {
        const exercise = initial.day.blocks
          .flatMap((block) => block.exercises)
          .find((exercise) => exercise.id === item.positionId)!;
        for (const [index, set] of item.sets.entries()) {
          const problem = trainingSetError(set, exercise.type);
          if (problem) {
            setError(`${exercise.name}, serie ${index + 1}: ${problem}`);
            return;
          }
        }
      }
    }
    requestLock.current = true;
    setBusy(true);
    setError("");
    const request = pending || {
      operationId: crypto.randomUUID(),
      kind: finish ? ("finish_session" as const) : ("save_session" as const),
      payload: {
        id: initial.id,
        expectedRevision: revision,
        results: structuredClone(resultsRef.current),
      },
    };
    setPending(request);
    persist(resultsRef.current, revision, request);
    try {
      const saved = await command(
        request.kind,
        request.payload,
        request.operationId,
      );
      setRevision(saved.revision);
      setDirty(false);
      setPending(null);
      // Local cleanup failure must never turn a successful remote write into a retry.
      clearDraft(request.operationId);
      if (request.kind === "finish_session") {
        allowNavigation();
        navigate("/mi-entrenamiento");
      } else setConfirm(false);
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "22023" || code === "42501") {
        setPending(null);
        persist(resultsRef.current, revision, null);
      }
      if (code === "40001") {
        setConflict(true);
        setConfirm(false);
      }
      setError(gymError(e));
    } finally {
      requestLock.current = false;
      setBusy(false);
    }
  }
  function startRest(seconds: number | null, label: string) {
    if (seconds === null || seconds <= 0) return;
    setRestPreset({ seconds, label, token: Date.now() });
  }
  const disabled = busy || !!pending || conflict;
  const total = results
    .filter((item) => !item.skipped)
    .reduce((count, item) => count + item.sets.length, 0);
  const completed = results
    .filter((item) => !item.skipped)
    .reduce(
      (count, item) => count + item.sets.filter((set) => set.confirmed).length,
      0,
    );
  const omitted = results.filter((item) => item.skipped).length;
  return (
    <div className="gym-training gym-member-training">
      {guard}
      <header className="gym-training-header">
        <Link
          className="button secondary icon-button"
          aria-label="Volver a entrenar"
          to="/mi-entrenamiento"
        >
          <ArrowLeft size={22} />
        </Link>
        <strong>{access.name}</strong>
      </header>
      <div className="gym-training-intro">
        <p className="eyebrow">
          SEMANA {initial.week + 1} · {dayLabel}
        </p>
        <h1>{initial.routine_name}</h1>
        <div className="gym-session-status">
          <span className="badge" role="status">
            {busy
              ? "Guardando…"
              : conflict
                ? "Revisar versiones"
                : pending
                  ? "Guardado pendiente"
                  : dirty
                    ? "Cambios sin guardar"
                    : "Guardado"}
          </span>
          <span>
            {completed}/{total} series · {omitted} omitidos
          </span>
        </div>
        <progress
          className="gym-session-progress"
          value={completed}
          max={Math.max(total, 1)}
          aria-label="Series completadas"
        />
      </div>
      {error && !confirm && !resolve && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {storageError && (
        <p role="alert" className="notice">
          {storageError}
        </p>
      )}
      {conflict && (
        <div className="notice stack">
          <p>
            Tu edición local se conserva. Podés descargarla antes de cargar la
            versión guardada.
          </p>
          <button className="button secondary" onClick={() => setResolve(true)}>
            Revisar versión guardada
          </button>
        </div>
      )}
      <GymRestTimer
        storageKey={"pulso-gym-timer:" + access.userId + ":" + initial.id}
        preset={restPreset}
      />
      {initial.day.blocks.map((block) => (
        <section className="gym-training-block stack" key={block.id}>
          <div className="gym-heading-row">
            <h2>{block.name}</h2>
            <small className="muted">
              {exerciseCount(block.exercises.length)}
            </small>
          </div>
          <div className="gym-block-rest">
            <span>
              Descanso del bloque{" "}
              <strong>{formatRestDuration(block.macroRest)}</strong>
            </span>
            {!!block.macroRest && (
              <button
                className="button secondary"
                onClick={() =>
                  startRest(block.macroRest, `Bloque · ${block.name}`)
                }
                aria-label={`Iniciar descanso del bloque ${block.name}`}
              >
                <Timer size={18} />
                Descansar
              </button>
            )}
          </div>
          {block.exercises.map((exercise) => {
            const index = results.findIndex(
                (result) => result.positionId === exercise.id,
              ),
              item = results[index];
            const withWeight = exercise.type === "load_reps";
            const fields = withWeight
              ? (["weight", "reps"] as const)
              : exercise.type === "time"
                ? (["durationSec"] as const)
                : (["reps"] as const);
            return (
              <article
                className={
                  "card stack gym-member-exercise" +
                  (item.skipped ? " is-skipped" : "")
                }
                key={exercise.id}
              >
                <div className="gym-heading-row">
                  <div>
                    <p className="eyebrow">
                      {exercise.group}
                      {exercise.warmup ? " · Calentamiento" : ""}
                    </p>
                    <h2>{exercise.name}</h2>
                  </div>
                  <label className="gym-check">
                    <input
                      type="checkbox"
                      checked={item.skipped}
                      disabled={disabled}
                      onChange={(event) =>
                        change((copy) => {
                          copy[index].skipped = event.target.checked;
                        })
                      }
                    />
                    No se realizó
                  </label>
                </div>
                {exercise.prescription.progression && (
                  <p className="gym-progression-note">
                    Progresión · cada serie tiene su objetivo
                  </p>
                )}
                <div className="gym-exercise-tools">
                  <span>
                    Entre series{" "}
                    <strong>
                      {formatRestDuration(exercise.prescription.microRest)}
                    </strong>
                  </span>
                  {!!exercise.prescription.microRest && (
                    <button
                      className="button secondary"
                      disabled={item.skipped}
                      aria-label={`Iniciar descanso entre series de ${exercise.name}`}
                      onClick={() =>
                        startRest(
                          exercise.prescription.microRest,
                          `Entre series · ${exercise.name}`,
                        )
                      }
                    >
                      <Timer size={18} />
                      Descansar
                    </button>
                  )}
                  <small>
                    {item.sets.filter((set) => set.confirmed).length}/
                    {item.sets.length} series
                  </small>
                </div>
                <fieldset disabled={disabled || item.skipped} className="stack">
                  <legend className="gym-training-sr">
                    Series de {exercise.name}
                  </legend>
                  <div
                    className={
                      "gym-member-set-heading" +
                      (!withWeight ? " is-single" : "")
                    }
                    aria-hidden="true"
                  >
                    <span>Serie</span>
                    {withWeight && <span>Kg</span>}
                    <span>
                      {exercise.type === "time" ? "Segundos" : "Reps"}
                    </span>
                    <span>Hecha</span>
                  </div>
                  {item.sets.map((set, n) => (
                    <div
                      key={n}
                      className={
                        "gym-member-set" +
                        (!withWeight ? " is-single" : "") +
                        (set.confirmed ? " is-confirmed" : "")
                      }
                    >
                      <strong className="gym-member-set-number">{n + 1}</strong>
                      {fields.map((field) => (
                        <label className="gym-member-set-field" key={field}>
                          <span className="gym-training-sr">
                            {field === "weight"
                              ? "Peso · kg"
                              : field === "reps"
                                ? "Repeticiones"
                                : "Tiempo · s"}
                          </span>
                          <input
                            type="number"
                            inputMode={
                              field === "weight" ? "decimal" : "numeric"
                            }
                            min={field === "weight" ? 0 : 1}
                            max={
                              field === "weight"
                                ? 1000
                                : field === "reps"
                                  ? 500
                                  : 86400
                            }
                            step={field === "weight" ? "0.01" : "1"}
                            value={set[field] ?? ""}
                            disabled={set.confirmed}
                            aria-label={`${field === "weight" ? "Peso" : field === "reps" ? "Repeticiones" : "Tiempo"} serie ${n + 1} de ${exercise.name}`}
                            onChange={(event) =>
                              change((copy) => {
                                copy[index].sets[n][field] =
                                  event.target.value === ""
                                    ? null
                                    : Number(event.target.value);
                              })
                            }
                          />
                          {exercise.type === "time" &&
                            set.durationSec !== null && (
                              <small>
                                {formatRestDuration(set.durationSec)}
                              </small>
                            )}
                        </label>
                      ))}
                      <label
                        className="gym-member-confirm"
                        title={
                          set.confirmed ? "Serie registrada" : "Confirmar serie"
                        }
                      >
                        <input
                          type="checkbox"
                          checked={set.confirmed}
                          disabled={set.confirmed}
                          aria-label={`Confirmar serie ${n + 1} de ${exercise.name}`}
                          onChange={() => {
                            const problem = trainingSetError(
                              set,
                              exercise.type,
                              true,
                            );
                            if (problem) {
                              setError(
                                `${exercise.name}, serie ${n + 1}: ${problem}`,
                              );
                              return;
                            }
                            change((copy) => {
                              copy[index].sets[n].confirmed = true;
                            });
                          }}
                        />
                        <Check size={22} aria-hidden="true" />
                        <span className="gym-training-sr">Hecha</span>
                      </label>
                      {set.confirmed && (
                        <button
                          className="gym-member-correct"
                          aria-label={`Corregir serie ${n + 1} de ${exercise.name}`}
                          onClick={() =>
                            change((copy) => {
                              copy[index].sets[n].confirmed = false;
                            })
                          }
                        >
                          Corregir serie
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    className="button secondary gym-member-add"
                    disabled={item.sets.length >= 50}
                    onClick={() =>
                      change((copy) => {
                        const last = copy[index].sets.at(-1)!;
                        copy[index].sets.push({
                          weight: last.weight,
                          reps: last.reps,
                          durationSec: last.durationSec,
                          confirmed: false,
                        });
                      })
                    }
                  >
                    <Plus size={18} />
                    Agregar serie
                  </button>
                </fieldset>
                <details className="gym-exercise-guide">
                  <summary>
                    Referencia del ejercicio
                    <ChevronDown size={18} aria-hidden="true" />
                  </summary>
                  <ExerciseArt exerciseId={exercise.exerciseId} />
                </details>
              </article>
            );
          })}
        </section>
      ))}
      <footer className="gym-training-actions">
        <button
          className="button secondary"
          disabled={busy || conflict || (!dirty && !pending)}
          onClick={() => save()}
        >
          {busy ? "Guardando…" : "Guardar entrenamiento"}
        </button>
        <button
          className="button"
          disabled={busy || conflict || !!pending}
          onClick={() => setConfirm(true)}
        >
          Finalizar entrenamiento
        </button>
      </footer>
      {pending && !busy && !conflict && (
        <p className="notice">
          {storageError
            ? "Tu registro sigue abierto en esta pantalla."
            : "Tu registro sigue guardado en este dispositivo."}{" "}
          Pulsá Guardar entrenamiento para reintentar
          {pending.kind === "finish_session" ? " la finalización" : ""}.
        </p>
      )}
      {resolve && (
        <Modal
          title="Recuperar entrenamiento"
          close={() => {
            if (!busy) setResolve(false);
          }}
        >
          <p>
            Se descartará la edición local y se cargarán las series guardadas
            más recientes. Los cambios del otro dispositivo se conservan.
          </p>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button
            className="button secondary"
            onClick={() => {
              // Export the displayed local values, even if another tab overwrote storage.
              let value = JSON.stringify({
                results: resultsRef.current,
                revision,
                pending,
              });
              if (
                recovered.error.startsWith("No se pudo leer") &&
                recovered.raw
              )
                value = recovered.raw;
              const url = URL.createObjectURL(
                new Blob([value], { type: "application/json" }),
              );
              const anchor = document.createElement("a");
              anchor.href = url;
              anchor.download = "entrenamiento-edicion-local.json";
              anchor.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            Descargar edición local
          </button>
          <button
            className="button"
            disabled={busy}
            onClick={async () => {
              if (requestLock.current) return;
              requestLock.current = true;
              setBusy(true);
              setError("");
              try {
                const latest = await rows<GymSession>(
                  cloud()
                    .from("gym_sessions")
                    .select("*")
                    .eq("id", initial.id)
                    .eq("member_id", access.userId)
                    .single(),
                );
                clearDraft();
                if (latest.status === "finished") {
                  allowNavigation();
                  navigate("/mi-entrenamiento");
                  return;
                }
                const next = initialTrainingResults(latest);
                resultsRef.current = next;
                setResults(next);
                setRevision(latest.revision);
                setDirty(false);
                setPending(null);
                setConflict(false);
                setResolve(false);
              } catch (e) {
                setError(gymError(e));
              } finally {
                requestLock.current = false;
                setBusy(false);
              }
            }}
          >
            Usar versión guardada
          </button>
        </Modal>
      )}
      {confirm && (
        <Modal
          title="Finalizar entrenamiento"
          close={() => {
            if (!busy) setConfirm(false);
          }}
        >
          <p>
            {completed} series confirmadas · {total - completed} pendientes ·{" "}
            {omitted} ejercicios omitidos.
          </p>
          <p>
            Se guardará tu registro tal como está. Las series pendientes no
            cuentan como realizadas. Podrás consultar tus resultados en
            Progreso.
          </p>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <div className="gym-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setConfirm(false)}
            >
              Seguir entrenando
            </button>
            <button
              className="button"
              disabled={busy}
              onClick={() => save(true)}
            >
              Confirmar finalización
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function GymRestTimer({
  storageKey,
  preset,
}: {
  storageKey: string;
  preset: RestPreset | null;
}) {
  return (
    <GymRestClock
      key={preset?.token ?? "initial"}
      storageKey={storageKey}
      preset={preset}
    />
  );
}
function GymRestClock({
  storageKey,
  preset,
}: {
  storageKey: string;
  preset: RestPreset | null;
}) {
  const [storage] = useState(() => {
    let value: unknown = preset
      ? { end: Date.now() + preset.seconds * 1000, paused: null, started: true }
      : undefined;
    return {
      get: async () => {
        if (value !== undefined) {
          try {
            localStorage.setItem(storageKey, JSON.stringify(value));
          } catch {
            /* Clock remains usable; put reports persistence failures on the next action. */
          }
          return { value };
        }
        const raw = localStorage.getItem(storageKey);
        return raw ? { value: JSON.parse(raw) } : undefined;
      },
      put: async (entry: { key: string; value: unknown }) => {
        value = entry.value;
        localStorage.setItem(storageKey, JSON.stringify(value));
      },
    };
  });
  return (
    <div className="gym-member-clock">
      {preset && (
        <p className="muted" role="status">
          {preset.label} · {formatRestDuration(preset.seconds)}
        </p>
      )}
      <RestClock session={{ id: storageKey }} storage={storage} />
    </div>
  );
}
