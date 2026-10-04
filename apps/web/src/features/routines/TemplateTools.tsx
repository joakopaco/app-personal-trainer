import { useEffect, useState } from "react";
import { cloud } from "../../adapters/supabase";
import {
  blankRoutine,
  cloneRoutineDocument,
  type RoutineDocument,
} from "@pulso/domain/routines";

export function TemplateTools({
  onApply,
  onCancel,
}: {
  onApply: (doc: RoutineDocument) => void;
  onCancel?: () => void;
}) {
  const [templates, setTemplates] = useState<
    { id: string; name: string; document: RoutineDocument }[]
  >([]);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    void cloud()
      .from("routine_templates")
      .select("id,name,document")
      .order("name")
      .then(({ data, error }) => {
        if (!active) return;
        setLoading(false);
        if (error)
          setError(
            "No se pudieron cargar las plantillas. Podés empezar desde cero.",
          );
        else setTemplates(data ?? []);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <section className="card routine-start stack" aria-label="Crear rutina">
      <div>
        <p className="eyebrow">NUEVA RUTINA</p>
        <h2>Elegí cómo empezar</h2>
        <p className="muted">
          Armá un plan desde cero o usá una plantilla como base.
        </p>
      </div>
      <label className="field">
        Punto de partida
        <select
          aria-label="Punto de partida"
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
        >
          <option value="">Rutina en blanco</option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
      </label>
      {loading && <small role="status">Cargando plantillas…</small>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!loading && !error && !templates.length && (
        <small className="muted">Todavía no hay plantillas disponibles.</small>
      )}
      <div className="row">
        <button
          className="button"
          onClick={() => {
            const template = templates.find((entry) => entry.id === selected);
            onApply(
              template
                ? cloneRoutineDocument(template.document)
                : blankRoutine(),
            );
          }}
        >
          Crear rutina
        </button>
        {onCancel && (
          <button className="button secondary" onClick={onCancel}>
            Volver a la rutina
          </button>
        )}
      </div>
    </section>
  );
}
