import { LoadingState } from "../../components/LoadingState";
import { DateInput } from "../../components/DateInput";
import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Plus,
  ArrowRight,
  CalendarDays,
  CalendarClock,
  ChevronDown,
} from "lucide-react";
import { useData } from "../../app/DataProvider";
import { todayKey, currentTime } from "@pulso/domain/dates";
import {
  RescheduleVisit,
  visitDateLabel,
  type AgendaVisit,
} from "./RescheduleVisit";
import { useAgendaVisits } from "./useAgendaVisits";
import { PendingReschedules } from "./PendingReschedules";
export function Today() {
  const { rows, error, db, onlineCommand, makeCommand, sync } = useData();
  const navigate = useNavigate();
  const starting = useRef(false);
  const [search, setSearch] = useState("");
  const [dayMenuOpen, setDayMenuOpen] = useState(false);
  const [adding, setAdding] = useState(false),
    [studentId, setStudentId] = useState(""),
    [week, setWeek] = useState(
      Math.min(4, Math.ceil(Number(todayKey().slice(-2)) / 7)),
    ),
    [dayId, setDayId] = useState(""),
    [visitId, setVisitId] = useState<string | undefined>(),
    [failure, setFailure] = useState(""),
    [busy, setBusy] = useState(false),
    [date, setDate] = useState(todayKey());
  const active = rows.flatMap((r) =>
    r.projection.sessions.map((s) => ({
      student: r.projection.student,
      session: s,
    })),
  );
  const selected = rows.find((r) => r.studentId === studentId)?.projection;
  const agenda = useAgendaVisits(date);
  const { visits, allVisits } = agenda;
  async function start() {
    if (starting.current) return;
    starting.current = true;
    setBusy(true);
    setFailure("");
    try {
      let snapshot = rows.find((r) => r.studentId === studentId)!.projection;
      if (snapshot.period?.month !== todayKey().slice(0, 7)) {
        snapshot = await onlineCommand(
          studentId,
          "ensure_period",
          { requestedMonth: todayKey().slice(0, 7) },
          snapshot.revision,
        );
      }
      if (!snapshot.routine || !snapshot.period)
        throw Error("Prepará y activá una rutina para este alumno.");
      const day =
        snapshot.routine.document.weeks[week - 1].find((d) => d.id === dayId) ??
        snapshot.routine.document.weeks[week - 1][0];
      if (!day) throw Error("Esta semana no tiene días de entrenamiento.");
      const sessionId = crypto.randomUUID();
      const command = makeCommand(
        studentId,
        "start_session",
        {
          sessionId,
          visitId,
          periodId: snapshot.period.id,
          routineRevisionId: snapshot.routine.id,
          dayId: day.id,
          week,
          date: todayKey(),
          time: currentTime(),
          timezone: "America/Argentina/Buenos_Aires",
        },
        snapshot.revision,
      );
      await db.stage(command);
      void sync();
      navigate("/entrenar/" + studentId);
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      starting.current = false;
      setBusy(false);
    }
  }
  async function absence(studentId: string, id: string) {
    setFailure("");
    try {
      const row = rows.find((r) => r.studentId === studentId)!;
      await onlineCommand(
        studentId,
        "mark_absent",
        { visitId: id },
        row.confirmed.revision,
      );
    } catch (e) {
      setFailure((e as Error).message);
    }
  }
  const [reschedule, setReschedule] = useState<
    (AgendaVisit & { name: string }) | null
  >(null);
  const [confirmation, setConfirmation] = useState("");
  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">
            {new Intl.DateTimeFormat("es-AR", {
              weekday: "long",
              day: "numeric",
              month: "long",
            }).format(new Date(date + "T12:00:00"))}
          </p>
          <h1>Hoy, con vos.</h1>
          <p className="muted">
            Tu atención en las personas. Cada avance, registrado.
          </p>
        </div>
        <button
          className="button"
          onClick={() => {
            setStudentId("");
            setDayId("");
            setSearch("");
            setFailure("");
            setAdding(true);
            setVisitId(undefined);
          }}
        >
          <Plus size={18} />
          Agregar ahora
        </button>
      </header>
      {error && <p className="notice">{error}</p>}
      {failure && (
        <p role="alert" className="error">
          {failure}
        </p>
      )}
      <section>
        <div className="row spread section-heading">
          <h2>
            Entrenando ahora <span className="count">{active.length}</span>
          </h2>
          <small>Tu espacio de seguimiento</small>
        </div>
        {active.length ? (
          <div className="grid">
            {active.map(({ student, session }) => (
              <Link
                className="card active-card student-card"
                key={session.id}
                to={"/entrenar/" + student.id}
              >
                <div className="row">
                  <div className="avatar">
                    {student.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h3>{student.name}</h3>
                    <small>
                      {
                        session.items.filter((i) =>
                          i.sets.some((s) => s.state === "done"),
                        ).length
                      }{" "}
                      de {session.items.length} ejercicios con registro
                    </small>
                  </div>
                </div>
                <div className="row spread">
                  <span className="badge">En curso</span>
                  <ArrowRight size={18} />
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="card empty">
            <CalendarDays size={32} />
            <h2>Listo para acompañar</h2>
            <p>Iniciá desde la agenda o agregá a quien acaba de llegar.</p>
          </div>
        )}
      </section>
      <section className="agenda-section">
        <PendingReschedules onResume={setReschedule} />
        {confirmation && (
          <p className="notice agenda-confirmation" role="status">
            {confirmation}
          </p>
        )}
        <div className="row spread section-heading">
          <h2>Agenda del día</h2>
          <div className="agenda-date-controls">
            {date !== todayKey() && (
              <button
                className="button secondary small"
                onClick={() => setDate(todayKey())}
              >
                Volver a hoy
              </button>
            )}
            <label className="field">
              <span className="sr-only">Fecha de agenda</span>
              <DateInput
                aria-label="Fecha de agenda"
                value={date}
                onChange={(e) => {
                  if (e.target.value) setDate(e.target.value);
                }}
              />
            </label>
          </div>
        </div>
        {agenda.loading && <LoadingState label="Cargando agenda…" />}
        {agenda.error && (
          <div className="error" role="alert">
            {agenda.error}{" "}
            <button className="button secondary small" onClick={agenda.retry}>
              Reintentar
            </button>
          </div>
        )}
        <div className="card agenda-list">
          {visits.map((v) => (
            <div className="agenda-row" key={v.id}>
              <span className="time">{v.time.slice(0, 5)}</span>
              <div className="avatar">
                {v.student.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="agenda-person">
                <Link to={"/alumnos/" + v.student.id}>{v.student.name}</Link>
                <small>
                  {
                    {
                      pending: "Pendiente",
                      open: "Entrenando",
                      closed: "Finalizado",
                      absent: "No asistió",
                      rescheduled: "Reprogramado",
                      cancelled: "Cancelado",
                    }[v.status]
                  }
                </small>
                {v.rescheduled_from && (
                  <small>
                    Visita reprogramada
                    {(() => {
                      const original = allVisits.find(
                        (original) => original.id === v.rescheduled_from,
                      );
                      return original
                        ? ` desde el ${visitDateLabel(original.date)} a las ${original.time.slice(0, 5)}`
                        : "";
                    })()}
                  </small>
                )}
                {v.status === "rescheduled" &&
                  (() => {
                    const destination = allVisits.find(
                      (destination) => destination.rescheduled_from === v.id,
                    );
                    return destination ? (
                      <button
                        className="agenda-move-link"
                        onClick={() => setDate(destination.date)}
                      >
                        Ver nuevo turno: {visitDateLabel(destination.date)} ·{" "}
                        {destination.time.slice(0, 5)}
                      </button>
                    ) : null;
                  })()}
              </div>
              {v.status === "pending" && (
                <div className="row">
                  <button
                    className="button small"
                    disabled={date !== todayKey()}
                    onClick={() => {
                      setFailure("");
                      setDayId("");
                      setStudentId(v.student.id);
                      setVisitId(v.id);
                      setAdding(true);
                    }}
                  >
                    Iniciar
                  </button>
                  <button
                    className="link-button"
                    onClick={() => void absence(v.student.id, v.id)}
                  >
                    No asistió
                  </button>
                  <button
                    className="button secondary small"
                    aria-label={"Reprogramar a " + v.student.name}
                    onClick={() =>
                      setReschedule({ ...v, name: v.student.name })
                    }
                  >
                    <CalendarClock size={16} /> Reprogramar
                  </button>
                  <button
                    className="link-button"
                    onClick={async () => {
                      try {
                        const row = rows.find(
                          (r) => r.studentId === v.student.id,
                        )!;
                        await onlineCommand(
                          v.student.id,
                          "cancel_visit",
                          { visitId: v.id },
                          row.confirmed.revision,
                        );
                      } catch (e) {
                        setFailure((e as Error).message);
                      }
                    }}
                  >
                    Cancelar turno
                  </button>
                </div>
              )}
            </div>
          ))}
          {!visits.length && !agenda.loading && !agenda.error && (
            <div className="empty">
              No hay visitas programadas para este día.
              <br />
              <Link to="/alumnos">Organizar horarios de alumnos</Link>
            </div>
          )}
        </div>
      </section>
      {adding && (
        <div className="modal-backdrop">
          <section
            className="card modal stack arrival-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Agregar entrenamiento"
          >
            <div className="row spread">
              <h2>Empezar ahora</h2>
              <button
                className="button secondary small"
                disabled={busy}
                onClick={() => setAdding(false)}
              >
                Cerrar
              </button>
            </div>
            {!selected ? (
              <>
                <label className="field">
                  Buscar alumno
                  <input
                    type="search"
                    value={search}
                    placeholder="Nombre del alumno"
                    onChange={(e) => setSearch(e.target.value)}
                    autoComplete="off"
                  />
                </label>
                <div
                  className="arrival-students"
                  aria-label="Alumnos disponibles"
                >
                  {rows
                    .filter(
                      (r) =>
                        !r.projection.student.archived &&
                        !r.projection.sessions.length &&
                        r.projection.student.name
                          .toLocaleLowerCase()
                          .includes(search.toLocaleLowerCase().trim()),
                    )
                    .map((r) => (
                      <button
                        key={r.studentId}
                        className="arrival-student"
                        aria-label={r.projection.student.name}
                        onClick={() => {
                          setStudentId(r.studentId);
                          setDayId("");
                          setVisitId(undefined);
                          setFailure("");
                        }}
                      >
                        <span className="avatar" aria-hidden="true">
                          {r.projection.student.name.slice(0, 2).toUpperCase()}
                        </span>
                        <span>
                          <strong>{r.projection.student.name}</strong>
                          <small>
                            {r.projection.routine
                              ? "Elegir rutina del día"
                              : "Sin rutina activa"}
                          </small>
                        </span>
                        <ArrowRight size={18} aria-hidden="true" />
                      </button>
                    ))}
                  {!rows.some(
                    (r) =>
                      !r.projection.student.archived &&
                      !r.projection.sessions.length &&
                      r.projection.student.name
                        .toLocaleLowerCase()
                        .includes(search.toLocaleLowerCase().trim()),
                  ) && (
                    <p className="muted">
                      No hay alumnos disponibles con ese nombre. Quienes ya
                      están entrenando aparecen en Hoy.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="arrival-selected">
                  <div>
                    <small>Alumno</small>
                    <strong>{selected.student.name}</strong>
                  </div>
                  <button
                    className="button secondary small"
                    disabled={busy}
                    onClick={() => {
                      setStudentId("");
                      setVisitId(undefined);
                    }}
                  >
                    Cambiar alumno
                  </button>
                </div>
                {selected.routine && (
                  <>
                    <fieldset className="arrival-choice">
                      <legend>Semana</legend>
                      <div className="arrival-weeks">
                        {[1, 2, 3, 4].map((w) => (
                          <button
                            key={w}
                            className={
                              "button " + (week === w ? "" : "secondary")
                            }
                            aria-label={"Semana " + w}
                            aria-pressed={week === w}
                            disabled={busy}
                            onClick={() => {
                              setWeek(w);
                              setDayId("");
                              setDayMenuOpen(false);
                            }}
                          >
                            {w}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                    <fieldset className="arrival-choice">
                      <legend>Día de rutina</legend>
                      <button
                        className="button secondary arrival-day-trigger"
                        type="button"
                        aria-expanded={dayMenuOpen}
                        aria-controls="arrival-day-options"
                        disabled={busy}
                        onClick={() => setDayMenuOpen(!dayMenuOpen)}
                      >
                        {selected.routine.document.weeks[week - 1].length
                          ? `Día ${
                              Math.max(
                                0,
                                selected.routine.document.weeks[
                                  week - 1
                                ].findIndex((d) => d.id === dayId),
                              ) + 1
                            }`
                          : "Sin días disponibles"}
                        <ChevronDown size={20} aria-hidden="true" />
                      </button>
                      {dayMenuOpen && (
                        <div
                          className="arrival-days arrival-day-options"
                          id="arrival-day-options"
                        >
                          {selected.routine.document.weeks[week - 1].map(
                            (d, dayIndex) => (
                              <button
                                key={d.id}
                                className={
                                  "button " +
                                  ((dayId ||
                                    selected.routine!.document.weeks[
                                      week - 1
                                    ][0]?.id) === d.id
                                    ? ""
                                    : "secondary")
                                }
                                aria-pressed={
                                  (dayId ||
                                    selected.routine!.document.weeks[
                                      week - 1
                                    ][0]?.id) === d.id
                                }
                                disabled={busy}
                                onClick={() => {
                                  setDayId(d.id);
                                  setDayMenuOpen(false);
                                }}
                              >
                                Día {dayIndex + 1}
                              </button>
                            ),
                          )}
                        </div>
                      )}
                      {selected.routine.document.weeks[week - 1].length ===
                        1 && (
                        <small className="muted">
                          Esta semana tiene un solo día de rutina configurado.
                        </small>
                      )}
                    </fieldset>
                  </>
                )}
              </>
            )}
            {studentId && !selected?.routine && (
              <p className="notice">
                Este alumno necesita una{" "}
                <Link to={"/alumnos/" + studentId + "/rutina"}>
                  rutina activa
                </Link>
                .
              </p>
            )}
            {failure && (
              <p role="alert" className="error">
                {failure}
              </p>
            )}
            <button
              className="button"
              disabled={
                busy ||
                !studentId ||
                !selected?.routine?.document.weeks[week - 1].length
              }
              onClick={start}
            >
              {busy ? "Iniciando…" : "Iniciar entrenamiento"}
            </button>
            <small>
              Hora actual {currentTime()}. Esta llegada no cambia el horario
              semanal.
            </small>
          </section>
        </div>
      )}
      {reschedule && (
        <RescheduleVisit
          visit={reschedule}
          name={reschedule.name}
          onClose={() => setReschedule(null)}
          onSaved={(newDate, newTime) => {
            setConfirmation(
              `${reschedule.name}: visita reprogramada para el ${visitDateLabel(newDate)} a las ${newTime}. Su horario habitual se mantiene.`,
            );
            setDate(newDate);
            setReschedule(null);
          }}
        />
      )}
    </>
  );
}
