import type { RefObject } from "react";
import type { Prescription, Position } from "@pulso/domain/routines";
import type { NumericField } from "@pulso/domain/numbers";
import { RoutineNumberField } from "../../components/RoutineNumberField";
import {
  parseDisplayedNumber,
  formatRestDuration,
} from "../../components/rest-minutes";

export const repOptions = [4, 6, 8, 10, 12];
export const restOptions = [30, 60, 180, 300];
export const restLabel = formatRestDuration;
export function PresetField({
  label,
  value,
  options,
  format = String,
  onChange,
  pendingRaw,
}: {
  label: string;
  value: number | null;
  options: number[];
  format?: (n: number) => string;
  onChange: (n: number | null) => void;
  pendingRaw?: string;
}) {
  return (
    <label className="field">
      {label}
      <select
        aria-label={label}
        value={value ?? ""}
        onChange={(e) =>
          onChange(e.target.value === "" ? null : Number(e.target.value))
        }
      >
        <option value="">Sin definir</option>
        {value !== null && !options.includes(value) && (
          <option value={value} disabled>
            {format(value)} · anterior
          </option>
        )}
        {options.map((n) => (
          <option key={n} value={n}>
            {format(n)}
          </option>
        ))}
      </select>
      {pendingRaw !== undefined && (
        <small className="preset-pending">
          Valor pendiente: «{pendingRaw || "vacío"}». Elegí una opción para
          confirmarlo.
        </small>
      )}
    </label>
  );
}

export function PrescriptionFields({
  exercise,
  change,
  rawValues,
  rawInvalid,
  onRawChange,
}: {
  exercise: Position;
  change: (rx: Prescription) => void;
  rawValues: RefObject<Record<string, string>>;
  rawInvalid: RefObject<Set<string>>;
  onRawChange: () => void;
}) {
  const rx = exercise.prescription;
  function clearPreset(field: string) {
    delete rawValues.current[exercise.id + ":" + field];
    rawInvalid.current.delete(exercise.id + ":" + field);
  }
  function clearRaw() {
    for (const key of Object.keys(rawValues.current))
      if (
        key === exercise.id + ":weight" ||
        key === exercise.id + ":reps" ||
        key.startsWith(exercise.id + ":series-")
      ) {
        delete rawValues.current[key];
        rawInvalid.current.delete(key);
      }
  }
  function pruneSeries(count: number) {
    for (const key of Object.keys(rawValues.current)) {
      const match =
        key.startsWith(exercise.id + ":") && key.match(/:series-(\d+):/);
      if (match && Number(match[1]) >= count) {
        delete rawValues.current[key];
        rawInvalid.current.delete(key);
      }
    }
  }
  function numeric(
    field: "weight" | "durationSec",
    label: string,
    index?: number,
  ) {
    const key =
      exercise.id +
      (index === undefined ? "" : `:series-${index}`) +
      ":" +
      field;
    return (
      <RoutineNumberField
        label={label}
        field={field}
        value={index === undefined ? rx[field] : rx.progression![index].weight}
        rawValue={rawValues.current[key]}
        onRaw={(raw) => {
          rawValues.current[key] = raw;
          if (
            raw !== "" &&
            !parseDisplayedNumber(field as NumericField, raw).ok
          )
            rawInvalid.current.add(key);
          else rawInvalid.current.delete(key);
          onRawChange();
        }}
        onChange={(value) => {
          if (index === undefined) change({ ...rx, [field]: value });
          else
            change({
              ...rx,
              progression: rx.progression!.map((s, n) =>
                n === index ? { ...s, weight: value } : s,
              ),
            });
        }}
      />
    );
  }
  return (
    <div className="prescription-fields">
      <div className="fields exercise-presets">
        <PresetField
          label="Series"
          value={rx.sets}
          options={[1, 2, 3, 4]}
          pendingRaw={rawValues.current[exercise.id + ":sets"]}
          onChange={(sets) => {
            clearPreset("sets");
            pruneSeries(sets ?? 1);
            change({
              ...rx,
              sets: rx.progression ? (sets ?? 1) : sets,
              ...(rx.progression
                ? {
                    progression: Array.from(
                      { length: sets ?? 1 },
                      (_, n) =>
                        rx.progression?.[n] ?? {
                          weight: rx.weight,
                          reps: rx.reps,
                        },
                    ),
                  }
                : {}),
            });
          }}
        />
        {!rx.progression &&
          exercise.type === "load_reps" &&
          numeric("weight", "Peso kg")}
        {exercise.type === "time"
          ? numeric("durationSec", "Duración (s)")
          : !rx.progression && (
              <PresetField
                label="Repeticiones"
                value={rx.reps}
                options={repOptions}
                pendingRaw={rawValues.current[exercise.id + ":reps"]}
                onChange={(reps) => {
                  clearPreset("reps");
                  change({ ...rx, reps });
                }}
              />
            )}
        <PresetField
          label="Descanso"
          value={rx.microRest}
          options={restOptions}
          format={restLabel}
          pendingRaw={rawValues.current[exercise.id + ":microRest"]}
          onChange={(microRest) => {
            clearPreset("microRest");
            change({ ...rx, microRest });
          }}
        />
      </div>
      {exercise.type !== "time" && (
        <label className="progression-toggle">
          <input
            type="checkbox"
            aria-label="Progresión por serie"
            checked={!!rx.progression}
            onChange={(e) => {
              if (e.target.checked) {
                const sets = Math.min(4, rx.sets ?? 3);
                const previous = rawValues.current[exercise.id + ":weight"];
                const invalid = rawInvalid.current.has(exercise.id + ":weight");
                const previousReps = rawValues.current[exercise.id + ":reps"];
                const invalidReps = rawInvalid.current.has(
                  exercise.id + ":reps",
                );
                clearRaw();
                clearPreset("sets");
                if (previous !== undefined)
                  for (let n = 0; n < sets; n++) {
                    const key = exercise.id + `:series-${n}:weight`;
                    rawValues.current[key] = previous;
                    if (invalid) rawInvalid.current.add(key);
                  }
                if (previousReps !== undefined)
                  for (let n = 0; n < sets; n++) {
                    const key = exercise.id + `:series-${n}:reps`;
                    rawValues.current[key] = previousReps;
                    if (invalidReps) rawInvalid.current.add(key);
                  }
                change({
                  ...rx,
                  sets,
                  progression: Array.from({ length: sets }, () => ({
                    weight: rx.weight,
                    reps: rx.reps,
                  })),
                });
              } else {
                const previous =
                  rawValues.current[exercise.id + ":series-0:weight"];
                const invalid = rawInvalid.current.has(
                  exercise.id + ":series-0:weight",
                );
                const previousReps =
                  rawValues.current[exercise.id + ":series-0:reps"];
                const invalidReps = rawInvalid.current.has(
                  exercise.id + ":series-0:reps",
                );
                clearRaw();
                if (previous !== undefined) {
                  const key = exercise.id + ":weight";
                  rawValues.current[key] = previous;
                  if (invalid) rawInvalid.current.add(key);
                }
                if (previousReps !== undefined) {
                  const key = exercise.id + ":reps";
                  rawValues.current[key] = previousReps;
                  if (invalidReps) rawInvalid.current.add(key);
                }
                const { progression, ...base } = rx;
                change({
                  ...base,
                  weight: progression ? progression[0].weight : base.weight,
                  reps: progression ? progression[0].reps : base.reps,
                });
              }
            }}
          />
          <span>
            Progresión por serie
            <small>Definí el peso y las repeticiones de cada serie.</small>
          </span>
        </label>
      )}
      {rx.progression && (
        <div
          className="progression-table"
          role="group"
          aria-label={`Progresión de ${exercise.name}`}
        >
          <div className="progression-heading">
            <span>Serie</span>
            <span>{exercise.type === "load_reps" ? "Peso kg" : "Carga"}</span>
            <span>Repeticiones</span>
          </div>
          {rx.progression.map((s, n) => (
            <div className="progression-row" key={n}>
              <span className="series-number">{n + 1}</span>
              {exercise.type === "load_reps" ? (
                numeric("weight", `Peso kg · serie ${n + 1}`, n)
              ) : (
                <span className="muted">Corporal</span>
              )}
              <PresetField
                label={`Repeticiones · serie ${n + 1}`}
                value={s.reps}
                options={repOptions}
                pendingRaw={
                  rawValues.current[exercise.id + `:series-${n}:reps`]
                }
                onChange={(reps) => {
                  clearPreset(`series-${n}:reps`);
                  change({
                    ...rx,
                    progression: rx.progression!.map((x, i) =>
                      i === n ? { ...x, reps } : x,
                    ),
                  });
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
