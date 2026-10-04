import { auditChanges, eventNames } from "@pulso/domain/audit-display";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { cloud } from "../../adapters/supabase";
import { useData } from "../../app/DataProvider";
import { StudentHeader } from "../students/StudentHeader";
import "./history.css";
type AuditEvent = {
  id: string;
  kind: string;
  created_at: string;
  captured_at: string;
  reason: string | null;
  before_data: unknown;
  after_data: unknown;
};
export function History() {
  const { id } = useParams();
  const { rows } = useData();
  const row = rows.find((r) => r.studentId === id);
  const [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const [events, setEvents] = useState<AuditEvent[]>([]),
    [error, setError] = useState("");
  const [loading, setLoading] = useState(true),
    [offset, setOffset] = useState(0),
    [retry, setRetry] = useState(0),
    [hasMore, setHasMore] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setEvents([]);
    setHasMore(false);
    if (from && to && from > to) {
      setError("La fecha inicial debe ser anterior o igual a la final.");
      setLoading(false);
      return;
    }
    void (async () => {
      try {
        const result = await cloud()
          .from("audit_events")
          .select(
            "id,kind,created_at,captured_at,reason,before_data,after_data",
          )
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
          .range(offset, offset + 20);
        if (result.error) throw result.error;
        if (active) {
          setEvents(result.data.slice(0, 20));
          setHasMore(result.data.length > 20);
        }
      } catch {
        if (active)
          setError(
            "No se pudo cargar el registro de cambios. Reintentá en unos instantes.",
          );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id, from, to, offset, retry]);
  if (!row) return <p role="status">Cargando alumno…</p>;
  const today = new Date(),
    since = new Date();
  since.setDate(today.getDate() - 34);
  const localDate = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const visits = row.projection.visits.filter(
    (visit) => visit.date >= localDate(since) && visit.date <= localDate(today),
  );
  return (
    <div className="student-page history-page">
      <StudentHeader data={row.projection} />
      <section className="card history-attendance">
        <h2>Asistencia reciente</h2>
        <p className="muted">
          Últimos 35 días · Los turnos reprogramados no cuentan como faltas.
        </p>
        <div className="attendance-totals">
          <div>
            <strong>
              {visits.filter((v) => v.status === "closed").length}
            </strong>
            <span>Asistencias</span>
          </div>
          <div>
            <strong>
              {visits.filter((v) => v.status === "absent").length}
            </strong>
            <span>Inasistencias</span>
          </div>
        </div>
      </section>
      <section className="card history-audit" aria-label="Registro de cambios">
        <h2>Registro de cambios</h2>
        <p className="muted">
          Consultá qué se modificó y cuándo. Abrí un cambio para ver sus
          valores.
        </p>
        <div className="row history-dates">
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
        {loading && <p role="status">Cargando cambios…</p>}
        {error && (
          <div className="stack">
            <p className="error" role="alert">
              {error}
            </p>
            <button
              className="button secondary"
              onClick={() => setRetry((n) => n + 1)}
            >
              Reintentar
            </button>
          </div>
        )}
        {!loading && !error && !events.length && (
          <p className="history-empty">
            No hay cambios registrados en este período.
          </p>
        )}
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
              <p>Esta acción quedó registrada en la ficha del alumno.</p>
            )}
          </details>
        ))}

        {(offset > 0 || hasMore) && (
          <div className="student-routine-actions history-pagination">
            <button
              className="button secondary"
              disabled={loading || offset === 0}
              onClick={() => setOffset(Math.max(0, offset - 20))}
            >
              Anterior
            </button>
            <span>Página {offset / 20 + 1}</span>
            <button
              className="button secondary"
              disabled={loading || !hasMore}
              onClick={() => setOffset(offset + 20)}
            >
              Más cambios
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
