import { DateInput } from "../../components/DateInput";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { CalendarClock } from "lucide-react";
import type { CommandEnvelope, StudentSnapshot } from "@pulso/domain/contracts";
import { todayKey } from "@pulso/domain/dates";
import { useData } from "../../app/DataProvider";
import "./agenda.css";

export type AgendaVisit = StudentSnapshot["visits"][number];
export function visitDateLabel(date: string) {
  return new Date(date + "T12:00:00").toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function RescheduleVisit({
  visit,
  name,
  onClose,
  onSaved,
}: {
  visit: AgendaVisit;
  name: string;
  onClose: () => void;
  onSaved: (date: string, time: string) => void;
}) {
  const { rows, db, onlineCommand } = useData();
  const [date, setDate] = useState(visit.date);
  const [time, setTime] = useState(visit.time.slice(0, 5));
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [retry, setRetry] = useState(false);
  const [error, setError] = useState("");
  // Keep the destination ID and payload stable when a response is lost.
  const attempt = useRef<Record<string, unknown> | null>(null);
  const submitting = useRef(false);
  useEffect(() => {
    let active = true;
    void db.meta
      .get("admin:" + visit.student_id)
      .then((entry) => {
        if (!active) return;
        const pending = entry?.value as CommandEnvelope | undefined;
        if (
          pending?.kind === "reschedule_visit" &&
          pending.payload.visitId === visit.id
        ) {
          attempt.current = pending.payload;
          setDate(String(pending.payload.date));
          setTime(String(pending.payload.time));
          setRetry(true);
        }
        setChecking(false);
      })
      .catch(() => {
        if (active)
          setError(
            "No se pudo revisar el guardado. Cerrá y volvé a abrir la visita.",
          );
      });
    return () => {
      active = false;
    };
  }, [db, visit.id, visit.student_id]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current || checking) return;
    setError("");
    if (!retry && date === visit.date && time === visit.time.slice(0, 5)) {
      setError("Elegí una fecha u hora diferente a la visita actual.");
      return;
    }
    if (!retry && date < todayKey()) {
      setError("Elegí hoy o una fecha posterior.");
      return;
    }
    const row = rows.find((r) => r.studentId === visit.student_id);
    if (!row) return;
    submitting.current = true;
    setBusy(true);
    const payload = attempt.current ?? {
      visitId: visit.id,
      newVisitId: crypto.randomUUID(),
      date,
      time,
    };
    attempt.current = payload;
    try {
      await onlineCommand(
        visit.student_id,
        "reschedule_visit",
        payload,
        row.confirmed.revision,
      );
      onSaved(String(payload.date), String(payload.time));
    } catch (e) {
      setError((e as Error).message);
      // A network failure retains the command for an idempotent retry. A
      // canonical rejection clears it, allowing the trainer to correct it.
      try {
        const pending = await db.meta.get("admin:" + visit.student_id);
        const command = pending?.value as CommandEnvelope | undefined;
        const retained =
          command?.kind === "reschedule_visit" &&
          command.payload.visitId === visit.id;
        setRetry(Boolean(retained));
        attempt.current = retained ? command.payload : null;
      } catch {
        setRetry(true);
      }
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="modal-backdrop">
      <form
        className="card modal stack reschedule-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Reprogramar visita"
        onSubmit={submit}
      >
        <div className="row spread">
          <h2>
            <CalendarClock size={22} /> Reprogramar visita
          </h2>
          <button
            type="button"
            className="button secondary small"
            disabled={busy}
            onClick={onClose}
          >
            Cerrar
          </button>
        </div>
        <p className="reschedule-student">{name}</p>
        <div className="reschedule-original">
          <span>Visita actual</span>
          <strong>
            {visitDateLabel(visit.date)} · {visit.time.slice(0, 5)}
          </strong>
        </div>
        <div className="reschedule-fields">
          <label className="field">
            Fecha de esta visita
            <DateInput
              aria-label="Fecha de esta visita"
              required
              min={retry ? undefined : todayKey()}
              value={date}
              disabled={busy || checking || retry}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="field">
            Horario de esta visita
            <input
              type="time"
              required
              value={time}
              disabled={busy || checking || retry}
              onChange={(e) => setTime(e.target.value)}
            />
          </label>
        </div>
        <p className="reschedule-help">
          Para cambiar solo la hora, conservá la fecha. Este cambio se aplica
          únicamente a esta visita; los días y horarios habituales del alumno se
          mantienen.
        </p>
        {retry && (
          <p className="notice">
            Falta confirmar el cambio a {visitDateLabel(date)} a las {time}.
            Reintentá para comprobar el guardado sin duplicar el turno.
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="row reschedule-actions">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={onClose}
          >
            Volver
          </button>
          <button
            type="submit"
            className="button"
            disabled={busy || checking || !date || !time}
          >
            {busy
              ? "Guardando…"
              : retry
                ? "Reintentar reprogramación"
                : "Reprogramar"}
          </button>
        </div>
      </form>
    </div>
  );
}
