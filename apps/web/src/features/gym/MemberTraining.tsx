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
import { parseNumber } from "@pulso/domain/numbers";
import { ExerciseArt } from "../catalog/ExerciseLibrary";
import { useDraftNavigation } from "../routines/use-draft-navigation";
import {
  initialTrainingResults,
  recoverTrainingDraft,
  trainingSetError,
  trainingInputKey,
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
type RestPreset = {
  seconds: number;
  label: string;
  token: number;
  target: string;
};
type SetIssue = { positionId: string; index: number; message: string };

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
    [rawValues, setRawValues] = useState(recovered.rawValues),
    [revision, setRevision] = useState(recovered.revision),
    [dirty, setDirty] = useState(recovered.dirty),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(recovered.error),
    [storageError, setStorageError] = useState(recovered.storageError),
    [confirm, setConfirm] = useState(false),
    [resolve, setResolve] = useState(false),
    [conflict, setConflict] = useState(recovered.conflict),
    [pending, setPending] = useState<TrainingRequest | null>(recovered.pending),
    [restPreset, setRestPreset] = useState<RestPreset | null>(null),
    [setIssue, setSetIssue] = useState<SetIssue | null>(null);
  const invalidRow = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!setIssue) return;
    // Let the dialog restore focus before revealing a rejected finalization's row.
    const frame = requestAnimationFrame(() =>
      invalidRow.current?.scrollIntoView?.({ block: "center" }),
    );
    return () => cancelAnimationFrame(frame);
  }, [setIssue]);
  const resultsRef = useRef(results),
    rawValuesRef = useRef(rawValues),
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
        JSON.stringify({
          results: next,
          rawValues: rawValuesRef.current,
          revision: version,
          pending: request,
        }),
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
    setSetIssue(null);
    persist(next);
  }
  function setProblem(
    item: GymResult,
    index: number,
    type: string,
    required = item.sets[index].confirmed,
  ) {
    for (const field of ["weight", "reps", "durationSec"] as const) {
      const raw =
        rawValuesRef.current[trainingInputKey(item.positionId, index, field)];
      if (raw !== undefined && raw !== "" && !parseNumber(field, raw).ok) {
        return `Revisá ${field === "weight" ? "el peso (kg, hasta 2 decimales)" : field === "reps" ? "las repeticiones (número entero)" : "el tiempo (segundos enteros)"}.`;
      }
    }
    return trainingSetError(item.sets[index], type, required);
  }
  function editValue(
    positionId: string,
    index: number,
    field: "weight" | "reps" | "durationSec",
    raw: string,
  ) {
    if (requestLock.current || pending || conflict) return;
    const nextRaw = {
      ...rawValuesRef.current,
      [trainingInputKey(positionId, index, field)]: raw,
    };
    rawValuesRef.current = nextRaw;
    setRawValues(nextRaw);
    const parsed = parseNumber(field, raw);
    change((copy) => {
      if (raw === "" || parsed.ok) {
        copy.find((item) => item.positionId === positionId)!.sets[index][
          field
        ] = raw === "" ? null : parsed.ok ? parsed.value : null;
      }
    });
  }
  async function save(finish = false) {
    if (requestLock.current || conflict) return;
    if (!pending) {
      for (const item of resultsRef.current) {
        const exercise = initial.day.blocks
          .flatMap((block) => block.exercises)
          .find((exercise) => exercise.id === item.positionId)!;
        for (let index = 0; index < item.sets.length; index++) {
          const problem = setProblem(item, index, exercise.type);
          if (problem) {
            setConfirm(false);
            setSetIssue({
              positionId: item.positionId,
              index,
              message: problem,
            });
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
      rawValuesRef.current = {};
      setRawValues({});
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
  function startRest(seconds: number | null, label: string, target: string) {
    if (seconds === null || seconds <= 0) return;
    setRestPreset({ seconds, label, target, token: Date.now() });
  }
  const restTimer = (
    <GymRestTimer
      storageKey={"pulso-gym-timer:" + access.userId + ":" + initial.id}
      preset={restPreset}
    />
  );
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
      {!restPreset && restTimer}
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
                  startRest(block.macroRest, `Bloque · ${block.name}`, block.id)
                }
                aria-label={`Iniciar descanso del bloque ${block.name}`}
              >
                <Timer size={18} />
                Descansar
              </button>
            )}
          </div>
          {restPreset?.target === block.id && restTimer}
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
                          exercise.id,
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
                {restPreset?.target === exercise.id && restTimer}
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
                  {item.sets.map((set, n) => {
                    const issue =
                      setIssue?.positionId === exercise.id &&
                      setIssue.index === n
                        ? setIssue
                        : null;
                    const errorId = `gym-set-error-${exercise.id}-${n}`;
                    return (
                      <div
                        key={n}
                        ref={issue ? invalidRow : undefined}
                        className={
                          "gym-member-set" +
                          (!withWeight ? " is-single" : "") +
                          (set.confirmed ? " is-confirmed" : "")
                        }
                      >
                        <strong className="gym-member-set-number">
                          {n + 1}
                        </strong>
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
                              type="text"
                              inputMode={
                                field === "weight" ? "decimal" : "numeric"
                              }
                              autoComplete="off"
                              value={
                                rawValues[
                                  trainingInputKey(exercise.id, n, field)
                                ] ??
                                set[field] ??
                                ""
                              }
                              disabled={set.confirmed}
                              aria-label={`${field === "weight" ? "Peso" : field === "reps" ? "Repeticiones" : "Tiempo"} serie ${n + 1} de ${exercise.name}`}
                              aria-describedby={issue ? errorId : undefined}
                              onFocus={(event) => event.target.select()}
                              onChange={(event) =>
                                editValue(
                                  exercise.id,
                                  n,
                                  field,
                                  event.target.value,
                                )
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
                            set.confirmed
                              ? "Serie registrada"
                              : "Confirmar serie"
                          }
                        >
                          <input
                            type="checkbox"
                            checked={set.confirmed}
                            disabled={set.confirmed}
                            aria-label={`Confirmar serie ${n + 1} de ${exercise.name}`}
                            aria-describedby={issue ? errorId : undefined}
                            onChange={() => {
                              const problem = setProblem(
                                item,
                                n,
                                exercise.type,
                                true,
                              );
                              if (problem) {
                                setSetIssue({
                                  positionId: exercise.id,
                                  index: n,
                                  message: problem,
                                });
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
                        {issue && (
                          <p
                            id={errorId}
                            className="error gym-set-error"
                            role="alert"
                          >
                            Serie {n + 1}: {issue.message}
                          </p>
                        )}
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
                    );
                  })}
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
                rawValues: rawValuesRef.current,
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
                rawValuesRef.current = {};
                setRawValues({});
                setRevision(latest.revision);
                setDirty(false);
                setPending(null);
                setConflict(false);
                setResolve(false);
                setSetIssue(null);
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
  const clock = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (preset) clock.current?.scrollIntoView?.({ block: "nearest" });
  }, [preset]);
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
    <div
      className="gym-member-clock"
      ref={clock}
      role="group"
      aria-label={preset?.label ?? "Descanso"}
    >
      <RestClock session={{ id: storageKey }} storage={storage} />
    </div>
  );
}
