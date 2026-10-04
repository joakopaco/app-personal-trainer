import { auditChanges, eventNames } from "@pulso/domain/audit-display";
import { csvCell } from "@pulso/domain/metrics";
import { parseNumber } from "@pulso/domain/numbers";
import { LegacyHistory } from "./LegacyHistory";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { cloud } from "../../adapters/supabase";
import { useData } from "../../app/DataProvider";
import { Progress } from "./Progress";
import { RoutineArchive } from "./RoutineArchive";
import { ArrowLeft } from "lucide-react";
import "./history.css";
type ResultSet = {
  id: string;
  ordinal: number;
  state: string;
  source: string;
  weight: number | null;
  reps: number | null;
  duration_sec: number | null;
};
type ResultItem = {
  id: string;
  name: string;
  type: string;
  warmup: boolean;
  skipped: boolean;
  exercise_id: string;
  group: string;
  session_sets: ResultSet[];
};
type ResultSession = {
  id: string;
  date: string;
  ended_at: string;
  session_items: ResultItem[];
};
export function History() {
  const { id } = useParams();
  const { rows, onlineCommand } = useData();
  const row = rows.find((r) => r.studentId === id);
  const [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const [sessions, setSessions] = useState<ResultSession[]>([]),
    [events, setEvents] = useState<
      {
        id: string;
        kind: string;
        created_at: string;
        captured_at: string;
        reason: string | null;
        before_data: unknown;
        after_data: unknown;
      }[]
    >([]),
    [error, setError] = useState(""),
    [recordsLoading, setRecordsLoading] = useState(true),
    [offset, setOffset] = useState(0),
    [reload, setReload] = useState(0),
    [correction, setCorrection] = useState<{
      session: ResultSession;
      item: ResultItem;
      set: ResultSet;
    } | null>(null),
    [reason, setReason] = useState(""),
    [value, setValue] = useState(""),
    [field, setField] = useState<"weight" | "reps" | "durationSec">("weight");
  useEffect(() => {
    let active = true;
    setRecordsLoading(true);
    setError("");
    setSessions([]);
    setEvents([]);
    void (async () => {
      const a = await cloud()
        .from("sessions")
        .select(
          "id,date,ended_at,session_items(id,name,type,warmup,skipped,exercise_id,group,session_sets(id,ordinal,state,source,weight,reps,duration_sec))",
        )
        .eq("student_id", id!)
        .eq("status", "closed")
        .gte("date", from || "1900-01-01")
        .lte("date", to || "9999-12-31")
        .order("ended_at", { ascending: false })
        .order("id")
        .range(offset, offset + 19);
      const b = await cloud()
        .from("audit_events")
        .select("*")
        .eq("student_id", id!)
        .gte(
          "captured_at",
          from ? from + "T00:00:00-03:00" : "1900-01-01T00:00:00Z",
        )
        .lte(
          "captured_at",
          to ? to + "T23:59:59.999-03:00" : "9999-12-31T23:59:59Z",
        )
        .order("created_at", { ascending: false })
        .order("id")
        .range(offset, offset + 19);
      if (!active) return;
      setRecordsLoading(false);
      if (a.error || b.error) setError("No se pudo cargar el historial.");
      else {
        const result = a.data as unknown as ResultSession[];
        for (const session of result)
          for (const item of session.session_items)
            item.session_sets.sort((x, y) => x.ordinal - y.ordinal);
        setSessions(result);
        setEvents(b.data);
      }
    })();
    return () => {
      active = false;
    };
  }, [id, offset, reload, from, to]);
  return (
    <>
      <Link className="history-back" to={"/alumnos/" + id}>
        <ArrowLeft size={18} />
        Volver a {row?.projection.student.name || "la ficha"}
      </Link>
      <p className="eyebrow">LO QUE VA QUEDANDO</p>
      <h1>Historial y progreso</h1>
      <Progress
        studentId={id!}
        gender={
          (row?.projection.student as { gender?: string } | undefined)?.gender
        }
        refresh={reload}
      />
      <RoutineArchive
        studentId={id!}
        currentRevisionId={row?.projection.routine?.id}
        currentPeriodId={row?.projection.period?.id}
      />
      <section className="history-records" aria-label="Detalle de registros">
        <h2>Sesiones y registros</h2>
        <p className="muted">
          Consultá las series originales, exportá resultados o corregí un dato
          con su motivo. Los filtros siguientes afectan solo este detalle.
        </p>
        <LegacyHistory studentId={id!} />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="row blocks">
          <label className="field">
            Desde
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setOffset(0);
              }}
            />
          </label>
          <label className="field">
            Hasta
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setOffset(0);
              }}
            />
          </label>
        </div>
        <section className="card blocks">
          <h2>Asistencia reciente</h2>
          <p>
            Agenda descargada de los últimos 35 días:{" "}
            {row?.projection.visits.filter((v) => v.status === "closed")
              .length ?? 0}{" "}
            asistencias y{" "}
            {row?.projection.visits.filter((v) => v.status === "absent")
              .length ?? 0}{" "}
            inasistencias. Los turnos reprogramados no cuentan como faltas.
          </p>
        </section>
        <div className="row blocks">
          <button
            className="button secondary"
            disabled={recordsLoading || !!error}
            onClick={() => {
              const records = [
                [
                  "Fecha",
                  "Ejercicio",
                  "Serie",
                  "Peso kg",
                  "Repeticiones",
                  "Segundos",
                  "Origen",
                ],
                ...sessions.flatMap((s) =>
                  s.session_items
                    .filter((i) => !i.skipped)
                    .flatMap((i) =>
                      i.session_sets
                        .filter((x) => x.state === "done")
                        .map((set, n) => [
                          s.date,
                          i.name,
                          set.ordinal,
                          set.weight ?? "",
                          set.reps ?? "",
                          set.duration_sec ?? "",
                          set.source === "observed"
                            ? "Individual"
                            : "Confirmación rápida",
                        ]),
                    ),
                ),
              ];
              const blob = new Blob(
                [
                  "\uFEFF" +
                    records
                      .map((r) => r.map((x) => csvCell(String(x))).join(";"))
                      .join("\r\n"),
                ],
                { type: "text/csv;charset=utf-8" },
              );
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "pulso-resultados-pagina.csv";
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            Exportar resultados de esta página
          </button>
        </div>
        <div className="stack blocks">
          {sessions.map((s) => (
            <details className="card" key={s.id}>
              <summary>
                <strong>{s.date}</strong> · {s.session_items.length} ejercicios
              </summary>
              {s.session_items.map((i) => (
                <div className="exercise-editor" key={i.id}>
                  <h3>
                    {i.name}
                    {i.skipped ? " · Omitido" : ""}
                  </h3>
                  {i.session_sets.map((set, index) => (
                    <div className="set-row" key={set.id}>
                      <span>Serie {set.ordinal}</span>
                      <strong>
                        {set.state !== "done" ? (
                          "—"
                        ) : (
                          <>
                            {set.weight !== null ? set.weight + " kg · " : ""}
                            {i.type === "time"
                              ? set.duration_sec + " s"
                              : set.reps + " reps"}
                          </>
                        )}
                      </strong>
                      <small>
                        {set.state !== "done"
                          ? "No realizada"
                          : set.source === "quick_confirmed"
                            ? "Confirmación rápida"
                            : "Registro individual"}
                      </small>
                      {set.state === "done" && (
                        <button
                          className="link-button"
                          onClick={() => {
                            setCorrection({ session: s, item: i, set });
                            setField(
                              i.type === "time"
                                ? "durationSec"
                                : i.type === "reps"
                                  ? "reps"
                                  : "weight",
                            );
                            setValue(
                              String(
                                i.type === "time"
                                  ? set.duration_sec
                                  : i.type === "reps"
                                    ? set.reps
                                    : set.weight,
                              ),
                            );
                          }}
                        >
                          Corregir
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </details>
          ))}
        </div>
        <section className="card blocks">
          <h2>Registro de cambios</h2>
          {events.map((e) => (
            <details key={e.id} className="audit-row">
              <summary>
                {new Date(e.created_at).toLocaleString("es-AR")} ·{" "}
                {eventNames[e.kind] ?? "Cambio registrado"}
                {e.reason ? " · " + e.reason : ""}
              </summary>
              {e.captured_at &&
                Math.abs(Date.parse(e.created_at) - Date.parse(e.captured_at)) >
                  5000 && (
                  <p className="muted">
                    Anotado: {new Date(e.captured_at).toLocaleString("es-AR")} ·
                    recibido: {new Date(e.created_at).toLocaleString("es-AR")}
                  </p>
                )}
              {auditChanges(e.before_data, e.after_data).length ? (
                <ul>
                  {auditChanges(e.before_data, e.after_data).map(
                    (change, n) => (
                      <li key={n}>
                        {change.label}:{" "}
                        <strong>
                          {String(change.before)} → {String(change.after)}
                        </strong>
                      </li>
                    ),
                  )}
                </ul>
              ) : (
                <p>
                  Se conservó el registro de esta acción. Los resultados de cada
                  sesión se pueden consultar arriba.
                </p>
              )}
            </details>
          ))}
        </section>
        <div className="row blocks">
          <button
            className="button secondary"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - 20))}
          >
            Anterior
          </button>
          <button
            className="button secondary"
            disabled={sessions.length < 20 && events.length < 20}
            onClick={() => setOffset(offset + 20)}
          >
            Más registros
          </button>
        </div>
      </section>
      {correction && (
        <div className="modal-backdrop">
          <form
            className="card modal stack"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const parsed = parseNumber(field, value);
                if (!parsed.ok) throw Error("Ingresá un valor válido.");
                await onlineCommand(
                  id!,
                  "correct_result",
                  {
                    sessionId: correction.session.id,
                    itemId: correction.item.id,
                    setId: correction.set.id,
                    field,
                    value: parsed.value,
                    reason,
                  },
                  row!.confirmed.revision,
                );
                setCorrection(null);
                setReason("");
                setReload((x) => x + 1);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <h2>Corregir resultado</h2>
            <p>
              La rutina vigente no cambia. Quedan registrados el valor original
              y el motivo.
            </p>
            <label className="field">
              Campo
              <select
                value={field}
                onChange={(e) => setField(e.target.value as typeof field)}
              >
                {correction.item.type === "load_reps" && (
                  <option value="weight">Peso</option>
                )}
                {correction.item.type !== "time" && (
                  <option value="reps">Repeticiones</option>
                )}
                {correction.item.type === "time" && (
                  <option value="durationSec">Segundos</option>
                )}
              </select>
            </label>
            <label className="field">
              Valor
              <input
                inputMode="decimal"
                required
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </label>
            <label className="field">
              Motivo
              <input
                required
                minLength={3}
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <button className="button">Guardar corrección</button>
            <button
              type="button"
              className="link-button"
              onClick={() => setCorrection(null)}
            >
              Cancelar
            </button>
          </form>
        </div>
      )}
    </>
  );
}
