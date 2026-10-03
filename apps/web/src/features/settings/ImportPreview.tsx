import { useState } from "react";
import { previewImport } from "@pulso/domain/legacy-v6";
import { useData } from "../../app/DataProvider";
import { cloud } from "../../adapters/supabase";
export function ImportPreview() {
  const { db, refresh } = useData();
  const [preview, setPreview] = useState<Awaited<
      ReturnType<typeof previewImport>
    > | null>(null),
    [confirmed, setConfirmed] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <section className="card stack">
      <h2>Traer datos de la demo</h2>
      <p>
        Importación explícita de una copia v6. La fuente original se conserva y
        los registros antiguos mantienen su origen. Las rutinas se preparan como
        borradores para revisar antes de activar.
      </p>
      <label className="field">
        Copia JSON v6
        <input
          type="file"
          accept="application/json,.json"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setPreview(null);
            setConfirmed(false);
            try {
              setPreview(await previewImport(await file.text()));
              setMessage("");
            } catch {
              setMessage(
                "La copia es inválida, tiene una versión incompatible o supera el límite. No se importó ningún dato.",
              );
            }
          }}
        />
      </label>
      {preview && (
        <>
          <p>
            <strong>
              {preview.students.length} alumnos · {preview.recordCount}{" "}
              registros anteriores.
            </strong>
          </p>
          <p>
            Destino: tu espacio actual ({db.scope.workspaceId.slice(0, 8)}).
          </p>
          {preview.possibleDemo && (
            <p className="notice">
              La copia parece incluir personas de ejemplo. Confirmá que
              corresponde a los datos que querés importar.
            </p>
          )}
          {preview.openSessions > 0 && (
            <p className="notice">
              {preview.openSessions} sesiones abiertas legadas se conservarán
              para revisión; no se convertirán automáticamente en sesiones
              nuevas ni se darán por finalizadas.
            </p>
          )}
          <ul>
            {preview.students.map((s) => (
              <li key={s.sourceId}>
                {s.name} · {s.recordCount} registros
              </li>
            ))}
          </ul>
          <label className="row">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            Esta copia corresponde a mi espacio y revisé los datos de ejemplo.
          </label>
          <button
            className="button"
            disabled={!confirmed || busy}
            onClick={async () => {
              setBusy(true);
              try {
                const { data, error } = await cloud().rpc("import_legacy_v6", {
                  workspace_id: db.scope.workspaceId,
                  source_text: preview.sourceText,
                  prepared: preview.students,
                });
                if (error) throw error;
                setMessage(
                  data.duplicate
                    ? "Esta copia ya había sido importada. No se duplicaron alumnos."
                    : `Importación completa: ${data.students} alumnos. Revisá sus borradores y horarios.`,
                );
                setPreview(null);
                await refresh();
              } catch {
                setMessage(
                  "No se pudo confirmar la importación. Podés reintentar la misma copia sin duplicarla.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            Importar copia revisada
          </button>
        </>
      )}
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
    </section>
  );
}
