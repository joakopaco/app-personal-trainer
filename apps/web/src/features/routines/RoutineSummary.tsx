import { useState } from "react";
import type { RoutineDocument } from "@pulso/domain/routines";
import { formatRestMinutes } from "../../components/rest-minutes";

export function RoutineSummary({ document }: { document: RoutineDocument }) {
  const [week, setWeek] = useState(0);
  return (
    <div className="routine-summary stack">
      <nav className="routine-tabs" aria-label="Semanas de la rutina">
        {document.weeks.map((_, index) => (
          <button
            key={index}
            className={"button " + (week === index ? "" : "secondary")}
            aria-pressed={week === index}
            onClick={() => setWeek(index)}
          >
            Semana {index + 1}
          </button>
        ))}
      </nav>
      {document.weeks[week].map((day, index) => (
        <section className="card routine-summary-day" key={day.id}>
          <header>
            <p className="eyebrow">DÍA {index + 1}</p>
            <h2>{day.name}</h2>
            <p className="muted">
              {day.blocks.length} bloques ·{" "}
              {day.blocks.reduce(
                (count, block) => count + block.exercises.length,
                0,
              )}{" "}
              ejercicios
            </p>
          </header>
          {day.blocks.map((block) => (
            <section className="routine-summary-block" key={block.id}>
              <h3>{block.name}</h3>
              <p className="muted">
                {block.type === "main"
                  ? "Principal"
                  : block.type === "mobility"
                    ? "Movilidad"
                    : "Aproximación"}
                {block.macroRest !== null && (
                  <>
                    {" "}
                    · Descanso {formatRestMinutes(block.macroRest)} min entre{" "}
                    {block.macroTarget === "series" ? "series" : "bloques"}
                  </>
                )}
              </p>
              <div className="routine-summary-exercises">
                {block.exercises.map((exercise) => (
                  <article key={exercise.id}>
                    <div>
                      <strong>{exercise.name}</strong>
                      <small>{exercise.group}</small>
                    </div>
                    <dl>
                      <div>
                        <dt>Series</dt>
                        <dd>{exercise.prescription.sets ?? "—"}</dd>
                      </div>
                      <div>
                        <dt>
                          {exercise.type === "time"
                            ? "Duración"
                            : "Repeticiones"}
                        </dt>
                        <dd>
                          {exercise.type === "time"
                            ? `${exercise.prescription.durationSec ?? "—"} s`
                            : (exercise.prescription.reps ?? "—")}
                        </dd>
                      </div>
                      {exercise.type === "load_reps" && (
                        <div>
                          <dt>Peso</dt>
                          <dd>{exercise.prescription.weight ?? "—"} kg</dd>
                        </div>
                      )}
                      <div>
                        <dt>Descanso</dt>
                        <dd>
                          {exercise.prescription.microRest === null
                            ? "—"
                            : `${formatRestMinutes(exercise.prescription.microRest)} min`}
                        </dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
              {!block.exercises.length && (
                <p className="muted">Sin ejercicios todavía.</p>
              )}
            </section>
          ))}
          {!day.blocks.length && <p className="muted">Sin bloques todavía.</p>}
        </section>
      ))}
    </div>
  );
}
