import { Link } from "react-router-dom";
import type { RawInput } from "@pulso/sync/local-db";
import { queueHealth } from "../../adapters/telemetry";
import { eventNames } from "@pulso/domain/audit-display";
import { saveLibrary, type LibraryCommand } from "../../adapters/library";
import { liveQuery } from "dexie";
import type { CommandEnvelope } from "@pulso/domain/contracts";
import { ImportPreview } from "./ImportPreview";
import { useEffect, useState } from "react";
import { useData } from "../../app/DataProvider";
import { cloud } from "../../adapters/supabase";
import { gateway } from "../../adapters/supabase-gateway";
import { restoreRestRaw } from "../../components/rest-minutes";
export function download(name: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function SyncCenter() {
  const data = useData();
  const health = queueHealth(data.pending);
  const [message, setMessage] = useState("");
  return (
    <>
      <p className="eyebrow">TU ESPACIO</p>
      <h1>Centro de sincronización</h1>
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      <div className="stack">
        <section className="card stack">
          <h2>Cambios pendientes</h2>
          {health.pending > 0 && (
            <p className="muted">
              Cambio pendiente más antiguo:{" "}
              {Math.max(1, Math.ceil(health.oldestSeconds / 60))} min.{" "}
              {health.needsRetry
                ? "Hay envíos que necesitan un reintento manual."
                : ""}
            </p>
          )}
          <p>
            {data.pending.length
              ? `${data.pending.length} operaciones por confirmar`
              : "No hay operaciones de entrenamiento pendientes."}
          </p>
          <div className="row">
            <button className="button" onClick={() => void data.sync(true)}>
              Reintentar sincronización
            </button>
            <button
              className="button secondary"
              onClick={async () =>
                download("pulso-pendientes.json", await data.db.exportPending())
              }
            >
              Exportar pendientes
            </button>
            <button
              className="button secondary"
              onClick={() => void data.refresh()}
            >
              Actualizar datos
            </button>
          </div>
          <RawPending />
          {data.pending
            .filter((p) => p.state === "conflict" || p.state === "rejected")
            .map((p) => (
              <div className="notice" key={p.operationId}>
                <h3>
                  {
                    data.rows.find((r) => r.studentId === p.studentId)
                      ?.projection.student.name
                  }
                </h3>
                <p>{p.error}</p>
                <p>
                  {eventNames[p.command.kind] ?? "Cambio pendiente"} · Valor
                  local:{" "}
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
                          ?.items.find(
                            (i) => i.id === p.command.payload.itemId,
                          );
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
                          setMessage(
                            "Ingresá un motivo de al menos 3 caracteres.",
                          );
                          return;
                        }
                        try {
                          download(
                            "pulso-antes-de-recuperar.json",
                            await data.db.exportPending(),
                          );
                          const remote = await gateway(
                            data.db.scope,
                          ).fetchStudent(data.db.scope, p.studentId);
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
                          const remote = await gateway(
                            data.db.scope,
                          ).fetchStudent(data.db.scope, p.studentId);
                          if (remote.revision !== p.remote!.revision)
                            throw Error(
                              "La versión volvió a cambiar. Actualizá y revisá antes de aplicar.",
                            );
                          await data.db.reapplyStudentQueue(
                            p.studentId,
                            remote,
                          );
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
                        const remote = await gateway(
                          data.db.scope,
                        ).fetchStudent(data.db.scope, p.studentId);
                        await data.db.discardStudentQueue(p.studentId, remote);
                        setMessage("Se conservó la versión del servidor.");
                      } catch (e) {
                        setMessage((e as Error).message);
                      }
                    }}
                  >
                    Descartar cola de este alumno
                  </button>
                </div>
              </div>
            ))}
        </section>
        <AdministrativePending />
        <ExportSection />
        <ImportPreview />
      </div>
    </>
  );
}
function ExportSection() {
  const { db } = useData();
  const [message, setMessage] = useState("");
  return (
    <section className="card">
      <h2>Copia de tus datos</h2>
      <p>
        Descargá los registros confirmados. Esta exportación no reemplaza el
        respaldo operativo del servidor.
      </p>
      <button
        className="button secondary"
        onClick={async () => {
          try {
            const { data: result, error } = await cloud().rpc(
              "export_workspace",
              { workspace_id: db.scope.workspaceId },
            );
            if (error || !result) throw Error("No se pudo exportar");
            const serialized = JSON.stringify(result);
            const digest = await crypto.subtle.digest(
              "SHA-256",
              new TextEncoder().encode(serialized),
            );
            result.integrity = {
              algorithm: "SHA-256",
              hash: Array.from(new Uint8Array(digest))
                .map((x) => x.toString(16).padStart(2, "0"))
                .join(""),
            };
            download("pulso-exportacion.json", result);
            setMessage("Exportación descargada.");
          } catch {
            setMessage(
              "No se pudo completar la exportación. Reintentá con conexión.",
            );
          }
        }}
      >
        Exportar datos confirmados
      </button>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
function AdministrativePending() {
  const data = useData();
  const [entries, setEntries] = useState<{ key: string; value: unknown }[]>([]),
    [message, setMessage] = useState("");
  useEffect(() => {
    const sub = liveQuery(() => data.db.meta.toArray()).subscribe((rows) =>
      setEntries(
        rows.filter(
          (r) =>
            r.key.startsWith("admin:") ||
            r.key.startsWith("draft:") ||
            r.key.startsWith("template-draft:") ||
            r.key === "library-pending",
        ),
      ),
    );
    return () => sub.unsubscribe();
  }, [data.db]);
  if (!entries.length) return null;
  return (
    <section className="card stack">
      <h2>Programación pendiente</h2>
      <p>Conservada en este dispositivo hasta recibir confirmación.</p>
      {entries.map((entry) => {
        if (entry.key === "library-pending")
          return (
            <div key={entry.key}>
              <p>Biblioteca o plantilla pendiente</p>
              <button
                className="button secondary"
                onClick={async () => {
                  try {
                    await saveLibrary(data.db, entry.value as LibraryCommand);
                    setMessage("Biblioteca confirmada.");
                  } catch (e) {
                    setMessage((e as Error).message);
                  }
                }}
              >
                Reintentar biblioteca
              </button>
            </div>
          );
        if (entry.key.startsWith("template-draft:")) {
          const draft = entry.value as {
            id: string;
            document: { name: string };
          };
          return (
            <div className="notice" key={entry.key}>
              <strong>Plantilla: {draft.document.name || "Sin nombre"}</strong>
              <div>
                <a href={"/rutinas/plantillas/" + draft.id}>
                  Abrir borrador de plantilla
                </a>
                <button
                  className="link-button"
                  onClick={async () => {
                    download(
                      "pulso-plantilla-" + draft.id + ".json",
                      entry.value,
                    );
                    if (
                      confirm(
                        "Se descargó una copia. ¿Descartar este borrador local? La plantilla guardada en la nube se conserva.",
                      )
                    )
                      await data.db.meta.delete(entry.key);
                  }}
                >
                  Exportar y descartar borrador local
                </button>
              </div>
            </div>
          );
        }
        const id = entry.key.split(":")[1];
        const name =
          data.rows.find((r) => r.studentId === id)?.projection.student.name ??
          "Alumno nuevo";
        return (
          <div className="notice" key={entry.key}>
            <strong>{name}</strong>
            {entry.key.startsWith("draft:") ? (
              <div>
                <a href={"/alumnos/" + id + "/rutina"}>Abrir borrador</a>
                <button
                  className="link-button"
                  onClick={async () => {
                    download("pulso-borrador-" + id + ".json", entry.value);
                    if (
                      confirm(
                        "Se descargó una copia. ¿Descartar este borrador local? La rutina publicada se conserva.",
                      )
                    )
                      await data.db.meta.delete(entry.key);
                  }}
                >
                  Exportar y descartar borrador local
                </button>
              </div>
            ) : (
              <button
                className="button secondary"
                onClick={async () => {
                  const c = entry.value as CommandEnvelope;
                  try {
                    await data.onlineCommand(
                      c.studentId,
                      c.kind,
                      c.payload,
                      c.expectedRevision,
                    );
                    setMessage("Operación confirmada.");
                  } catch (e) {
                    setMessage((e as Error).message);
                  }
                }}
              >
                Reintentar operación guardada
              </button>
            )}
          </div>
        );
      })}
      {message && <p role="status">{message}</p>}
    </section>
  );
}

function RawPending() {
  const { db, rows } = useData();
  const [inputs, setInputs] = useState<RawInput[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    const sub = liveQuery(() => db.rawInputs.toArray()).subscribe({
      next: setInputs,
      error: () =>
        setError("No se pudieron consultar las anotaciones pendientes."),
    });
    return () => sub.unsubscribe();
  }, [db]);
  const labels: Record<string, string> = {
    weight: "Peso (kg)",
    reps: "Repeticiones",
    sets: "Series",
    durationSec: "Duración (s)",
    microRest: "Descanso micro (min)",
    macroRest: "Descanso macro (min)",
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
    return (
      (input.field === "microRest" || input.field === "macroRest"
        ? restoreRestRaw(input.raw)
        : input.raw) || "Campo vacío"
    );
  }
  return (
    <>
      {error && <p role="alert">{error}</p>}
      {inputs.length > 0 && (
        <section className="stack">
          <h3>Anotaciones sin registrar</h3>
          <p>
            Estos valores están en este dispositivo. Volvé al entrenamiento para
            registrarlos o exportalos antes de descartarlos.
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
                <Link
                  className="button secondary"
                  to={"/entrenar/" + input.studentId}
                >
                  Revisar entrenamiento
                </Link>
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
