import { cloud } from "../../adapters/supabase";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { Plus, ArrowUpRight } from "lucide-react";
import { useData } from "../../app/DataProvider";
export function StudentList() {
  const { rows, error, onlineCommand } = useData();
  const [search, setSearch] = useState(""),
    [form, setForm] = useState(false),
    [name, setName] = useState(""),
    [failure, setFailure] = useState(""),
    [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [id, setId] = useState(() => crypto.randomUUID());
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFailure("");
    try {
      await onlineCommand(id, "create_student", { name: name.trim() }, 0);
      setForm(false);
      setName("");
      setId(crypto.randomUUID());
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const filtered = rows.filter(
    (r) =>
      (showArchived || !r.projection.student.archived) &&
      r.projection.student.name
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase()),
  );
  return (
    <>
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
        <form className="card stack" onSubmit={submit}>
          <h2>Nuevo alumno</h2>
          <label className="field">
            Nombre
            <input
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          {failure && (
            <p role="alert" className="error">
              {failure}
            </p>
          )}
          <div className="row">
            <button className="button" disabled={busy}>
              Crear alumno
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={() => setForm(false)}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
      <label className="field search-field">
        Buscar alumno
        <input
          type="search"
          placeholder="Nombre del alumno…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <label className="row blocks">
        <input
          type="checkbox"
          checked={showArchived}
          onChange={(e) => setShowArchived(e.target.checked)}
        />
        Mostrar alumnos archivados
      </label>
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
                  ? "Período " + s.period.month
                  : "Listo para empezar"}
            </span>
          </Link>
        ))}
      </div>
      {!filtered.length && (
        <div className="card empty">
          <h2>Tu próximo progreso empieza acá</h2>
          <p>Agregá un alumno para preparar su primera rutina.</p>
        </div>
      )}
    </>
  );
}
export function StudentProfile() {
  const { id } = useParams();
  const { rows, onlineCommand } = useData();
  const data = rows.find((r) => r.studentId === id)?.projection;
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(""),
    [notes, setNotes] = useState("");
  if (!data) return <p>Cargando alumno…</p>;
  const s = data.student;
  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      await onlineCommand(
        s.id,
        "update_student",
        { name, notes, alias: s.alias },
        data!.revision,
      );
      setEditing(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <Link to="/alumnos">← Alumnos</Link>
      <header className="page-heading">
        <div>
          <p className="eyebrow">FICHA PRIVADA</p>
          <h1>{s.name}</h1>
          <p className="muted">
            {data.routine?.document.name ?? "Sin rutina asignada"}
          </p>
        </div>
        <button
          className="button secondary"
          onClick={() => {
            setName(s.name);
            setNotes(s.notes);
            setEditing(true);
          }}
        >
          Editar ficha
        </button>
      </header>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {editing && (
        <form className="card stack" onSubmit={save}>
          <label className="field">
            Nombre
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              required
            />
          </label>
          <label className="field">
            Notas privadas
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={2000}
            />
          </label>
          <button className="button">Guardar ficha</button>
        </form>
      )}
      <div className="grid">
        <div className="card">
          <h2>Rutina mensual</h2>
          <p>{data.period?.month ?? "Todavía sin período"}</p>
          <Link className="button" to={"/rutinas/" + s.id}>
            Preparar rutina
          </Link>
        </div>
        <div className="card">
          <h2>Seguimiento</h2>
          <p>Consultá lo realizado y los cambios registrados.</p>
          <Link className="button secondary" to={"/historial/" + s.id}>
            Ver historial y progreso
          </Link>
        </div>
      </div>
      {s.notes && (
        <div className="card">
          <h2>Notas</h2>
          <p>{s.notes}</p>
        </div>
      )}
      <Schedule studentId={s.id} />
      <button
        className="link-button"
        onClick={async () => {
          try {
            await onlineCommand(
              s.id,
              "archive_student",
              { archived: !s.archived },
              data.revision,
            );
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        {s.archived ? "Restaurar alumno" : "Archivar alumno"}
      </button>
    </>
  );
}
function Schedule({ studentId }: { studentId: string }) {
  const { rows, onlineCommand } = useData();
  const [days, setDays] = useState<number[]>([]),
    [time, setTime] = useState("18:00"),
    [message, setMessage] = useState("");
  const row = rows.find((r) => r.studentId === studentId)!;
  useEffect(() => {
    let active = true;
    void cloud()
      .from("schedule_rules")
      .select("weekdays,time")
      .eq("student_id", studentId)
      .eq("enabled", true)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setMessage("No se pudo cargar el horario. Reintentá con conexión.");
          return;
        }
        if (data) {
          setDays(data.weekdays);
          setTime(data.time.slice(0, 5));
        }
      });
    return () => {
      active = false;
    };
  }, [studentId]);

  return (
    <section className="card stack">
      <h2>Horario semanal</h2>
      <p className="muted">
        Elegí los días para generar las visitas del mes. Las faltas y
        reprogramaciones quedan registradas aparte.
      </p>
      <div className="row">
        {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map(
          (name, index) => (
            <label key={name} className="row">
              <input
                type="checkbox"
                checked={days.includes(index + 1)}
                onChange={(e) =>
                  setDays(
                    e.target.checked
                      ? [...days, index + 1]
                      : days.filter((d) => d !== index + 1),
                  )
                }
              />
              {name}
            </label>
          ),
        )}
      </div>
      <label className="field">
        Hora
        <input
          type="time"
          required
          value={time}
          onChange={(e) => setTime(e.target.value)}
        />
      </label>
      <button
        className="button secondary"
        onClick={async () => {
          try {
            await onlineCommand(
              studentId,
              "save_schedule",
              { weekdays: days, time },
              row.confirmed.revision,
            );
            setMessage("Horario guardado.");
          } catch (e) {
            setMessage((e as Error).message);
          }
        }}
      >
        Guardar horario
      </button>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
