import { TrainingRecovery } from "./TrainingRecovery";
import { UnfinishedAnnotations } from "./UnfinishedAnnotations";
import {
  displayNumber,
  formatRestMinutes,
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
import type { PendingCommand } from "@pulso/sync/local-db";
import { ArrowLeft, Check, Timer, ChevronDown } from "lucide-react";
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
  useSessionPosition(data.db, session?.id);
  const [saveView, setSaveView] = useState<{
    queue: PendingCommand[];
    rawCount: number;
    loaded: boolean;
  }>({ queue: [], rawCount: 0, loaded: false });
  const { queue, rawCount } = saveView;
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
        rawCount: await data.db.rawInputs
          .where("studentId")
          .equals(id!)
          .count(),
        queue: await data.db.listPending(id!),
        loaded: true,
      })),
    ).subscribe(setSaveView);
    return () => sub.unsubscribe();
  }, [data.db, id]);
  useEffect(() => {
    const leave = (e: BeforeUnloadEvent) => {
      if (hasVolatile) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const link = (e: MouseEvent) => {
      if (hasFailed && (e.target as Element).closest("a[href]")) {
        e.preventDefault();
        e.stopPropagation();
        setError(
          "Hay un valor sin guardar. Reintentá su edición antes de cambiar de pantalla.",
        );
      }
    };
    window.addEventListener("beforeunload", leave);
    document.addEventListener("click", link, true);
    return () => {
      window.removeEventListener("beforeunload", leave);
      document.removeEventListener("click", link, true);
    };
  }, [hasVolatile, hasFailed]);
  if (!row) return <p>Cargando alumno…</p>;
  if (!session)
    return (
      <>
        <h1>Entrenamiento finalizado</h1>
        <TrainingRecovery studentId={id!} />
        <UnfinishedAnnotations studentId={id!} />
        <p>
          Los resultados confirmados ya están en el historial de{" "}
          {row.projection.student.name}.
        </p>
        <div className="row">
          <Link className="button" to="/hoy">
            Volver a Hoy
          </Link>
          <Link className="button secondary" to={"/historial/" + id}>
            Ver resultados
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
      <Link className="button secondary training-back" to="/hoy">
        <ArrowLeft size={18} aria-hidden="true" />
        Volver a Hoy
      </Link>
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
      <header className="training-header">
        <div>
          <p className="eyebrow">
            ENTRENAMIENTO EN CURSO · SEMANA {session.week}
          </p>
          <h1>{row.projection.student.name}</h1>
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
      <RestTimer key={session.id} session={session} />
      <div className="stack">
        {[...new Set(session.items.map((i) => i.block_id))].map((blockId) => {
          const items = session.items.filter((i) => i.block_id === blockId);
          return (
            <details className="training-block" open key={blockId}>
              <summary>
                <span>{items[0].block_name}</span>
                <small>
                  {items.length}{" "}
                  {items.length === 1 ? "ejercicio" : "ejercicios"} · Macro:{" "}
                  {items[0].macro_rest === null
                    ? "—"
                    : formatRestMinutes(items[0].macro_rest)}{" "}
                  min entre{" "}
                  {items[0].macro_target === "series" ? "series" : "bloques"}
                </small>
                <ChevronDown size={18} />
              </summary>
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
  const [detail, setDetail] = useState(false);
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
      <div className="live-fields">
        {(
          [
            "sets",
            ...(item.type === "time"
              ? ["durationSec"]
              : item.type === "load_reps"
                ? ["weight", "reps"]
                : ["reps"]),
            "microRest",
            "macroRest",
          ] as NumericName[]
        ).map((field) => (
          <LiveInput
            key={field}
            field={field}
            label={
              {
                weight: "Peso kg",
                sets: "Series",
                reps: "Repeticiones",
                durationSec: "Duración (s)",
                microRest: "Descanso micro (min)",
                macroRest: "Descanso macro (min)",
              }[field]
            }
            value={
              field === "macroRest" ? item.macro_rest : item.prescription[field]
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
      <details className="exercise-guide">
        <summary>Referencia del ejercicio</summary>
        <ExerciseArt exerciseId={item.exercise_id} />
      </details>
      <button
        className="button secondary small"
        aria-expanded={detail}
        onClick={() => setDetail(!detail)}
      >
        {detail ? "Ocultar" : "Detalle de series"} ·{" "}
        {item.sets.filter((s) => s.state === "done").length}/{item.sets.length}
      </button>
      {detail && (
        <div className="set-list">
          <p className="muted">
            Registrar una serie conserva su ejecución. Para cambiarla después
            usá la corrección con motivo, disponible también durante la sesión.
          </p>
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
      )}
    </article>
  );
}
function SetEditor({
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
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false);
  const latest = useRef(values),
    write = useRef<Promise<unknown>>(Promise.resolve()),
    base = useRef(set),
    changed = useRef(false);
  const rawId = sessionId + ":" + set.id + ":set-draft";
  useEffect(() => {
    let active = true;
    void data.db.rawInputs
      .get(rawId)
      .then((saved) => {
        if (!active) return;
        if (saved) {
          const v = JSON.parse(saved.raw);
          latest.current = v;
          setValues(v);
          base.current = saved.baseValue as typeof set;
          changed.current = true;
          setDirty(true);
        }
        setLoaded(true);
      })
      .catch(() => {
        if (active) setError("No se pudo recuperar el borrador de esta serie.");
      });
    return () => {
      active = false;
    };
  }, [data.db, rawId]);
  useEffect(() => {
    if (!changed.current) {
      const v = defaults();
      latest.current = v;
      setValues(v);
      base.current = set;
    }
  }, [set.weight, set.reps, set.duration_sec, set.state]);
  function change(field: keyof typeof values, text: string) {
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
        onFieldState(rawId, null);
      })
      .catch(() => {
        onFieldState(rawId, "failed");
        setError(
          "No se pudo guardar esta serie en el dispositivo. Reintentá la edición.",
        );
        throw Error("Guardado pendiente");
      });
    void write.current.catch(() => {});
  }
  async function discard() {
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
      await data.sync();
      onFieldState(rawId, null);
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
        <strong>Serie {set.ordinal}</strong>
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
      <strong>Serie {set.ordinal}</strong>
      {type === "load_reps" && (
        <label className="set-value">
          Peso (kg)
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
        {type === "time" ? "Tiempo (s)" : "Reps"}
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
      <button
        className="link-button"
        disabled={disabled || !loaded || busy}
        onClick={() => void save("skipped")}
      >
        Omitir
      </button>
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
    </div>
  );
}
function LiveInput({
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
    [state, setState] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    focused = useRef(false),
    latest = useRef(raw),
    write = useRef<Promise<unknown>>(Promise.resolve()),
    active = useRef(true);
  const rawId = session.id + ":" + item.id + ":" + field;
  useEffect(() => {
    active.current = true;
    void data.db.rawInputs.get(rawId).then((saved) => {
      if (saved && active.current) {
        const text = isRestField(field) ? restoreRestRaw(saved.raw) : saved.raw;
        setRaw(text);
        latest.current = text;
        setState("Pendiente de confirmar");
      }
    });
    return () => {
      active.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [rawId, data.db]);
  useEffect(() => {
    if (!focused.current && !state) {
      const text = displayNumber(field, value);
      setRaw(text);
      latest.current = text;
    }
  }, [value]);
  async function commit(text: string) {
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
        onFieldState(rawId, null);
        if (active.current && latest.current === text)
          setState("Guardado local");
      })
      .catch(() => {
        onFieldState(rawId, "failed");
        if (active.current) setState("No se pudo guardar");
        onError(
          "No se pudo guardar este campo en el dispositivo. Conservá el valor y reintentá.",
        );
      });
    timer.current = setTimeout(() => void commit(text), 300);
  }
  return (
    <label className={"field live-field-" + field}>
      {label}
      <input
        aria-label={label}
        inputMode={
          field === "weight" || isRestField(field) ? "decimal" : "numeric"
        }
        value={raw}
        disabled={disabled}
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
      <small className="field-hint">{state}</small>
    </label>
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
function RestTimer({ session }: { session: TrainingSession }) {
  const { db } = useData();
  const [end, setEnd] = useState<number | null>(null),
    [paused, setPaused] = useState<number | null>(null),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    let active = true;
    void db.meta.get("timer:" + session.id).then((r) => {
      if (r && active) {
        const t = r.value as { end: number | null; paused: number | null };
        setEnd(t.end);
        setPaused(t.paused);
      }
    });
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [session.id, db]);
  const remaining =
    paused ?? Math.max(0, Math.ceil(((end ?? now) - now) / 1000));
  function save(nextEnd: number | null, nextPaused: number | null) {
    setEnd(nextEnd);
    setPaused(nextPaused);
    void db.meta.put({
      key: "timer:" + session.id,
      value: { end: nextEnd, paused: nextPaused },
    });
  }
  return (
    <div className="rest-timer row spread">
      <div className="row">
        <Timer size={18} />
        <strong>
          Descanso · {Math.floor(remaining / 60)}:
          {String(remaining % 60).padStart(2, "0")}
        </strong>
        <small>min:seg</small>
      </div>
      <div className="row">
        <button
          className="button secondary small"
          onClick={() => save(Date.now() + 60_000, null)}
        >
          1 min
        </button>
        <button
          className="button secondary small"
          onClick={() => save(Date.now() + (remaining + 15) * 1000, null)}
        >
          +0,25 min
        </button>
        <button
          className="button secondary small"
          disabled={remaining === 0}
          onClick={() =>
            paused !== null
              ? save(Date.now() + paused * 1000, null)
              : save(null, remaining)
          }
        >
          {paused !== null ? "Continuar" : "Pausar"}
        </button>
      </div>
    </div>
  );
}
