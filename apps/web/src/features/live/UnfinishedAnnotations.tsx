import { useEffect, useState } from "react";
import { liveQuery } from "dexie";
import type { RawInput } from "@pulso/sync/local-db";
import { useData } from "../../app/DataProvider";
import { download } from "../../components/download";
import {
  restoreRestRaw,
  parseRestMinutes,
  formatRestDuration,
} from "../../components/rest-minutes";
export function UnfinishedAnnotations({ studentId }: { studentId: string }) {
  const { db, rows } = useData();
  const [inputs, setInputs] = useState<RawInput[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    const sub = liveQuery(() =>
      db.rawInputs.where("studentId").equals(studentId).toArray(),
    ).subscribe({
      next: setInputs,
      error: () =>
        setError("No se pudieron consultar las anotaciones pendientes."),
    });
    return () => sub.unsubscribe();
  }, [db, studentId]);
  const labels: Record<string, string> = {
    weight: "Peso (kg)",
    reps: "Repeticiones",
    sets: "Series",
    durationSec: "Duración (s)",
    microRest: "Descanso entre series",
    macroRest: "Descanso del bloque",
    setDraft: "Detalle de serie",
  };
  function value(input: RawInput) {
    if (input.setId) {
      try {
        const v = JSON.parse(input.raw);
        return (
          [
            ["Peso", v.weight],
            ["Reps", v.reps],
            ["Segundos", v.duration],
          ]
            .filter(([, v]) => v !== "")
            .map(([k, v]) => k + ": " + v)
            .join(" · ") || "Campos vacíos"
        );
      } catch {
        return input.raw;
      }
    }
    if (input.field === "microRest" || input.field === "macroRest") {
      const restored = restoreRestRaw(input.raw);
      const parsed = parseRestMinutes(restored);
      return parsed.ok ? formatRestDuration(parsed.value) : restored;
    }
    return input.raw || "Campo vacío";
  }
  return (
    <>
      {error && <p role="alert">{error}</p>}
      {inputs.length > 0 && (
        <section className="stack">
          <h3>Anotaciones sin registrar</h3>
          <p>
            Estas anotaciones quedaron sin registrar. Conservá una copia antes
            de descartarlas.
          </p>
          {inputs.map((input) => (
            <div className="notice" key={input.id}>
              <strong>
                {rows.find((r) => r.studentId === input.studentId)?.projection
                  .student.name ?? "Alumno"}{" "}
                · {labels[input.field] ?? "Anotación"}
              </strong>
              <p>{value(input)}</p>
              <div className="row">
                <button
                  className="link-button"
                  onClick={async () => {
                    if (
                      !confirm(
                        "Se descargará una copia de esta anotación antes de descartarla. ¿Continuar?",
                      )
                    )
                      return;
                    try {
                      download("pulso-anotacion-pendiente.json", input);
                      await db.discardRaw(input);
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  Exportar y descartar anotación
                </button>
              </div>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
