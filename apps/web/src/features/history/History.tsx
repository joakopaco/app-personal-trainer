import { auditChanges, eventNames } from "@pulso/domain/audit-display";
import { csvCell } from "@pulso/domain/metrics";
import { parseNumber } from "@pulso/domain/numbers";
import { LegacyHistory } from "./LegacyHistory";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { cloud } from "../../adapters/supabase";
import { useData } from "../../app/DataProvider";
import { volume } from "@pulso/domain/metrics";
type ResultSet = {
  id: string;
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
  const [exercise, setExercise] = useState(""),
    [from, setFrom] = useState(""),
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
    void (async () => {
      const a = await cloud()
        .from("sessions")
        .select(
          "id,date,ended_at,session_items(id,name,type,warmup,skipped,exercise_id,group,session_sets(id,state,source,weight,reps,duration_sec))",
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
      if (a.error || b.error) setError("No se pudo cargar el historial.");
      else {
        setSessions(a.data as unknown as ResultSession[]);
        setEvents(b.data);
      }
    })();
    return () => {
      active = false;
    };
  }, [id, offset, reload, from, to]);
  const eligible = (s: ResultSession) =>
    s.session_items
      .filter(
        (i) =>
          !i.skipped && !i.warmup && (!exercise || i.exercise_id === exercise),
      )
      .flatMap((i) =>
        i.session_sets
          .filter((st) => st.state === "done")
          .map((st) => ({
            ...st,
            type: i.type,
            group: i.group,
            warmup: false,
          })),
      );
  const points = sessions.map((s) => {
    const sets = eligible(s);
    const loaded = sets
      .filter(
        (x) => x.type === "load_reps" && x.weight !== null && x.reps !== null,
      )
      .sort((a, b) => b.weight! - a.weight! || b.reps! - a.reps!);
    return {
      date: s.date,
      volume: loaded.length ? volume(loaded) : null,
      sets: sets.length,
      reps: sets.reduce((n, x) => n + (x.reps ?? 0), 0),
      seconds: sets.reduce((n, x) => n + (x.duration_sec ?? 0), 0),
      best: loaded[0] ? loaded[0].weight + " kg × " + loaded[0].reps : "—",
    };
  });
  const selectedType = sessions
    .flatMap((s) => s.session_items)
    .find((i) => i.exercise_id === exercise)?.type;
  const max = Math.max(1, ...points.map((p) => p.volume ?? 0));
  const muscles = new Map<string, number>();
  for (const s of sessions)
    for (const set of eligible(s))
      muscles.set(set.group, (muscles.get(set.group) ?? 0) + 1);
  return (
    <>
      <Link to={"/alumnos/" + id}>← {row?.projection.student.name}</Link>
      <p className="eyebrow">LO QUE VA QUEDANDO</p>
      <h1>Historial y progreso</h1>
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
      <section className="card">
        <h2>Volumen de trabajo</h2>
        <label className="field">
          Comparar ejercicio
          <select
            value={exercise}
            onChange={(e) => setExercise(e.target.value)}
          >
            <option value="">Todos los ejercicios</option>
            {[
              ...new Map(
                sessions
                  .flatMap((s) => s.session_items)
                  .map((i) => [i.exercise_id, i.name]),
              ).entries(),
            ].map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <p className="muted">
          Carga × repeticiones de series confirmadas. Excluye calentamiento,
          omitidos y trabajo por tiempo.
        </p>
        {points.length ? (
          <>
            <div className="bar-chart" aria-hidden="true">
              {[...points]
                .reverse()
                .filter((p) => p.volume !== null)
                .map((p, i) => (
                  <div key={i}>
                    <span
                      style={{
                        height: Math.max(2, ((p.volume ?? 0) / max) * 140),
                      }}
                      title={p.volume + " kg·rep"}
                    />
                    <small>{p.date.slice(5)}</small>
                  </div>
                ))}
            </div>
            <div className="table-scroll">
              <table>
                <caption>Sesiones de esta página</caption>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Volumen (kg·rep)</th>
                    <th>Series</th>
                    <th>
                      {exercise
                        ? selectedType === "time"
                          ? "Segundos"
                          : selectedType === "reps"
                            ? "Repeticiones"
                            : "Mejor carga × reps"
                        : "Reps / segundos"}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {points.map((p, i) => (
                    <tr key={i}>
                      <td>{p.date}</td>
                      <td>{p.volume ?? "—"}</td>
                      <td>{p.sets}</td>
                      <td>
                        {exercise
                          ? selectedType === "time"
                            ? p.seconds
                            : selectedType === "reps"
                              ? p.reps
                              : p.best
                          : p.reps + " reps / " + p.seconds + " s"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="empty">
            Todavía no hay entrenamientos finalizados.
          </div>
        )}
      </section>
      <section className="card blocks">
        <h2>Series por músculo principal</h2>
        <p className="muted">
          Series de trabajo confirmadas en las sesiones de esta página; cada
          serie cuenta una vez. No incluye aproximación ni omitidos.
        </p>
        {muscles.size ? (
          <div className="stack">
            {[...muscles.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([group, count]) => (
                <div className="row" key={group}>
                  <span style={{ minWidth: 110 }}>{group}</span>
                  <meter
                    min={0}
                    max={Math.max(...muscles.values())}
                    value={count}
                    style={{ flex: 1 }}
                    aria-label={group}
                  />
                  <strong>{count}</strong>
                </div>
              ))}
          </div>
        ) : (
          <p>Sin series de trabajo registradas.</p>
        )}
      </section>
      <section className="card blocks">
        <h2>Asistencia reciente</h2>
        <p>
          Agenda descargada de los últimos 35 días:{" "}
          {row?.projection.visits.filter((v) => v.status === "closed").length ??
            0}{" "}
          asistencias y{" "}
          {row?.projection.visits.filter((v) => v.status === "absent").length ??
            0}{" "}
          inasistencias. Los turnos reprogramados no cuentan como faltas.
        </p>
      </section>
      <div className="row blocks">
        <button
          className="button secondary"
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
                        n + 1,
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
                    <span>Serie {index + 1}</span>
                    <strong>
                      {set.weight !== null ? set.weight + " kg · " : ""}
                      {i.type === "time"
                        ? set.duration_sec + " s"
                        : set.reps + " reps"}
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
                {auditChanges(e.before_data, e.after_data).map((change, n) => (
                  <li key={n}>
                    {change.label}:{" "}
                    <strong>
                      {String(change.before)} → {String(change.after)}
                    </strong>
                  </li>
                ))}
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
