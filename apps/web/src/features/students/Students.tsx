import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Plus,
  ArrowUpRight,
  ArrowLeft,
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
                  ? monthLabel(s.period.month)
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
  const data = rows.find((r) => r.studentId === id)?.projection;
  const [error, setError] = useState(""),
    [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false);
  if (!data) return <p>Cargando alumno…</p>;
  const s = data.student,
    routine = data.routine?.document,
    schedule = data.schedule;
  return (
    <div className="student-page student-profile">
      <Link className="student-back" to="/alumnos">
        <ArrowLeft size={18} />
        Volver a alumnos
      </Link>
      <header className="page-heading">
        <div>
          <p className="eyebrow">FICHA DEL ALUMNO</p>
          <h1>{s.name}</h1>
          <div className="row muted">
            <span>
              {!s.gender || s.gender === "no_especificado"
                ? "Género sin indicar"
                : genders[s.gender]}
            </span>
            <span>·</span>
            <span>
              {schedule?.weekdays.length
                ? `${schedule.weekdays.length} ${schedule.weekdays.length === 1 ? "día" : "días"} por semana`
                : "Sin horario fijo"}
            </span>
            {s.archived && <span className="badge">Archivado</span>}
          </div>
        </div>
        <button
          className="button secondary"
          onClick={() => setEditing(!editing)}
        >
          <Pencil size={16} />
          Editar ficha
        </button>
      </header>
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
        <section className="card student-routine-summary">
          <div className="row spread">
            <div className="row">
              <ClipboardList size={21} />
              <h2>Rutina mensual</h2>
            </div>
            {data.period && (
              <span className="badge">{monthLabel(data.period.month)}</span>
            )}
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
                        {day.blocks.reduce((n, b) => n + b.exercises.length, 0)}{" "}
                        ejercicios
                      </small>
                    </div>
                  </div>
                ))}
              </div>
              <Link className="button" to={"/rutinas/" + s.id}>
                Ver rutina
                <ArrowUpRight size={18} />
              </Link>
            </>
          ) : (
            <>
              <p className="muted">
                Todavía no tiene una rutina. Prepará los días y bloques de
                entrenamiento para este mes.
              </p>
              <Link className="button" to={"/rutinas/" + s.id}>
                <Plus size={18} />
                Preparar rutina
              </Link>
            </>
          )}
        </section>
        <div className="student-side-stack">
          <section className="card">
            <div className="row">
              <TrendingUp size={21} />
              <h2>Progreso e historial</h2>
            </div>
            <p className="muted">
              Explorá los músculos trabajados, la evolución de cada ejercicio y
              las rutinas anteriores.
            </p>
            <Link className="button secondary" to={"/historial/" + s.id}>
              Ver historial y progreso
              <ArrowUpRight size={18} />
            </Link>
          </section>
          <section className="card">
            <div className="row">
              <CalendarDays size={21} />
              <h2>Horario semanal</h2>
            </div>
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
                Sin días fijos. Podés agregar entrenamientos desde Hoy o
                definirlos al editar la ficha.
              </p>
            )}
            <button
              className="button secondary"
              onClick={() => setEditing(true)}
            >
              Editar días y horarios
            </button>
          </section>
        </div>
      </div>
      {s.notes && (
        <section className="card">
          <h2>Notas privadas</h2>
          <p className="student-notes">{s.notes}</p>
        </section>
      )}
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
