import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronLeft, ChevronRight, X } from "lucide-react";
import { todayKey } from "@pulso/domain/dates";
import { useData } from "../../app/DataProvider";
import { LoadingState } from "../../components/LoadingState";
import { useAgendaRange } from "./useAgendaVisits";
import {
  calendarStatus,
  countsAsTurn,
  weekDays,
  weekEntries,
  shiftDate,
} from "./calendar";
import "./agenda.css";

const dateLabel = (date: string) =>
  new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(date + "T12:00:00"));
const weekdays = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

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
  const days = weekDays(selected);
  const agenda = useAgendaRange(days[0], days[6]);
  const entries = weekEntries(
    selected,
    today,
    agenda.visits,
    rows.map((r) => r.projection),
  );
  const selectedEntries = entries.filter((v) => v.date === selected);
  const turnCount = selectedEntries.filter(countsAsTurn).length;
  const ready = !agenda.loading && !agenda.error;
  const weekLabel = new Intl.DateTimeFormat("es-AR", {
    month: "short",
    year: "numeric",
  }).formatRange(
    new Date(days[0] + "T12:00:00"),
    new Date(days[6] + "T12:00:00"),
  );

  return (
    <div className="modal-backdrop calendar-backdrop">
      <section
        className="card modal agenda-calendar"
        role="dialog"
        aria-modal="true"
        aria-label="Calendario de alumnos"
      >
        <header className="calendar-heading">
          <h2>Calendario</h2>
          <button
            className="button secondary icon-button calendar-close"
            data-dialog-close
            aria-label="Cerrar calendario"
            title="Cerrar"
            onClick={onClose}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        <div className="calendar-navigation">
          <h3 aria-live="polite">{weekLabel}</h3>
          <div className="calendar-controls">
            <button
              className="button secondary calendar-today"
              onClick={() => setSelected(today)}
            >
              Hoy
            </button>
            <button
              className="button secondary icon-button"
              aria-label="Semana anterior"
              onClick={() => setSelected(shiftDate(selected, -7))}
            >
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <button
              className="button secondary icon-button"
              aria-label="Semana siguiente"
              onClick={() => setSelected(shiftDate(selected, 7))}
            >
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
        <div
          className="calendar-days"
          role="group"
          aria-label="Días de la semana"
        >
          {days.map((day, index) => {
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
                <small>{weekdays[index]}</small>
                <span>{Number(day.slice(-2))}</span>
                <i
                  className={
                    ready && count ? "calendar-dot has-visits" : "calendar-dot"
                  }
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>
        <section
          className="calendar-roster"
          aria-label="Alumnos del día"
          aria-busy={agenda.loading}
        >
          <div className="calendar-day-heading">
            <h3 aria-live="polite">{dateLabel(selected)}</h3>
            {ready && (
              <span>
                {turnCount} {turnCount === 1 ? "turno" : "turnos"}
              </span>
            )}
          </div>
          {agenda.loading && <LoadingState label="Cargando agenda…" />}
          {agenda.error && (
            <div role="alert">
              <p className="error">{agenda.error}</p>
              <button className="button secondary small" onClick={agenda.retry}>
                Reintentar
              </button>
            </div>
          )}
          {ready && (
            <>
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
              {selectedEntries.some((v) => v.status === "habitual") && (
                <p className="calendar-note">
                  Los horarios habituales son una previsión; todavía no son
                  visitas registradas.
                </p>
              )}
            </>
          )}
        </section>
        {ready &&
          (selectedEntries.some((v) => v.status !== "habitual") ||
            selected.slice(0, 7) <= today.slice(0, 7)) && (
            <footer className="calendar-footer">
              <button
                className="button secondary calendar-open-day"
                onClick={() => onOpenDay(selected)}
              >
                Ver agenda del día <ArrowRight size={16} aria-hidden="true" />
              </button>
            </footer>
          )}
      </section>
    </div>
  );
}
