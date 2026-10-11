import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronLeft, ChevronRight, X } from "lucide-react";
import { todayKey } from "@pulso/domain/dates";
import { useData } from "../../app/DataProvider";
import { LoadingState } from "../../components/LoadingState";
import { useAgendaRange } from "./useAgendaVisits";
import {
  calendarEntries,
  calendarStatus,
  countsAsTurn,
  monthDays,
  shiftMonth,
} from "./calendar";
import "./agenda.css";

const dateLabel = (date: string) =>
  new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(date + "T12:00:00"));

export function AgendaCalendar({
  initialDate,
  onClose,
  onOpenDay,
}: {
  initialDate: string;
  onClose: () => void;
  onOpenDay: (date: string) => void;
}) {
  const { rows } = useData();
  const today = todayKey();
  const [selected, setSelected] = useState(initialDate);
  const month = selected.slice(0, 7);
  const days = monthDays(month);
  const agenda = useAgendaRange(days[0], days.at(-1)!);
  const entries = calendarEntries(
    month,
    today,
    agenda.visits,
    rows.map((r) => r.projection),
  );
  const selectedEntries = entries.filter((v) => v.date === selected);
  const turnCount = selectedEntries.filter(countsAsTurn).length;
  const ready = !agenda.loading && !agenda.error;
  const offset = (new Date(days[0] + "T12:00:00Z").getUTCDay() + 6) % 7;
  const monthLabel = new Intl.DateTimeFormat("es-AR", {
    month: "long",
    year: "numeric",
  }).format(new Date(days[0] + "T12:00:00"));

  return (
    <div className="modal-backdrop">
      <section
        className="card modal agenda-calendar"
        role="dialog"
        aria-modal="true"
        aria-label="Calendario de alumnos"
      >
        <header className="calendar-heading">
          <div>
            <p className="eyebrow">Tu agenda</p>
            <h2>Calendario</h2>
          </div>
          <button className="button secondary" onClick={onClose}>
            <X size={18} aria-hidden="true" />
            Cerrar
          </button>
        </header>
        <p className="muted">Elegí un día para ver quién viene y a qué hora.</p>
        <div className="calendar-layout">
          <div>
            <div className="calendar-navigation">
              <button
                className="button secondary icon"
                aria-label="Mes anterior"
                onClick={() => setSelected(shiftMonth(month, -1) + "-01")}
              >
                <ChevronLeft size={20} />
              </button>
              <h3 aria-live="polite">{monthLabel}</h3>
              <button
                className="button secondary icon"
                aria-label="Mes siguiente"
                onClick={() => setSelected(shiftMonth(month, 1) + "-01")}
              >
                <ChevronRight size={20} />
              </button>
            </div>
            <div className="calendar-weekdays" aria-hidden="true">
              {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((name) => (
                <span key={name}>{name}</span>
              ))}
            </div>
            <div className="calendar-days" role="group" aria-label={monthLabel}>
              {Array.from({ length: offset }, (_, i) => (
                <span key={`empty-${i}`} />
              ))}
              {days.map((day) => {
                const count = entries.filter(
                  (v) => v.date === day && countsAsTurn(v),
                ).length;
                return (
                  <button
                    key={day}
                    className="calendar-day"
                    aria-pressed={selected === day}
                    aria-current={day === today ? "date" : undefined}
                    aria-label={`${dateLabel(day)}${ready ? `, ${count} ${count === 1 ? "turno" : "turnos"}` : ""}`}
                    onClick={() => setSelected(day)}
                  >
                    <span>{Number(day.slice(-2))}</span>
                    <small aria-hidden="true">
                      {ready && count ? count : "·"}
                    </small>
                  </button>
                );
              })}
            </div>
            <div className="calendar-legend">
              <small>El número indica los turnos del día.</small>
              <button
                className="button secondary"
                onClick={() => setSelected(today)}
              >
                Hoy
              </button>
            </div>
            {month > today.slice(0, 7) && (
              <p className="calendar-note">
                Los horarios habituales son una previsión según la agenda actual
                del alumno. Todavía no son visitas registradas.
              </p>
            )}
          </div>
          <section
            className="calendar-roster"
            aria-label="Alumnos del día"
            aria-busy={agenda.loading}
          >
            <h3 aria-live="polite">{dateLabel(selected)}</h3>
            {agenda.loading && <LoadingState label="Cargando calendario…" />}
            {agenda.error && (
              <div role="alert">
                <p className="error">{agenda.error}</p>
                <button className="button secondary" onClick={agenda.retry}>
                  Reintentar
                </button>
              </div>
            )}
            {ready && (
              <>
                <p className="muted">
                  {turnCount} {turnCount === 1 ? "turno" : "turnos"}
                </p>
                {selectedEntries.length ? (
                  <ul className="calendar-visits">
                    {selectedEntries.map((entry) => (
                      <li
                        key={entry.id}
                        className={
                          !countsAsTurn(entry)
                            ? "calendar-visit-inactive"
                            : undefined
                        }
                      >
                        <time>{entry.time.slice(0, 5)}</time>
                        <div>
                          <Link
                            to={`/alumnos/${entry.student.id}`}
                            onClick={onClose}
                          >
                            {entry.student.name}
                          </Link>
                          <small>{calendarStatus[entry.status]}</small>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="calendar-empty">
                    Sin alumnos programados para este día.
                  </div>
                )}
                {(selectedEntries.some((v) => v.status !== "habitual") ||
                  month <= today.slice(0, 7)) && (
                  <button
                    className="button calendar-open-day"
                    onClick={() => onOpenDay(selected)}
                  >
                    Ver agenda del día
                    <ArrowRight size={18} />
                  </button>
                )}
              </>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}
