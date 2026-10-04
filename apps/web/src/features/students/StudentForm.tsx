import { useState, type FormEvent } from "react";
import type { StudentSnapshot } from "@pulso/domain/contracts";
export const weekdays = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];
export const genders: Record<string, string> = {
  masculino: "Masculino",
  femenino: "Femenino",
  otro: "Otro",
  no_especificado: "Prefiere no indicar",
};
export function StudentForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: StudentSnapshot;
  onSave: (
    payload: Record<string, unknown>,
    expectedRevision?: number,
  ) => Promise<void>;
  onCancel: () => void;
}) {
  const [openingRevision] = useState(initial?.revision);
  const [firstName, setFirstName] = useState(
      initial?.student.first_name || initial?.student.name || "",
    ),
    [lastName, setLastName] = useState(initial?.student.last_name || "");
  const [gender, setGender] = useState(initial?.student.gender || ""),
    [notes, setNotes] = useState(initial?.student.notes || "");
  const [days, setDays] = useState(initial?.schedule?.weekdays || []),
    [count, setCount] = useState(
      initial ? initial.schedule?.weekdays.length || 0 : 3,
    );
  const [times, setTimes] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      (initial?.schedule?.weekdays || []).map((day) => [
        day,
        initial?.schedule?.day_times[String(day)] ||
          initial?.schedule?.time.slice(0, 5) ||
          "",
      ]),
    ),
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (days.length !== count) {
      setError(
        `Elegí ${count} días habituales para que coincidan con la frecuencia semanal.`,
      );
      return;
    }
    if (`${firstName.trim()} ${lastName.trim()}`.trim().length > 100) {
      setError(
        "El nombre y apellido juntos no pueden superar los 100 caracteres.",
      );
      return;
    }
    setBusy(true);
    try {
      await onSave(
        {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          gender,
          notes: notes.trim(),
          alias: initial?.student.alias || "",
          schedule: {
            weekdays: [...days].sort(),
            dayTimes: Object.fromEntries(days.map((day) => [day, times[day]])),
          },
        },
        openingRevision,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="card student-form" onSubmit={submit}>
      <div>
        <h2>{initial ? "Editar ficha" : "Nuevo alumno"}</h2>
        <p className="muted">
          Datos personales y horarios habituales, en una sola ficha.
        </p>
      </div>
      <fieldset disabled={busy} className="student-form-fields">
        <div className="student-form-grid">
          <label className="field">
            Nombre
            <input
              autoComplete="given-name"
              required
              maxLength={100}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </label>
          <label className="field">
            Apellido
            <input
              autoComplete="family-name"
              required={!initial}
              maxLength={100}
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </label>
          <label className="field">
            Género
            <select
              required
              value={gender}
              onChange={(e) => setGender(e.target.value)}
            >
              <option value="">Elegí una opción</option>
              {Object.entries(genders).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Días por semana
            <select
              value={count}
              onChange={(e) => {
                const next = Number(e.target.value);
                setCount(next);
                if (next === 0) setDays([]);
              }}
            >
              {Array.from({ length: 8 }, (_, n) => (
                <option key={n} value={n}>
                  {n === 0
                    ? "Sin horario fijo"
                    : `${n} ${n === 1 ? "día" : "días"}`}
                </option>
              ))}
            </select>
          </label>
        </div>
        {count > 0 && (
          <fieldset className="student-weekdays">
            <legend>Días y horarios habituales</legend>
            <p className="muted">
              Elegí {count} días. Podés indicar un horario distinto para cada
              uno.
            </p>
            <div className="student-day-grid">
              {weekdays.map((label, index) => {
                const day = index + 1,
                  selected = days.includes(day);
                return (
                  <div
                    className={`student-day-choice ${selected ? "selected" : ""}`}
                    key={day}
                  >
                    <label className="student-day-toggle">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(e) =>
                          setDays(
                            e.target.checked
                              ? [...days, day]
                              : days.filter((d) => d !== day),
                          )
                        }
                      />
                      {label}
                    </label>
                    {selected && (
                      <label className="field">
                        Horario del {label.toLocaleLowerCase()}
                        <input
                          type="time"
                          required
                          value={times[day] || ""}
                          onChange={(e) =>
                            setTimes({ ...times, [day]: e.target.value })
                          }
                        />
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          </fieldset>
        )}
        <label className="field">
          Notas privadas
          <textarea
            rows={3}
            maxLength={2000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Objetivos, experiencia o indicaciones para el entrenamiento"
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="student-form-actions">
          <button className="button">
            {busy ? "Guardando…" : initial ? "Guardar ficha" : "Crear alumno"}
          </button>
          <button className="button secondary" type="button" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </fieldset>
    </form>
  );
}
