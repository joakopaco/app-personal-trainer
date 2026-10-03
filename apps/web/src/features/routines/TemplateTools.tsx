import { saveLibrary } from "../../adapters/library";
import { useEffect, useState } from "react";
import { cloud } from "../../adapters/supabase";
import { useData } from "../../app/DataProvider";
import {
  cloneRoutineDocument,
  type RoutineDocument,
} from "@pulso/domain/routines";
export function TemplateTools({
  document,
  onApply,
}: {
  document: RoutineDocument;
  onApply: (doc: RoutineDocument) => void;
}) {
  const { db } = useData();
  const [templates, setTemplates] = useState<
      { id: string; name: string; document: RoutineDocument }[]
    >([]),
    [message, setMessage] = useState("");
  async function refresh() {
    const { data, error } = await cloud()
      .from("routine_templates")
      .select("id,name,document")
      .order("name");
    if (error) setMessage("No se pudieron cargar las plantillas.");
    else setTemplates(data);
  }
  useEffect(() => {
    void refresh();
  }, []);
  return (
    <details className="card no-print blocks">
      <summary>Plantillas reutilizables e impresión</summary>
      <p className="muted">Cada alumno recibe una copia independiente.</p>
      <div className="row">
        <button
          className="button secondary"
          onClick={async () => {
            try {
              await saveLibrary(db, {
                workspaceId: db.scope.workspaceId,
                operationId: crypto.randomUUID(),
                id: crypto.randomUUID(),
                kind: "template",
                expectedRevision: 0,
                payload: { document },
              });
              setMessage("Plantilla guardada.");
              void refresh();
            } catch (e) {
              setMessage((e as Error).message);
            }
          }}
        >
          Guardar como nueva plantilla
        </button>
        <button className="button secondary" onClick={() => window.print()}>
          Imprimir rutina
        </button>
      </div>
      <label className="field blocks">
        Aplicar una copia de plantilla
        <select
          aria-label="Aplicar plantilla"
          value=""
          onChange={(e) => {
            const found = templates.find((t) => t.id === e.target.value);
            if (
              found &&
              confirm(
                "Reemplazar el borrador actual con una copia de esta plantilla. La rutina activa no cambia.",
              )
            )
              onApply(cloneRoutineDocument(found.document));
          }}
        >
          <option value="">Elegí una plantilla</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      {message && <p>{message}</p>}
    </details>
  );
}
