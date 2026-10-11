import "./training.css";
import { useDraftNavigation } from "../routines/use-draft-navigation";
import { download } from "../../components/download";
import { RestTimer } from "./RestTimer";
import { TrainingRecovery } from "./TrainingRecovery";
import { UnfinishedAnnotations } from "./UnfinishedAnnotations";
import {
  displayNumber,
  formatRestMinutes,
  formatRestDuration,
  parseRestMinutes,
  isRestField,
  parseDisplayedNumber,
  restoreRestRaw,
  storeRestRaw,
} from "../../components/rest-minutes";
import { useSessionPosition } from "./useSessionPosition";
import { CorrectSet } from "./CorrectSet";
import { cloud } from "../../adapters/supabase";
import { ExerciseArt } from "../catalog/ExerciseLibrary";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { liveQuery } from "dexie";
import type { PendingCommand, RawInput } from "@pulso/sync/local-db";
import { ArrowLeft, Check, ChevronDown, MoreHorizontal } from "lucide-react";
import type { SessionItem, TrainingSession } from "@pulso/domain/contracts";
import {
  parseNumber,
  type NumericField as NumericName,
} from "@pulso/domain/numbers";
import { useData } from "../../app/DataProvider";
import { gateway } from "../../adapters/supabase-gateway";
export function TrainingScreen() {
  const { id } = useParams();
  const data = useData();
  const row = data.rows.find((r) => r.studentId === id),
    session = row?.projection.sessions[0];
  const [saveView, setSaveView] = useState<{
    queue: PendingCommand[];
    rawInputs: RawInput[];
    loaded: boolean;
  }>({ queue: [], rawInputs: [], loaded: false });
  // Resolve the save indicator before restoring scroll: its loading text can
  // wrap on phones and shrink the header after the browser has restored it.
  useSessionPosition(data.db, session?.id, saveView.loaded);
  const { queue, rawInputs } = saveView;
  const rawCount = rawInputs.length;
  const [volatileFields, setVolatileFields] = useState<
    Record<string, "writing" | "failed">
  >({});
  const onFieldState = (key: string, state: "writing" | "failed" | null) =>
    setVolatileFields((previous) => {
      const next = { ...previous };
      if (state) next[key] = state;
      else delete next[key];
      return next;
    });
  const hasVolatile = Object.keys(volatileFields).length > 0;
  const hasFailed = Object.values(volatileFields).includes("failed");
  const [scope, setScope] = useState<"session_only" | "session_and_future">(
    "session_and_future",
  );
  const [error, setError] = useState(""),
    [finish, setFinish] = useState(false),
    [busy, setBusy] = useState(false),
    [empty, setEmpty] = useState(false);
  useEffect(() => {
    const sub = liveQuery(() =>
      data.db.transaction("r", data.db.rawInputs, data.db.outbox, async () => ({
        rawInputs: await data.db.rawInputs
          .where("studentId")
          .equals(id!)
          .toArray(),
        queue: await data.db.listPending(id!),
        loaded: true,
      })),
    ).subscribe(setSaveView);
    return () => sub.unsubscribe();
  }, [data.db, id]);
  const { guard } = useDraftNavigation(hasVolatile, () =>
    setError(
      "Hay un valor sin guardar. Reintentá su edición antes de cambiar de pantalla.",
    ),
  );
  if (!row) return <p>Cargando alumno…</p>;
  if (!session)
    return (
      <>
        <h1>Entrenamiento finalizado</h1>
        <TrainingRecovery studentId={id!} />
        <UnfinishedAnnotations studentId={id!} />
        <p>
          Los resultados confirmados ya están en el progreso de{" "}
          {row.projection.student.name}.
        </p>
        <div className="row">
          <Link className="button" to="/hoy">
            Volver a Hoy
          </Link>
        </div>
      </>
    );
  const conflict = queue.find(
    (p) => p.state === "conflict" || p.state === "rejected",
  );
  const closing = queue.some((p) =>
    ["finish_session", "reconcile_offline_session"].includes(p.command.kind),
  );
  async function close() {
    setBusy(true);
    setError("");
    try {
      if (hasVolatile)
        throw Error("Hay un campo que todavía no se pudo guardar.");
      if (await data.db.rawInputs.where("studentId").equals(id!).count())
        throw Error("Hay campos sin confirmar. Corregilos antes de finalizar.");
      const current = await data.db.read(id!);
      await data.db.stage(
        data.makeCommand(
          id!,
          "finish_session",
          {
            sessionId: session!.id,
            quickConfirmItemIds: session!.items
              .filter((i) => !i.skipped)
              .map((i) => i.id),
            allowEmpty: empty,
          },
          current!.confirmed.revision,
        ),
      );
      setFinish(false);
      void data.sync();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="training-topbar">
        <Link
          className="button secondary training-back"
          to="/hoy"
          aria-label="Volver a Hoy"
          title="Volver a Hoy"
        >
          <ArrowLeft size={24} aria-hidden="true" />
        </Link>
        <h1>{row.projection.student.name}</h1>
      </div>
      {data.rows.filter((r) => r.projection.sessions.length).length > 1 && (
        <div className="active-strip" aria-label="Alumnos entrenando">
          {data.rows
            .filter((r) => r.projection.sessions.length)
            .map((r) => (
              <Link
                key={r.studentId}
                className={
                  "active-chip " + (r.studentId === id ? "selected" : "")
                }
                to={"/entrenar/" + r.studentId}
              >
                {r.projection.student.name}
                <span>
                  {data.pending.some((p) => p.studentId === r.studentId)
                    ? " · pendiente"
                    : ""}
                </span>
              </Link>
            ))}
        </div>
      )}
      <header className="training-header">
        <div>
          <p className="eyebrow">
            ENTRENAMIENTO EN CURSO · SEMANA {session.week}
          </p>
          <p className="muted">{row.projection.routine?.document.name}</p>
        </div>
        <span
          className={
            "save-indicator " +
            (queue.length || rawCount || hasVolatile ? "pending" : "")
          }
          role="status"
        >
          {!saveView.loaded
            ? "Consultando guardado"
            : hasVolatile
              ? hasFailed
                ? "No se pudo guardar"
                : "Guardando en este dispositivo"
              : conflict
                ? "Revisar cambio"
                : rawCount
                  ? "Campo pendiente de confirmar"
                  : closing
                    ? "Finalización pendiente"
                    : queue.length
                      ? "Guardado en este dispositivo"
                      : "Guardado"}
        </span>
      </header>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {conflict && (
        <div className="error">
          <h2>Este alumno necesita una revisión</h2>
          <p>{conflict.error}</p>
          <TrainingRecovery studentId={id!} />
        </div>
      )}
      {queue.length > 0 && !conflict && (
        <button
          className="button secondary small"
          onClick={() => void data.sync(true)}
        >
          Reintentar guardado
        </button>
      )}
      {closing && (
        <div className="notice">
          El cierre está guardado en este dispositivo. Esperando confirmación
          del servidor.
        </div>
      )}
      <details className="scope-choice">
        <summary>
          Ajustes:{" "}
          {scope === "session_and_future"
            ? "sesión y semanas siguientes"
            : "solo este entrenamiento"}
        </summary>
        <p className="scope-note">
          Las series ya registradas conservan sus valores. Podés corregirlas con
          un motivo en el detalle de series.
        </p>
        <label className="field scope-select">
          Aplicar los próximos ajustes
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as typeof scope)}
          >
            <option value="session_and_future">
              Sesión y semanas siguientes
            </option>
            <option value="session_only">Solo este entrenamiento</option>
          </select>
        </label>
      </details>
      {guard}
      <RestTimer key={session.id} session={session} />
      <div className="stack">
        {[...new Set(session.items.map((i) => i.block_id))].map((blockId) => {
          const items = session.items.filter((i) => i.block_id === blockId);
          // Older builds stored a block rest draft under each exercise. Surface every
          // outstanding annotation through the single block control, one at a time.
          const macroItem =
            items.find((item) =>
              rawInputs.some(
                (raw) =>
                  raw.sessionId === session.id &&
                  raw.itemId === item.id &&
                  raw.field === "macroRest",
              ),
            ) ?? items[0];
          return (
            <details className="training-block" open key={blockId}>
              <summary>
                <span>{items[0].block_name}</span>
                <small>
                  {items.length}{" "}
                  {items.length === 1 ? "ejercicio" : "ejercicios"}
                </small>
                <ChevronDown size={18} />
              </summary>
              <div className="training-block-rest">
                <LiveInput
                  key={macroItem.id}
                  field="macroRest"
                  label="Descanso del bloque"
                  value={macroItem.macro_rest}
                  item={macroItem}
                  session={session}
                  scope={scope}
                  onFieldState={onFieldState}
                  studentId={id!}
                  disabled={closing || !!conflict}
                  onError={setError}
                />
              </div>
              <div className="stack">
                {items.map((item) => (
                  <ExerciseRow
                    key={item.id}
                    item={item}
                    session={session}
                    scope={scope}
                    onFieldState={onFieldState}
                    studentId={id!}
                    disabled={closing || !!conflict}
                    onError={setError}
                  />
                ))}
              </div>
            </details>
          );
        })}
      </div>
      <div className="finish-bar">
        <span>
          {session.items.filter((i) => i.skipped).length} omitidos ·{" "}
          {session.items.length} ejercicios
        </span>
        <button
          className="button"
          disabled={closing || !!conflict || hasVolatile}
          onClick={() => setFinish(true)}
        >
          Finalizar entrenamiento
        </button>
      </div>
      {finish && (
        <div className="modal-backdrop">
          <section
            className="card modal stack"
            role="dialog"
            aria-modal="true"
            aria-label="Finalizar entrenamiento"
          >
            <h2>Todo lo de hoy, registrado</h2>
            <p>
              {
                session.items
                  .flatMap((i) => i.sets)
                  .filter((s) => s.state === "done").length
              }{" "}
              series registradas individualmente. Los ejercicios pendientes se
              confirmarán con sus valores actuales y quedarán identificados como
              confirmación rápida.
            </p>
            <label className="row">
              <input
                type="checkbox"
                checked={empty}
                onChange={(e) => setEmpty(e.target.checked)}
              />
              Permitir cierre sin ejercicios realizados
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button
              className="button"
              disabled={busy || rawCount > 0}
              onClick={close}
            >
              Confirmar cierre
            </button>
            <button
              className="button secondary"
              onClick={() => setFinish(false)}
            >
              Seguir entrenando
            </button>
          </section>
        </div>
      )}
    </>
  );
}
function ExerciseRow({
  onFieldState,
  scope,
  item,
  session,
  studentId,
  disabled,
  onError,
}: {
  onFieldState: (key: string, state: "writing" | "failed" | null) => void;
  scope: "session_only" | "session_and_future";
  item: SessionItem;
  session: TrainingSession;
  studentId: string;
  disabled: boolean;
  onError: (s: string) => void;
}) {
  const data = useData();

  async function stage(
    kind: "skip_item" | "record_set",
    payload: Record<string, unknown>,
  ) {
    try {
      const row = await data.db.read(studentId);
      await data.db.stage(
        data.makeCommand(
          studentId,
          kind,
          { sessionId: session.id, itemId: item.id, ...payload },
          row!.confirmed.revision,
        ),
      );
      void data.sync();
    } catch (e) {
      onError((e as Error).message);
    }
  }
  return (
    <article
      className={"card training-exercise " + (item.skipped ? "skipped" : "")}
    >
      <div className="row spread">
        <div>
          <p className="eyebrow">
            {item.group}
            {item.warmup ? " · aproximación" : ""}
          </p>
          <h2>{item.name}</h2>
          <PreviousResult exerciseId={item.exercise_id} studentId={studentId} />
        </div>
        <label className="row">
          <input
            type="checkbox"
            checked={item.skipped}
            disabled={disabled}
            onChange={(e) =>
              void stage("skip_item", { skipped: e.target.checked })
            }
          />
          No se realizó
        </label>
      </div>
      {item.prescription.progression && (
        <p className="progression-badge">
          Progresión · {item.sets.length} series con objetivos propios
        </p>
      )}
      <div className="training-exercise-tools">
        <LiveInput
          field="microRest"
          label="Descanso entre series"
          value={item.prescription.microRest}
          item={item}
          session={session}
          scope={scope}
          onFieldState={onFieldState}
          studentId={studentId}
          disabled={disabled || item.skipped}
          onError={onError}
        />
        <span className="training-series-count">
          {item.sets.filter((s) => s.state === "done").length}/
          {item.sets.length} series
        </span>
      </div>
      <div className="training-set-heading" aria-hidden="true">
        <span>Serie</span>
        <span>{item.type === "load_reps" ? "Kg" : "Carga"}</span>
        <span>{item.type === "time" ? "Segundos" : "Reps"}</span>
        <span>Hecho</span>
      </div>
      <div className="set-list">
        {item.sets.map((set) => (
          <div key={set.id}>
            <SetEditor
              set={set}
              type={item.type}
              disabled={disabled || item.skipped}
              studentId={studentId}
              sessionId={session.id}
              itemId={item.id}
              onFieldState={onFieldState}
            />
            {!disabled && (
              <CorrectSet
                studentId={studentId}
                sessionId={session.id}
                item={item}
                set={set}
              />
            )}
          </div>
        ))}
      </div>
      {!item.prescription.progression && (
        <details className="training-adjustments">
          <summary>
            Editar objetivos <ChevronDown size={16} />
          </summary>
          <p className="muted">
            Aplicá un objetivo a todas las series pendientes. Para registrar lo
            realizado, usá las filas de arriba. Las series registradas conservan
            sus resultados.
          </p>
          <div className="live-fields">
            {(
              [
                "sets",
                ...(item.type === "time"
                  ? ["durationSec"]
                  : item.type === "load_reps"
                    ? ["weight", "reps"]
                    : ["reps"]),
              ] as NumericName[]
            )
              .filter(() => !item.prescription.progression)
              .map((field) => (
                <LiveInput
                  key={field}
                  field={field}
                  label={
                    {
                      weight: "Peso kg",
                      sets: "Series",
                      reps: "Repeticiones",
                      durationSec: "Duración (s)",
                      microRest: "Descanso entre series",
                      macroRest: "Descanso del bloque",
                    }[field]
                  }
                  value={
                    field === "macroRest"
                      ? item.macro_rest
                      : item.prescription[field]
                  }
                  item={item}
                  session={session}
                  scope={scope}
                  onFieldState={onFieldState}
                  studentId={studentId}
                  disabled={disabled || item.skipped}
                  onError={onError}
                />
              ))}
          </div>
        </details>
      )}
      <details className="exercise-guide">
        <summary>
          Referencia del ejercicio
          <ChevronDown size={18} aria-hidden="true" />
        </summary>
        <ExerciseArt exerciseId={item.exercise_id} />
      </details>
    </article>
  );
}
export function SetEditor({
  set,
  type,
  disabled,
  studentId,
  sessionId,
  itemId,
  onFieldState,
}: {
  set: SessionItem["sets"][number];
  type: SessionItem["type"];
  disabled: boolean;
  studentId: string;
  sessionId: string;
  itemId: string;
  onFieldState: (key: string, state: "writing" | "failed" | null) => void;
}) {
  const data = useData();
  const defaults = () => ({
    weight: String(set.weight ?? ""),
    reps: String(set.reps ?? ""),
    duration: String(set.duration_sec ?? ""),
  });
  const [values, setValues] = useState(defaults),
    [error, setError] = useState(""),
    [loaded, setLoaded] = useState(false),
    [loadError, setLoadError] = useState(false),
    [unreadableDraft, setUnreadableDraft] = useState<RawInput | null>(null),
    [reload, setReload] = useState(0),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false);
  const latest = useRef(values),
    write = useRef<Promise<unknown>>(Promise.resolve()),
    base = useRef(set),
    changed = useRef(false);
  const writeGeneration = useRef(0);
  const rawId = sessionId + ":" + set.id + ":set-draft";
  useEffect(() => {
    let active = true;
    setLoaded(false);
    setLoadError(false);
    setUnreadableDraft(null);
    void data.db.rawInputs
      .get(rawId)
      .then((saved) => {
        if (!active) return;
        if (saved) {
          let v: typeof values;
          try {
            v = JSON.parse(saved.raw);
            if (
              !v ||
              typeof v.weight !== "string" ||
              typeof v.reps !== "string" ||
              typeof v.duration !== "string"
            )
              throw Error("Invalid stored set draft");
          } catch (cause) {
            setUnreadableDraft(saved);
            throw cause;
          }
          latest.current = v;
          setValues(v);
          base.current = saved.baseValue as typeof set;
          changed.current = true;
          setDirty(true);
        }
        setLoaded(true);
        setError("");
      })
      .catch(() => {
        if (active) {
          setLoadError(true);
          setError("No se pudo recuperar el borrador de esta serie.");
        }
      });
    return () => {
      active = false;
    };
  }, [data.db, rawId, reload]);
  useEffect(() => {
    if (!changed.current) {
      const v = defaults();
      latest.current = v;
      setValues(v);
      base.current = set;
    }
  }, [set.weight, set.reps, set.duration_sec, set.state]);
  function change(field: keyof typeof values, text: string) {
    if (!loaded) return;
    const generation = ++writeGeneration.current;
    const next = { ...latest.current, [field]: text };
    latest.current = next;
    setValues(next);
    changed.current = true;
    setDirty(true);
    onFieldState(rawId, "writing");
    write.current = write.current
      .catch(() => {})
      .then(async () => {
        await data.db.captureRaw({
          id: rawId,
          studentId,
          sessionId,
          itemId,
          setId: set.id,
          field: "setDraft",
          raw: JSON.stringify(next),
          baseValue: base.current,
        });
        if (generation === writeGeneration.current) {
          onFieldState(rawId, null);
          setError("");
        }
      })
      .catch(() => {
        if (generation === writeGeneration.current) {
          onFieldState(rawId, "failed");
          setError(
            "No se pudo guardar esta serie en el dispositivo. Reintentá la edición.",
          );
        }
        throw Error("Guardado pendiente");
      });
    void write.current.catch(() => {});
  }
  async function discard() {
    setBusy(true);
    try {
      await write.current.catch(() => {});
      const saved = await data.db.rawInputs.get(rawId);
      if (saved) {
        if (saved.raw !== JSON.stringify(latest.current))
          throw Error(
            "La anotación cambió en otra pestaña. Volvé a abrir el detalle.",
          );
        await data.db.discardRaw(saved);
      }
      changed.current = false;
      setDirty(false);
      base.current = set;
      const v = defaults();
      latest.current = v;
      setValues(v);
      setError("");
      onFieldState(rawId, null);
    } catch {
      setError("No se pudo descartar el borrador.");
    } finally {
      setBusy(false);
    }
  }
  async function recoverUnreadableDraft() {
    if (
      !unreadableDraft ||
      !confirm(
        "Se descargará una copia de la anotación antes de descartarla. ¿Continuar?",
      )
    )
      return;
    setBusy(true);
    try {
      download("pulso-anotacion-pendiente.json", unreadableDraft);
      await data.db.discardRaw(unreadableDraft);
      setReload((n) => n + 1);
    } catch {
      setError(
        "No se pudo descartar la anotación. Se conserva para reintentar.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function save(state: "done" | "skipped") {
    const captured = { ...latest.current };
    setBusy(true);
    onFieldState(rawId, "writing");
    try {
      await write.current;
      const w = parseNumber("weight", captured.weight),
        r = parseNumber("reps", captured.reps),
        d = parseNumber("durationSec", captured.duration);
      if (
        state === "done" &&
        ((type === "load_reps" && !w.ok) ||
          (type !== "time" && !r.ok) ||
          (type === "time" && !d.ok))
      )
        throw Error("Completá valores válidos.");
      const row = await data.db.read(studentId);
      const saved = await data.db.rawInputs.get(rawId);
      if (saved && saved.raw !== JSON.stringify(captured))
        throw Error(
          "La anotación cambió en otra pestaña. Se conserva el valor nuevo; volvé a abrir el detalle.",
        );
      await data.db.stage(
        data.makeCommand(
          studentId,
          "record_set",
          {
            sessionId,
            itemId,
            setId: set.id,
            ordinal: set.ordinal,
            state,
            weight: w.ok ? w.value : null,
            reps: r.ok ? r.value : null,
            durationSec: d.ok ? d.value : null,
          },
          row!.confirmed.revision,
        ),
        saved ? rawId : undefined,
        saved,
      );
      changed.current = false;
      setDirty(false);
      setError("");
      onFieldState(rawId, null);
      // The observation is durable in the local outbox. A later sync failure
      // belongs to the screen's queue status, not to this now-completed editor.
      void data.sync().catch(() => {});
    } catch (e) {
      onFieldState(rawId, "failed");
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (set.state !== "pending")
    return (
      <div className="set-row">
        <strong aria-label={"Serie " + set.ordinal}>{set.ordinal}</strong>
        <span>
          {set.state === "skipped" ? (
            "Sin resultado"
          ) : (
            <>
              {set.weight !== null ? set.weight + " kg · " : ""}
              {type === "time" ? set.duration_sec + " s" : set.reps + " reps"}
            </>
          )}
        </span>
        <span className="badge">
          {set.state === "done" ? "Registrada" : "Omitida"}
        </span>
      </div>
    );
  return (
    <div className="set-row set-editor">
      <strong aria-label={"Serie " + set.ordinal}>{set.ordinal}</strong>
      {type !== "load_reps" && (
        <span className="set-bodyweight">
          {type === "reps" ? "Corporal" : "—"}
        </span>
      )}
      {type === "load_reps" && (
        <label className="set-value">
          <span className="sr-only">Peso (kg)</span>
          <input
            aria-label={"Peso serie " + set.ordinal}
            inputMode="decimal"
            disabled={disabled || !loaded || busy}
            value={values.weight}
            onChange={(e) => change("weight", e.target.value)}
          />
        </label>
      )}
      <label className="set-value">
        <span className="sr-only">
          {type === "time" ? "Tiempo (s)" : "Reps"}
        </span>
        <input
          aria-label={
            (type === "time" ? "Segundos" : "Reps") + " serie " + set.ordinal
          }
          inputMode="numeric"
          disabled={disabled || !loaded || busy}
          value={type === "time" ? values.duration : values.reps}
          onChange={(e) =>
            change(type === "time" ? "duration" : "reps", e.target.value)
          }
        />
      </label>
      <button
        className="button icon-button set-confirm"
        aria-label={"Registrar serie " + set.ordinal}
        disabled={disabled || !loaded || busy}
        onClick={() => void save("done")}
      >
        <Check size={16} />
      </button>
      <details className="set-options">
        <summary aria-label={"Opciones de serie " + set.ordinal}>
          <MoreHorizontal size={18} aria-hidden="true" />
        </summary>
        <button
          className="link-button"
          disabled={disabled || !loaded || busy}
          onClick={() => void save("skipped")}
        >
          Omitir serie {set.ordinal}
        </button>
      </details>
      {dirty && (
        <>
          <small>Edición pendiente; falta registrar la serie.</small>
          <button
            className="link-button"
            disabled={busy}
            onClick={() => void discard()}
          >
            Descartar edición de serie {set.ordinal}
          </button>
        </>
      )}
      {error && <span role="alert">{error}</span>}
      {loadError && (
        <button
          className="link-button"
          disabled={busy}
          onClick={() => setReload((n) => n + 1)}
        >
          Reintentar carga de serie {set.ordinal}
        </button>
      )}
      {unreadableDraft && (
        <button
          className="link-button"
          disabled={busy}
          onClick={() => void recoverUnreadableDraft()}
        >
          Exportar y descartar anotación de serie {set.ordinal}
        </button>
      )}
    </div>
  );
}
export function LiveInput({
  onFieldState,
  scope,
  field,
  label,
  value,
  item,
  session,
  studentId,
  disabled,
  onError,
}: {
  onFieldState: (key: string, state: "writing" | "failed" | null) => void;
  scope: "session_only" | "session_and_future";
  field: NumericName;
  label: string;
  value: number | null;
  item: SessionItem;
  session: TrainingSession;
  studentId: string;
  disabled: boolean;
  onError: (s: string) => void;
}) {
  const data = useData(),
    [raw, setRaw] = useState(displayNumber(field, value)),
    [state, setState] = useState(""),
    [loaded, setLoaded] = useState(false),
    [loadError, setLoadError] = useState(false),
    [reload, setReload] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    focused = useRef(false),
    latest = useRef(raw),
    write = useRef<Promise<unknown>>(Promise.resolve()),
    active = useRef(true);
  const writeGeneration = useRef(0);
  const rawId = session.id + ":" + item.id + ":" + field;
  useEffect(() => {
    let current = true;
    active.current = true;
    setLoaded(false);
    setLoadError(false);
    void data.db.rawInputs
      .get(rawId)
      .then((saved) => {
        if (!current) return;
        if (saved) {
          const text = isRestField(field)
            ? restoreRestRaw(saved.raw)
            : saved.raw;
          setRaw(text);
          latest.current = text;
          setState("Pendiente de confirmar");
        } else setState("");
        setLoaded(true);
      })
      .catch(() => {
        if (!current) return;
        setLoadError(true);
        setState("No se pudo recuperar la anotación guardada.");
      });
    return () => {
      current = false;
      active.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [rawId, data.db, reload]);
  useEffect(() => {
    if (!focused.current && !state) {
      const text = displayNumber(field, value);
      setRaw(text);
      latest.current = text;
    }
  }, [value]);
  async function commit(text: string) {
    if (!loaded) return;
    await write.current;
    const result = parseDisplayedNumber(field, text);
    if (!result.ok) {
      setState("Revisá el valor");
      return;
    }
    try {
      const row = await data.db.read(studentId);
      const saved = await data.db.rawInputs.get(rawId);
      if (
        !saved ||
        (isRestField(field) ? restoreRestRaw(saved.raw) : saved.raw) !== text
      )
        return;
      await data.db.stage(
        data.makeCommand(
          studentId,
          "adjust_prescription",
          {
            sessionId: session.id,
            itemId: item.id,
            field,
            value: result.value,
            scope: saved.scope ?? scope,
          },
          saved.revision,
        ),
        rawId,
        saved,
      );
      if (active.current && latest.current === text) setState("");
      void data.sync();
    } catch (e) {
      if (active.current) setState("No confirmado");
      onError((e as Error).message);
    }
  }
  function change(text: string) {
    if (!loaded) return;
    const generation = ++writeGeneration.current;
    setRaw(text);
    latest.current = text;
    setState("Guardando en este dispositivo");
    onFieldState(rawId, "writing");
    if (timer.current) clearTimeout(timer.current);
    write.current = write.current
      .then(async () => {
        await data.db.captureRaw({
          id: rawId,
          studentId,
          sessionId: session.id,
          itemId: item.id,
          field,
          raw: isRestField(field) ? storeRestRaw(text) : text,
          scope,
        });
        if (generation === writeGeneration.current) {
          onFieldState(rawId, null);
          if (active.current) setState("Guardado local");
        }
      })
      .catch(() => {
        if (generation === writeGeneration.current) {
          onFieldState(rawId, "failed");
          if (active.current) setState("No se pudo guardar");
          onError(
            "No se pudo guardar este campo en el dispositivo. Conservá el valor y reintentá.",
          );
        }
      });
    timer.current = setTimeout(() => void commit(text), 300);
  }
  return (
    <>
      <label className={"field live-field-" + field}>
        {label}
        {isRestField(field) ? (
          <select
            aria-label={label}
            value={raw}
            disabled={disabled || !loaded}
            onChange={(event) => change(event.target.value)}
            onBlur={() => {
              if (timer.current) clearTimeout(timer.current);
              void commit(latest.current);
            }}
          >
            <option value="">Sin definir</option>
            {raw !== "" && !["0.5", "1", "3", "5"].includes(raw) && (
              <option value={raw}>
                {parseRestMinutes(raw).ok
                  ? formatRestDuration(
                      (
                        parseRestMinutes(raw) as {
                          ok: true;
                          value: number | null;
                        }
                      ).value,
                    )
                  : "Anotación pendiente: " + raw}
              </option>
            )}
            {[30, 60, 180, 300].map((seconds) => (
              <option key={seconds} value={formatRestMinutes(seconds)}>
                {formatRestDuration(seconds)}
              </option>
            ))}
          </select>
        ) : (
          <input
            aria-label={label}
            inputMode={
              field === "weight" || isRestField(field) ? "decimal" : "numeric"
            }
            value={raw}
            disabled={disabled || !loaded}
            onFocus={(e) => {
              focused.current = true;
              e.target.select();
            }}
            onChange={(e) => change(e.target.value)}
            onBlur={() => {
              focused.current = false;
              if (timer.current) clearTimeout(timer.current);
              void commit(latest.current);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
        )}
        <small className="field-hint">{state}</small>
      </label>
      {loadError && (
        <button className="link-button" onClick={() => setReload((n) => n + 1)}>
          Reintentar carga de {label.toLowerCase()}
        </button>
      )}
    </>
  );
}
function PreviousResult({
  exerciseId,
  studentId,
}: {
  exerciseId: string;
  studentId: string;
}) {
  const [value, setValue] = useState("Sin registro anterior");
  useEffect(() => {
    let active = true;
    void (async () => {
      const { data, error } = await cloud()
        .from("session_items")
        .select(
          "id,session_sets(weight,reps,duration_sec,state),sessions!inner(status,started_at)",
        )
        .eq("student_id", studentId)
        .eq("exercise_id", exerciseId)
        .eq("sessions.status", "closed")
        .order("sessions(started_at)", { ascending: false })
        .limit(1);
      if (!active || error) return;
      const rows = (data ?? []).sort((a, b) =>
        String(
          (b.sessions as unknown as { started_at: string }).started_at,
        ).localeCompare(
          String((a.sessions as unknown as { started_at: string }).started_at),
        ),
      );
      const set = rows[0]?.session_sets.find((s) => s.state === "done");
      if (set)
        setValue(
          "Anterior: " +
            (set.weight !== null ? set.weight + " kg · " : "") +
            (set.reps !== null ? set.reps + " reps" : set.duration_sec + " s"),
        );
    })();
    return () => {
      active = false;
    };
  }, [exerciseId, studentId]);
  return <small>{value}</small>;
}
