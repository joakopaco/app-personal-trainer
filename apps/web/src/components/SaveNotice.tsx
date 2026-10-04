import { useEffect, useState } from "react";
import { liveQuery } from "dexie";
import { Link, useLocation } from "react-router-dom";
import type { CommandEnvelope } from "@pulso/domain/contracts";
import type { LibraryCommand } from "../adapters/library";
import { useData } from "../app/DataProvider";

// Ordinary drafts and in-flight training saves stay in their own screens.
// Keep failed writes reachable without exposing a separate technical panel.
export function SaveNotice() {
  const data = useData();
  const { pathname } = useLocation();
  const [admin, setAdmin] = useState<CommandEnvelope[]>([]);
  const [library, setLibrary] = useState<LibraryCommand>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const sub = liveQuery(() => data.db.meta.toArray()).subscribe({
      next: (entries) => {
        setAdmin(
          entries
            .filter((e) => e.key.startsWith("admin:"))
            .map((e) => e.value as CommandEnvelope),
        );
        setLibrary(
          entries.find((e) => e.key === "library-pending")?.value as
            LibraryCommand | undefined,
        );
      },
      error: () =>
        setMessage("No se pudo comprobar el guardado en este dispositivo."),
    });
    return () => sub.unsubscribe();
  }, [data.db]);
  const students = [
    ...new Set(
      data.pending
        .filter((p) => p.state === "conflict" || p.state === "rejected")
        .map((p) => p.studentId),
    ),
  ];
  const libraryPath =
    library?.kind.startsWith("template") && library.id
      ? "/rutinas/plantillas/" + library.id
      : "/biblioteca";
  const otherStudents = students.filter((id) => pathname !== "/entrenar/" + id);
  if (
    !admin.length &&
    !data.error &&
    !message &&
    !otherStudents.length &&
    (!library || pathname === libraryPath)
  )
    return null;
  return (
    <aside className="notice stack" aria-label="Aviso de guardado">
      {(data.error || message) && <p role="alert">{message || data.error}</p>}
      {(admin.length > 0 || data.error) && (
        <div className="row">
          <span>Hay un cambio que todavía no se pudo confirmar.</span>
          <button
            className="button secondary small"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setMessage("");
              try {
                for (const entry of admin)
                  await data.onlineCommand(
                    entry.studentId,
                    entry.kind,
                    entry.payload,
                    entry.expectedRevision,
                  );
                await data.sync(true);
                await data.refresh();
              } catch (e) {
                setMessage((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy
              ? "Guardando…"
              : admin.length
                ? "Reintentar guardado de ficha"
                : "Volver a cargar"}
          </button>
        </div>
      )}
      {library && pathname !== libraryPath && (
        <Link to={libraryPath}>
          Continuar el guardado de{" "}
          {library.kind.startsWith("template") ? "la plantilla" : "ejercicios"}
        </Link>
      )}
      {otherStudents.map((id) => (
        <Link key={id} to={"/entrenar/" + id}>
          Revisar entrenamiento de{" "}
          {data.rows.find((r) => r.studentId === id)?.projection.student.name ||
            "alumno"}
        </Link>
      ))}
    </aside>
  );
}
