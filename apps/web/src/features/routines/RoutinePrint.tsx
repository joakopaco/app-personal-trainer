import type { RoutineDocument } from "@pulso/domain/routines";
import { formatRestDuration } from "../../components/rest-minutes";
import { Brand } from "../../components/Brand";
export function RoutinePrint({
  document,
  student,
  month,
  preview = false,
}: {
  document: RoutineDocument;
  student: string;
  month?: string;
  preview?: boolean;
}) {
  return (
    <article
      className={preview ? "routine-document" : "print-only"}
      aria-label="Rutina mensual para imprimir"
    >
      <div className="document-brand">
        <Brand />
      </div>
      <h1>{document.name}</h1>
      <p>{student}</p>
      <p className="document-context">
        {month ? month + " · " : ""}Rutina completa · {document.weeks.length}{" "}
        semanas
      </p>
      {document.weeks.map((week, n) => (
        <section className="print-week" key={n}>
          <h2>Semana {n + 1}</h2>
          {!week.length && <p>Sin días programados.</p>}
          {week.map((day) => (
            <section key={day.id}>
              <h3>{day.name}</h3>
              {!day.blocks.length && <p>Sin bloques programados.</p>}
              {day.blocks.map((block) => (
                <section key={block.id}>
                  <h4>
                    {block.name} ·{" "}
                    {block.type === "main"
                      ? "Principal"
                      : block.type === "mobility"
                        ? "Movilidad"
                        : "Aproximación"}
                  </h4>
                  <p>
                    Descanso macro:{" "}
                    {block.macroRest === null
                      ? "sin definir"
                      : formatRestDuration(block.macroRest)}{" "}
                    al terminar el bloque.
                  </p>
                  <table>
                    <thead>
                      <tr>
                        <th>Ejercicio</th>
                        <th>Series</th>
                        <th>Carga</th>
                        <th>Reps / tiempo</th>
                        <th>Descanso micro</th>
                      </tr>
                    </thead>
                    <tbody>
                      {block.exercises.map((e) => (
                        <tr key={e.id}>
                          <td>
                            {e.name}
                            {e.warmup && <small> · Calentamiento</small>}
                          </td>
                          <td>
                            {e.prescription.sets ?? "—"}
                            {e.prescription.progression && " · progresión"}
                          </td>
                          <td>
                            {e.type === "load_reps"
                              ? e.prescription.progression
                                ? e.prescription.progression
                                    .map(
                                      (s, n) =>
                                        `${n + 1}: ${s.weight ?? "—"} kg`,
                                    )
                                    .join(" / ")
                                : (e.prescription.weight ?? "—") + " kg"
                              : "—"}
                          </td>
                          <td>
                            {e.type === "time"
                              ? (e.prescription.durationSec ?? "—") + " s"
                              : e.prescription.progression
                                ? e.prescription.progression
                                    .map((s, n) => `${n + 1}: ${s.reps ?? "—"}`)
                                    .join(" / ")
                                : (e.prescription.reps ?? "—")}
                          </td>
                          <td>
                            {e.prescription.microRest === null
                              ? "—"
                              : formatRestDuration(e.prescription.microRest)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              ))}
            </section>
          ))}
        </section>
      ))}
    </article>
  );
}
