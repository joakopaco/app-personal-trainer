import { useState } from "react";
import { useData } from "../../app/DataProvider";
import { gateway } from "../../adapters/supabase-gateway";
import { eventNames } from "@pulso/domain/audit-display";
import { download } from "../../components/download";

// Only appears for the affected student when an explicit decision is required.
export function TrainingRecovery({ studentId }: { studentId: string }) {
  const data = useData();
  const [message, setMessage] = useState("");
  return (
    <section aria-label="Revisar cambios del entrenamiento">
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      {data.pending
        .filter(
          (p) =>
            p.studentId === studentId &&
            (p.state === "conflict" || p.state === "rejected"),
        )
        .map((p) => (
          <div className="notice" key={p.operationId}>
            <h3>
              {
                data.rows.find((r) => r.studentId === p.studentId)?.projection
                  .student.name
              }
            </h3>
            <p>{p.error}</p>
            <p>
              {eventNames[p.command.kind] ?? "Cambio pendiente"} · Valor local:{" "}
              {JSON.stringify(
                p.command.payload.value ??
                  (p.command.kind === "record_set"
                    ? {
                        peso: p.command.payload.weight,
                        repeticiones: p.command.payload.reps,
                        segundos: p.command.payload.durationSec,
                      }
                    : "Registro de entrenamiento"),
              )}
            </p>
            {p.remote && (
              <p>
                Versión remota: {p.remote.revision}. Valor confirmado:{" "}
                {JSON.stringify(
                  (() => {
                    const item = p
                      .remote!.sessions.find(
                        (s) => s.id === p.command.payload.sessionId,
                      )
                      ?.items.find((i) => i.id === p.command.payload.itemId);
                    const field = String(p.command.payload.field);
                    return field === "macroRest"
                      ? item?.macro_rest
                      : field === "macroTarget"
                        ? item?.macro_target
                        : item?.prescription[
                            field as keyof NonNullable<
                              typeof item
                            >["prescription"]
                          ];
                  })(),
                ) ?? "La sesión o el ejercicio ya no está disponible"}
              </p>
            )}
            <div className="row">
              {data.rows
                .find((r) => r.studentId === p.studentId)
                ?.projection.sessions.some(
                  (s) =>
                    s.date.slice(0, 7) <
                    new Date()
                      .toLocaleDateString("en-CA", {
                        timeZone: "America/Argentina/Buenos_Aires",
                      })
                      .slice(0, 7),
                ) && (
                <button
                  className="button secondary"
                  onClick={async () => {
                    if (
                      !confirm(
                        "Recuperar estos cambios en el entrenamiento del mes anterior y cerrarlo. Las series pendientes se confirmarán con sus valores actuales. La rutina vigente no se modifica. ¿Confirmás que revisaste los valores?",
                      )
                    )
                      return;
                    const reason = prompt("Motivo de la recuperación:");
                    if (!reason || reason.trim().length < 3) {
                      setMessage("Ingresá un motivo de al menos 3 caracteres.");
                      return;
                    }
                    try {
                      download(
                        "pulso-antes-de-recuperar.json",
                        await data.db.exportPending(),
                      );
                      const remote = await gateway(data.db.scope).fetchStudent(
                        data.db.scope,
                        p.studentId,
                      );
                      await data.db.reconcileHistorical(
                        p.studentId,
                        remote,
                        reason.trim(),
                      );
                      await data.sync(true);
                    } catch (e) {
                      setMessage((e as Error).message);
                    }
                  }}
                >
                  Recuperar y cerrar en su mes original
                </button>
              )}
              {p.remote && (
                <button
                  className="button"
                  onClick={async () => {
                    try {
                      const remote = await gateway(data.db.scope).fetchStudent(
                        data.db.scope,
                        p.studentId,
                      );
                      if (remote.revision !== p.remote!.revision)
                        throw Error(
                          "La versión volvió a cambiar. Actualizá y revisá antes de aplicar.",
                        );
                      await data.db.reapplyStudentQueue(p.studentId, remote);
                      await data.sync(true);
                      setMessage(
                        "Se envió una operación nueva con tu resolución.",
                      );
                    } catch (e) {
                      setMessage((e as Error).message);
                    }
                  }}
                >
                  Aplicar mi cambio revisado
                </button>
              )}
              <button
                className="button secondary"
                onClick={async () => {
                  download(
                    "pulso-conflicto-" + p.studentId + ".json",
                    await data.db.exportPending(),
                  );
                  setMessage(
                    "Copia descargada. Podés conservar la versión remota con el botón de descarte explícito.",
                  );
                }}
              >
                Exportar antes de resolver
              </button>
              <button
                className="button danger"
                onClick={async () => {
                  if (
                    !confirm(
                      "Descartar TODOS los cambios pendientes de este alumno y conservar la versión del servidor. ¿Continuar?",
                    )
                  )
                    return;
                  try {
                    const remote = await gateway(data.db.scope).fetchStudent(
                      data.db.scope,
                      p.studentId,
                    );
                    await data.db.discardStudentQueue(p.studentId, remote);
                    setMessage("Se conservó la versión del servidor.");
                  } catch (e) {
                    setMessage((e as Error).message);
                  }
                }}
              >
                Conservar los valores confirmados
              </button>
            </div>
          </div>
        ))}
    </section>
  );
}
