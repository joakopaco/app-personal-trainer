import { StudentHeader } from "./StudentHeader";
import { RoutineArchive } from "../history/RoutineArchive";
import { ExportRoutine } from "../routines/ExportRoutine";
import { SaveStudentTemplate } from "../routines/SaveStudentTemplate";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Plus,
  ArrowUpRight,
  CalendarDays,
  Pencil,
  TrendingUp,
  ClipboardList,
} from "lucide-react";
import { useData } from "../../app/DataProvider";
import { StudentForm, weekdays, genders } from "./StudentForm";
import "./students.css";
function monthLabel(month: string) {
  return new Intl.DateTimeFormat("es-AR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(month + "-01T12:00:00Z"));
}
export function StudentList() {
  const { rows, error, onlineCommand } = useData(),
    navigate = useNavigate();
  const [search, setSearch] = useState(""),
    [form, setForm] = useState(false),
    [showArchived, setShowArchived] = useState(false),
    [id, setId] = useState(() => crypto.randomUUID());
  const filtered = rows.filter(
    (r) =>
      (showArchived || !r.projection.student.archived) &&
      r.projection.student.name
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase()),
  );
  return (
    <div className="student-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">TU EQUIPO, PERSONA A PERSONA</p>
          <h1>Alumnos</h1>
          <p className="muted">
            Rutinas, entrenamiento e historia en un mismo lugar.
          </p>
        </div>
        <button className="button" onClick={() => setForm(!form)}>
          <Plus size={18} />
          Agregar alumno
        </button>
      </header>
      {error && <p className="notice">{error}</p>}
      {form && (
        <StudentForm
          onCancel={() => setForm(false)}
          onSave={async (payload) => {
            await onlineCommand(id, "create_student", payload, 0);
            setForm(false);
            setId(crypto.randomUUID());
            navigate("/alumnos/" + id);
          }}
        />
      )}
      <div className="student-search">
        <label className="field">
          Buscar alumno
          <input
            type="search"
            placeholder="Nombre del alumno…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="row">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Mostrar alumnos archivados
        </label>
      </div>
      <div className="grid">
        {filtered.map(({ projection: s }) => (
          <Link
            className="card student-card"
            key={s.student.id}
            to={"/alumnos/" + s.student.id}
          >
            <div className="row spread">
              <div className="row">
                <div className="avatar">
                  {s.student.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3>
                    {s.student.name}
                    {s.student.archived ? " · Archivado" : ""}
                  </h3>
                  <small>
                    {s.routine?.document.name ?? "Sin rutina asignada"}
                  </small>
                </div>
              </div>
              <ArrowUpRight size={18} />
            </div>
            <hr className="separator" />
            <span className="badge">
              {s.sessions.length
                ? "Entrenando ahora"
                : s.period
                  ? "Rutina activa"
                  : "Listo para empezar"}
            </span>
          </Link>
        ))}
      </div>
      {!filtered.length && (
        <div className="card empty">
          <h2>
            {search
              ? "No encontramos alumnos"
              : "Tu próximo progreso empieza acá"}
          </h2>
          <p>
            {search
              ? "Probá con otro nombre."
              : "Agregá un alumno para preparar su primera rutina."}
          </p>
        </div>
      )}
    </div>
  );
}
export function StudentProfile() {
  const { id } = useParams(),
    { rows, onlineCommand } = useData();
  const row = rows.find((r) => r.studentId === id);
  const data = row?.projection;
  const [error, setError] = useState(""),
    [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false);
  if (!data) return <p>Cargando alumno…</p>;
  const s = data.student,
    routine = data.routine?.document,
    schedule = data.schedule;
  return (
    <div className="student-page student-profile">
      <StudentHeader data={data} />
      <div className="student-section-toolbar">
        <h2>Información y rutinas</h2>
        <button
          className="button secondary"
          onClick={() => setEditing(!editing)}
        >
          <Pencil size={16} />
          Editar ficha
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {editing && (
        <StudentForm
          key={s.id}
          initial={data}
          onCancel={() => setEditing(false)}
          onSave={async (payload, openingRevision) => {
            await onlineCommand(
              s.id,
              "update_student",
              payload,
              openingRevision ?? data.revision,
            );
            setEditing(false);
          }}
        />
      )}
      <div className="student-profile-grid">
        <aside
          className="card student-information"
          aria-label="Información del alumno"
        >
          <h2>Información del alumno</h2>
          <dl className="student-facts">
            <div>
              <dt>Nombre</dt>
              <dd>{s.first_name || s.name}</dd>
            </div>
            {s.last_name && (
              <div>
                <dt>Apellido</dt>
                <dd>{s.last_name}</dd>
              </div>
            )}
            <div>
              <dt>Género</dt>
              <dd>{genders[s.gender || ""] || "Sin indicar"}</dd>
            </div>
            <div>
              <dt>Frecuencia</dt>
              <dd>
                {schedule?.weekdays.length
                  ? `${schedule.weekdays.length} días por semana`
                  : "Sin horario fijo"}
              </dd>
            </div>
          </dl>
          <h3 className="student-schedule-title">
            <CalendarDays size={18} />
            Días y horarios
          </h3>
          {schedule?.weekdays.length ? (
            <ul className="student-schedule-list">
              {[...schedule.weekdays].sort().map((day) => (
                <li key={day}>
                  <span>{weekdays[day - 1]}</span>
                  <strong>
                    {schedule.day_times[String(day)] ||
                      schedule.time.slice(0, 5)}
                  </strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">
              Podés definirlos desde Editar ficha o agregar visitas desde Hoy.
            </p>
          )}
          <Link className="button secondary" to={"/progreso/" + s.id}>
            <TrendingUp size={18} />
            Ver progreso
          </Link>
          {s.notes && (
            <div className="student-private-notes">
              <h3>Notas privadas</h3>
              <p className="student-notes">{s.notes}</p>
            </div>
          )}
        </aside>
        <div className="student-side-stack">
          <section className="card student-routine-summary">
            <div className="row spread">
              <div className="row">
                <ClipboardList size={21} />
                <h2>Rutina actual</h2>
              </div>
              {data.period && <span className="badge">En curso</span>}
            </div>
            {routine ? (
              <>
                <h3>{routine.name}</h3>
                <p className="muted">
                  4 semanas · {routine.weeks[0].length}{" "}
                  {routine.weeks[0].length === 1 ? "día" : "días"} en la primera
                  semana
                </p>
                <div className="student-routine-days">
                  {routine.weeks[0].map((day, index) => (
                    <div key={day.id}>
                      <span className="student-day-number">{index + 1}</span>
                      <div>
                        <strong>{day.name}</strong>
                        <small>
                          {day.blocks.length}{" "}
                          {day.blocks.length === 1 ? "bloque" : "bloques"} ·{" "}
                          {day.blocks.reduce(
                            (n, b) => n + b.exercises.length,
                            0,
                          )}{" "}
                          ejercicios
                        </small>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="student-routine-actions">
                  <Link
                    className="button"
                    to={"/alumnos/" + s.id + "/rutina?nueva=1"}
                  >
                    <Plus size={18} /> Nueva rutina
                  </Link>
                  <Link
                    className="button secondary"
                    to={"/alumnos/" + s.id + "/rutina"}
                  >
                    Ver rutina
                    <ArrowUpRight size={18} />
                  </Link>
                  {routine && (
                    <ExportRoutine
                      document={routine}
                      student={s.name}
                      month={
                        data.period ? monthLabel(data.period.month) : undefined
                      }
                    />
                  )}
                  {row?.confirmed.routine && (
                    <SaveStudentTemplate
                      document={row.confirmed.routine.document}
                    />
                  )}
                </div>
              </>
            ) : (
              <>
                <p className="muted">
                  Todavía no tiene una rutina. Prepará los días y bloques de
                  entrenamiento para este mes.
                </p>
                <Link className="button" to={"/alumnos/" + s.id + "/rutina"}>
                  <Plus size={18} />
                  Preparar rutina
                </Link>
              </>
            )}
          </section>
          <RoutineArchive
            studentId={s.id}
            currentRevisionId={data.routine?.id}
            studentName={s.name}
          />
        </div>
      </div>
      <footer className="student-profile-footer">
        <button
          className="button secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await onlineCommand(
                s.id,
                "archive_student",
                { archived: !s.archived },
                data.revision,
              );
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {s.archived ? "Restaurar alumno" : "Archivar alumno"}
        </button>
        <small>El historial y las rutinas se conservan al archivar.</small>
      </footer>
    </div>
  );
}
