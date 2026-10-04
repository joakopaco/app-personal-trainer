import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Copy } from "lucide-react";
import type { RoutineDocument } from "@pulso/domain/routines";
import { useData } from "../../app/DataProvider";
import { createTemplateDraft, templatePath } from "./template-drafts";

export function SaveStudentTemplate({
  document,
}: {
  document: RoutineDocument;
}) {
  const { db } = useData(),
    navigate = useNavigate();
  const [open, setOpen] = useState(false),
    [name, setName] = useState(document.name);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (!open)
    return (
      <button
        className="button secondary"
        onClick={() => {
          setName(document.name);
          setOpen(true);
        }}
      >
        <Copy size={17} aria-hidden="true" />
        Guardar como plantilla
      </button>
    );
  return (
    <form
      className="stack template-copy-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim() || busy) return;
        setBusy(true);
        setError("");
        try {
          const id = await createTemplateDraft(db, {
            ...document,
            name: name.trim(),
          });
          navigate(templatePath(id));
        } catch {
          setError("No se pudo conservar la copia. Reintentá.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="field">
        Nombre de la plantilla
        <input
          autoFocus
          required
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={busy}
        />
      </label>
      <small className="muted">
        Copiamos la rutina guardada. Revisá y guardá la plantilla en el
        catálogo; la rutina del alumno conserva sus valores.
      </small>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="row">
        <button className="button" disabled={busy || !name.trim()}>
          Continuar con la copia
        </button>
        <button
          type="button"
          className="button secondary"
          disabled={busy}
          onClick={() => setOpen(false)}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
