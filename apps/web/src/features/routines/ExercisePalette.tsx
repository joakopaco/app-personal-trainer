import { useState } from "react";
import { Dumbbell, GripVertical, Plus, ChevronDown } from "lucide-react";
import {
  searchExercises,
  type ExerciseDefinition,
} from "@pulso/domain/catalog";

export const exerciseDragType = "application/x-pulso-exercise";

export function ExercisePalette({
  exercises,
  blocks,
  target,
  setTarget,
  add,
  busy,
  context,
  feedback,
  onDragStart,
  onDragEnd,
}: {
  exercises: ExerciseDefinition[];
  blocks: { id: string; name: string }[];
  target: string;
  setTarget: (id: string) => void;
  add: (exercise: ExerciseDefinition, blockId: string) => void;
  busy: boolean;
  context: string;
  feedback: string;
  onDragStart: (exerciseId: string) => void;
  onDragEnd: () => void;
}) {
  const [query, setQuery] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const matches = searchExercises(query, exercises);
  const groups = [...new Set(matches.map((e) => e.group))].sort((a, b) =>
    a.localeCompare(b, "es"),
  );
  return (
    <aside className="exercise-palette" aria-label="Banco de ejercicios">
      <button
        type="button"
        className="button secondary palette-toggle"
        aria-expanded={mobileOpen}
        aria-controls="palette-content"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        <Dumbbell size={19} aria-hidden="true" />
        {mobileOpen ? "Ocultar" : "Mostrar"} banco de ejercicios
        <ChevronDown size={18} aria-hidden="true" />
      </button>
      <div
        className={"palette-content" + (mobileOpen ? " is-open" : "")}
        id="palette-content"
      >
        <div className="palette-heading">
          <Dumbbell size={20} aria-hidden="true" />
          <h2>Banco de ejercicios</h2>
        </div>
        <p className="palette-help">
          Arrastrá un ejercicio a un bloque o agregalo con +.
        </p>
        <label className="field">
          Buscar en el banco
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nombre o músculo"
          />
        </label>
        <div className="palette-destination">
          <small>{context}</small>
          {blocks.length ? (
            <label className="field">
              Bloque de destino
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              >
                {blocks.map((b, i) => (
                  <option key={b.id} value={b.id}>
                    {b.name || `Bloque ${i + 1}`}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <small>Al agregar se crea el primer bloque.</small>
          )}
        </div>
        {feedback && (
          <p className="palette-feedback" aria-live="polite">
            {feedback}
          </p>
        )}
        <div className="palette-groups">
          {groups.map((group) => (
            <details
              className="palette-group"
              key={group + query}
              open={!!query.trim()}
            >
              <summary>
                <span>{group}</span>
                <small>{matches.filter((e) => e.group === group).length}</small>
              </summary>
              <div className="palette-exercises">
                {matches
                  .filter((e) => e.group === group)
                  .map((exercise) => (
                    <div
                      className="palette-exercise"
                      key={exercise.id}
                      draggable={!busy}
                      onDragStart={(e) => {
                        if (busy) {
                          e.preventDefault();
                          return;
                        }
                        e.dataTransfer.setData(exerciseDragType, exercise.id);
                        e.dataTransfer.setData("text/plain", exercise.name);
                        e.dataTransfer.effectAllowed = "copy";
                        onDragStart(exercise.id);
                      }}
                      onDragEnd={onDragEnd}
                    >
                      <GripVertical
                        size={16}
                        className="palette-grip"
                        aria-hidden="true"
                      />
                      <div>
                        <strong>{exercise.name}</strong>
                        <small>{exercise.equipment}</small>
                      </div>
                      <button
                        type="button"
                        className="button secondary icon-button"
                        draggable={false}
                        aria-label={"Agregar " + exercise.name}
                        title={"Agregar " + exercise.name}
                        onClick={() => add(exercise, target)}
                      >
                        <Plus size={18} aria-hidden="true" />
                      </button>
                    </div>
                  ))}
              </div>
            </details>
          ))}
          {!matches.length && (
            <p className="palette-help">
              No se encontraron ejercicios. Probá con otro nombre o músculo.
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}
