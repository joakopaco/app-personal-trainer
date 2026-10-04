import { useEffect, useState } from "react";
import { liveQuery } from "dexie";
import { visitSchema, type CommandEnvelope } from "@pulso/domain/contracts";
import { useData } from "../../app/DataProvider";
import { cloud } from "../../adapters/supabase";
import { visitDateLabel, type AgendaVisit } from "./RescheduleVisit";

export function PendingReschedules({
  onResume,
}: {
  onResume: (visit: AgendaVisit & { name: string }) => void;
}) {
  const { db, rows } = useData();
  const [commands, setCommands] = useState<CommandEnvelope[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const subscription = liveQuery(() => db.meta.toArray()).subscribe({
      next: (entries) =>
        setCommands(
          entries
            .filter((entry) => entry.key.startsWith("admin:"))
            .map((entry) => entry.value as CommandEnvelope)
            .filter((command) => command.kind === "reschedule_visit"),
        ),
      error: () =>
        setError(
          "No se pudieron revisar las reprogramaciones pendientes. Recargá la página para reintentar.",
        ),
    });
    return () => subscription.unsubscribe();
  }, [db]);
  async function resume(command: CommandEnvelope) {
    setBusy(true);
    setError("");
    try {
      const row = rows.find((row) => row.studentId === command.studentId);
      if (!row)
        throw Error(
          "Todavía se están cargando los datos del alumno. Volvé a intentar.",
        );
      let visit = row.projection.visits.find(
        (visit) => visit.id === command.payload.visitId,
      );
      if (!visit) {
        const { data, error } = await cloud()
          .from("visits")
          .select("*")
          .eq("id", String(command.payload.visitId))
          .single();
        if (error) throw error;
        visit = visitSchema.parse(data);
      }
      onResume({ ...visit, name: row.projection.student.name });
    } catch {
      setError(
        "No se pudo recuperar la visita. Revisá la conexión y reintentá.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {commands.map((command) => (
        <div className="notice row spread" key={command.operationId}>
          <span>
            Falta confirmar la reprogramación de{" "}
            <strong>
              {rows.find((row) => row.studentId === command.studentId)
                ?.projection.student.name || "un alumno"}
            </strong>{" "}
            para el {visitDateLabel(String(command.payload.date))} a las{" "}
            {String(command.payload.time)}.
          </span>
          <button
            className="button secondary small"
            disabled={busy}
            onClick={() => void resume(command)}
          >
            Revisar reprogramación
          </button>
        </div>
      ))}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
