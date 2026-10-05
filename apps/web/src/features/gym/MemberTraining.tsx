import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Play, Plus } from "lucide-react";
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
import { useGym } from "./GymPortal";
import { Empty, LoadState, Modal, PageHeading } from "./ui";

export function MemberHome() {
  const { access } = useGym(),
    navigate = useNavigate();
  const data = useResource(async () => {
    const [open, routine] = await Promise.all([
      rows<GymSession[]>(
        cloud().from("gym_sessions").select("*").eq("status", "open"),
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
        <section className="card stack gym-start">
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
                  {d.name}
                </button>
              ))}
            </div>
          </fieldset>
          <p className="muted">
            {data.value.routine.document.weeks[week][day]?.blocks.reduce(
              (n, b) => n + b.exercises.length,
              0,
            )}{" "}
            ejercicios para hoy
          </p>
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
      {data.value && <Training key={data.value.id} initial={data.value} />}
    </>
  );
}
type Pending = {
  operationId: string;
  kind: string;
  payload: { id: string; expectedRevision: number; results: GymResult[] };
};
function initialResults(s: GymSession): GymResult[] {
  return s.day.blocks
    .flatMap((b) => b.exercises)
    .map(
      (e) =>
        s.results.find((r) => r.positionId === e.id) || {
          positionId: e.id,
          skipped: false,
          sets: Array.from({ length: e.prescription.sets || 1 }, () => ({
            weight: e.prescription.weight,
            reps: e.prescription.reps,
            durationSec: e.prescription.durationSec,
            confirmed: false,
          })),
        },
    );
}
function Training({ initial }: { initial: GymSession }) {
  const { access } = useGym(),
    navigate = useNavigate(),
    storageKey = "pulso-gym-session:" + access.userId + ":" + initial.id;
  const [results, setResults] = useState<GymResult[]>(() =>
      initialResults(initial),
    ),
    [revision, setRevision] = useState(initial.revision),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState(false),
    [conflict, setConflict] = useState(false),
    [pending, setPending] = useState<Pending | null>(null);
  const resultsRef = useRef(results);
  useEffect(() => {
    if (initial.status === "finished") {
      navigate("/mi-entrenamiento", { replace: true });
      return;
    }
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        results: GymResult[];
        revision: number;
        pending: Pending | null;
      };
      if (saved.revision === initial.revision) {
        resultsRef.current = saved.results;
        setResults(saved.results);
        setDirty(true);
        setPending(saved.pending);
      } else if (
        saved.pending &&
        JSON.stringify(saved.pending.payload.results) ===
          JSON.stringify(initial.results)
      ) {
        localStorage.removeItem(storageKey);
      } else {
        setConflict(true);
        setError(
          "Este entrenamiento cambió en otra pestaña. La edición local sigue guardada; revisá los registros antes de continuar.",
        );
      }
    } catch {
      setError("No se pudo recuperar la edición local.");
    }
  }, [storageKey]);
  function persist(
    next: GymResult[],
    r = revision,
    p: Pending | null = pending,
  ) {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ results: next, revision: r, pending: p }),
      );
    } catch {
      setError(
        "No se pudo conservar en este dispositivo. Guardá el entrenamiento antes de salir.",
      );
    }
  }
  function change(fn: (copy: GymResult[]) => void) {
    if (busy || pending || conflict) return;
    const next = structuredClone(resultsRef.current);
    fn(next);
    resultsRef.current = next;
    setResults(next);
    setDirty(true);
    persist(next);
  }
  async function save(finish = false) {
    if (busy || conflict) return;
    setBusy(true);
    setError("");
    const request = pending || {
      operationId: crypto.randomUUID(),
      kind: finish ? "finish_session" : "save_session",
      payload: {
        id: initial.id,
        expectedRevision: revision,
        results: resultsRef.current,
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
      localStorage.removeItem(storageKey);
      if (request.kind === "finish_session") navigate("/mi-entrenamiento");
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "22023") {
        setPending(null);
        persist(resultsRef.current, revision, null);
      }
      if (code === "40001") setConflict(true);
      setError(gymError(e));
    } finally {
      setBusy(false);
    }
  }
  const disabled = busy || !!pending || conflict;
  return (
    <div className="gym-training">
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
          SEMANA {initial.week + 1} · {initial.day.name}
        </p>
        <h1>{initial.routine_name}</h1>
        <span className="badge" role="status">
          {dirty ? "Cambios sin guardar" : "Guardado"}
        </span>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {conflict && (
        <p>
          Para evitar sobrescribir cambios, abrí este entrenamiento desde la
          pestaña donde guardaste por última vez.
        </p>
      )}
      <GymRestTimer
        storageKey={"pulso-gym-timer:" + access.userId + ":" + initial.id}
      />
      {initial.day.blocks.map((block) => (
        <section className="gym-training-block stack" key={block.id}>
          <div className="gym-heading-row">
            <h2>{block.name}</h2>
            <small className="muted">
              {block.exercises.length} ejercicios · Descanso{" "}
              {block.macroRest ?? 0} s
            </small>
          </div>
          {block.exercises.map((e) => {
            const index = results.findIndex((r) => r.positionId === e.id),
              item = results[index];
            return (
              <article className="card stack" key={e.id}>
                <div className="gym-heading-row">
                  <div>
                    <p className="eyebrow">
                      {e.group}
                      {e.warmup ? " · Calentamiento" : ""}
                    </p>
                    <h2>{e.name}</h2>
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
                <fieldset disabled={disabled || item.skipped} className="stack">
                  {item.sets.map((set, n) => (
                    <div className="gym-set" key={n}>
                      <strong className="gym-set-number">{n + 1}</strong>
                      {(e.type === "load_reps"
                        ? ["weight", "reps"]
                        : e.type === "time"
                          ? ["durationSec"]
                          : ["reps"]
                      ).map((field) => {
                        const f = field as "weight" | "reps" | "durationSec";
                        return (
                          <label className="field" key={f}>
                            {f === "weight"
                              ? "Peso · kg"
                              : f === "reps"
                                ? "Repeticiones"
                                : "Tiempo · s"}
                            <input
                              type="number"
                              inputMode="decimal"
                              min={f === "weight" ? 0 : 1}
                              max={
                                f === "weight"
                                  ? 1000
                                  : f === "reps"
                                    ? 500
                                    : 86400
                              }
                              step={f === "weight" ? "0.5" : "1"}
                              value={set[f] ?? ""}
                              aria-label={`${f === "weight" ? "Peso" : f === "reps" ? "Repeticiones" : "Tiempo"} serie ${n + 1} de ${e.name}`}
                              onChange={(event) =>
                                change((copy) => {
                                  copy[index].sets[n][f] =
                                    event.target.value === ""
                                      ? null
                                      : Number(event.target.value);
                                })
                              }
                            />
                          </label>
                        );
                      })}
                      <label className="gym-check gym-set-done">
                        <input
                          type="checkbox"
                          checked={set.confirmed}
                          aria-label={`Confirmar serie ${n + 1} de ${e.name}`}
                          onChange={(event) =>
                            change((copy) => {
                              copy[index].sets[n].confirmed =
                                event.target.checked;
                            })
                          }
                        />
                        <span>Hecha</span>
                      </label>
                    </div>
                  ))}
                  <button
                    className="button secondary"
                    disabled={item.sets.length >= 50}
                    onClick={() =>
                      change((copy) => {
                        copy[index].sets.push({
                          weight: e.prescription.weight,
                          reps: e.prescription.reps,
                          durationSec: e.prescription.durationSec,
                          confirmed: false,
                        });
                      })
                    }
                  >
                    <Plus size={16} />
                    Agregar serie
                  </button>
                </fieldset>
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
          Guardar entrenamiento
        </button>
        <button
          className="button"
          disabled={busy || conflict || !!pending}
          onClick={() => setConfirm(true)}
        >
          Finalizar entrenamiento
        </button>
      </footer>
      {pending && !busy && (
        <p className="notice">
          Tu registro sigue guardado en este dispositivo. Pulsá Guardar
          entrenamiento para reintentar.
        </p>
      )}
      {confirm && (
        <Modal
          title="Finalizar entrenamiento"
          close={() => {
            if (!busy) setConfirm(false);
          }}
        >
          <p>
            Se guardarán las series confirmadas. Podrás consultar tus resultados
            en Progreso.
          </p>
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
function GymRestTimer({ storageKey }: { storageKey: string }) {
  const [storage] = useState(() => ({
    get: async () => {
      const raw = localStorage.getItem(storageKey);
      return raw ? { value: JSON.parse(raw) } : undefined;
    },
    put: async (entry: { key: string; value: unknown }) => {
      localStorage.setItem(storageKey, JSON.stringify(entry.value));
    },
  }));
  return <RestClock session={{ id: storageKey }} storage={storage} />;
}
