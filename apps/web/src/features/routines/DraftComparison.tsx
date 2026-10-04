import { useState } from "react";
import {
  mergeRoutine,
  conflictLabel,
  conflictValue,
} from "@pulso/domain/routine-diff";
import type { RoutineDocument } from "@pulso/domain/routines";
import { formatRestMinutes } from "../../components/rest-minutes";
export function DraftComparison({
  base,
  local,
  remote,
  onApply,
  onCancel,
}: {
  base: RoutineDocument;
  local: RoutineDocument;
  remote: RoutineDocument;
  onApply: (doc: RoutineDocument) => void;
  onCancel: () => void;
}) {
  const [choices, setChoices] = useState<Record<string, "local" | "remote">>(
    {},
  );
  const original = mergeRoutine(base, local, remote, {}),
    result = mergeRoutine(base, local, remote, choices);
  function displayedValue(path: string, value: unknown) {
    return /(?:microRest|macroRest)$/.test(path) && typeof value === "number"
      ? formatRestMinutes(value) + " min"
      : conflictValue(value);
  }
  return (
    <div className="modal-backdrop">
      <section
        className="card modal stack"
        role="dialog"
        aria-modal="true"
        aria-label="Comparar borrador"
      >
        <h2>Revisar con la rutina vigente</h2>
        <p>
          Los campos que cambian de un solo lado se conservan. Elegí cómo
          resolver los cambios que coinciden.
        </p>
        {original.conflicts.map((c) => (
          <div className="notice" key={c.path}>
            <strong>{conflictLabel(c.path, local)}</strong>
            <details>
              <summary>Ver valores</summary>
              <p>Base: {displayedValue(c.path, c.base)}</p>
              <p>Borrador: {displayedValue(c.path, c.local)}</p>
              <p>Vigente: {displayedValue(c.path, c.remote)}</p>
            </details>
            <div className="row">
              <button
                className={
                  "button " + (choices[c.path] === "local" ? "" : "secondary")
                }
                onClick={() => setChoices({ ...choices, [c.path]: "local" })}
              >
                Conservar borrador
              </button>
              <button
                className={
                  "button " + (choices[c.path] === "remote" ? "" : "secondary")
                }
                onClick={() => setChoices({ ...choices, [c.path]: "remote" })}
              >
                Conservar vigente
              </button>
            </div>
          </div>
        ))}
        {!original.conflicts.length && (
          <p>
            No hay campos incompatibles. Se combinarán los cambios
            independientes.
          </p>
        )}
        <button
          className="button"
          disabled={result.conflicts.length > 0}
          onClick={() => onApply(result.document)}
        >
          Crear borrador revisado
        </button>
        <button className="link-button" onClick={onCancel}>
          Cancelar
        </button>
      </section>
    </div>
  );
}
