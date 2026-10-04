import type { RoutineDocument } from "@pulso/domain/routines";
import { formatRestMinutes } from "../../components/rest-minutes";
export function RoutinePrint({
  document,
  student,
}: {
  document: RoutineDocument;
  student: string;
}) {
  return (
    <article className="print-only" aria-label="Rutina mensual para imprimir">
      <h1>{document.name}</h1>
      <p>{student}</p>
      {document.weeks.map((week, n) => (
        <section className="print-week" key={n}>
          <h2>Semana {n + 1}</h2>
          {week.map((day) => (
            <section key={day.id}>
              <h3>{day.name}</h3>
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
                      : formatRestMinutes(block.macroRest) + " min"}{" "}
                    entre{" "}
                    {block.macroTarget === "series" ? "series" : "bloques"}.
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
                          <td>{e.name}</td>
                          <td>{e.prescription.sets ?? "—"}</td>
                          <td>
                            {e.type === "load_reps"
                              ? (e.prescription.weight ?? "—") + " kg"
                              : "—"}
                          </td>
                          <td>
                            {e.type === "time"
                              ? (e.prescription.durationSec ?? "—") + " s"
                              : (e.prescription.reps ?? "—")}
                          </td>
                          <td>
                            {e.prescription.microRest === null
                              ? "—"
                              : formatRestMinutes(e.prescription.microRest) +
                                " min"}
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
