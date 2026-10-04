import { useEffect, useState, type RefObject } from "react";
import { Plus, ArrowUp, ArrowDown, Trash2 } from "lucide-react";
import {
  cloneRoutineDocument,
  type RoutineDocument,
  type Block,
  type Position,
} from "@pulso/domain/routines";
import {
  catalog,
  searchExercises,
  type ExerciseDefinition,
} from "@pulso/domain/catalog";
import { RoutineNumberField as NumericField } from "../../components/RoutineNumberField";
import { parseDisplayedNumber } from "../../components/rest-minutes";
import { cloud } from "../../adapters/supabase";

export function RoutineFields({
  doc,
  change,
  busy,
  rawValues,
  rawInvalid,
}: {
  doc: RoutineDocument;
  change: (doc: RoutineDocument) => void;
  busy: boolean;
  rawValues: RefObject<Record<string, string>>;
  rawInvalid: RefObject<Set<string>>;
}) {
  const [week, setWeek] = useState(0),
    [day, setDay] = useState(0);
  const [searchBlock, setSearchBlock] = useState<string | null>(null),
    [query, setQuery] = useState("");
  function mutate(fn: (copy: RoutineDocument) => void) {
    const next = structuredClone(doc);
    fn(next);
    change(next);
  }
  const [ownExercises, setOwnExercises] = useState<ExerciseDefinition[]>([]);
  useEffect(() => {
    let active = true;
    void cloud()
      .from("custom_exercises")
      .select("*")
      .then(({ data }) => {
        if (active && data)
          setOwnExercises(data.map((e) => ({ ...e, aliases: [] })));
      });
    return () => {
      active = false;
    };
  }, []);
  function addExercise(exercise: ExerciseDefinition) {
    mutate((d) => {
      const b = d.weeks[week][day].blocks.find((b) => b.id === searchBlock)!;
      b.exercises.push({
        id: crypto.randomUUID(),
        lineageId: crypto.randomUUID(),
        exerciseId: exercise.id,
        name: exercise.name,
        group: exercise.group,
        type: exercise.type,
        warmup: b.type !== "main",
        prescription: {
          weight: null,
          sets: null,
          reps: null,
          durationSec: null,
          microRest: null,
        },
      });
    });
    setSearchBlock(null);
    setQuery("");
  }
  const selected = doc.weeks[week][day];
  return (
    <fieldset disabled={busy} className="editor-fields">
      <div className="card stack">
        <label className="field">
          Nombre de la rutina
          <input
            value={doc.name}
            maxLength={120}
            onChange={(e) =>
              mutate((d) => {
                d.name = e.target.value;
              })
            }
          />
        </label>
        <div className="routine-week-tools">
          <div className="routine-tabs" aria-label="Semanas">
            {doc.weeks.map((_, i) => (
              <button
                className={"button " + (week === i ? "" : "secondary")}
                key={i}
                onClick={() => {
                  setWeek(i);
                  setDay(0);
                }}
              >
                Semana {i + 1}
              </button>
            ))}
          </div>
          <button
            className="link-button"
            onClick={() => {
              mutate((d) => {
                for (let i = week + 1; i < 4; i++) {
                  const copied = cloneRoutineDocument({
                    ...d,
                    weeks: [
                      d.weeks[week],
                      d.weeks[week],
                      d.weeks[week],
                      d.weeks[week],
                    ],
                  });
                  d.weeks[i] = copied.weeks[0];
                  for (let j = 0; j < d.weeks[i].length; j++)
                    for (let k = 0; k < d.weeks[i][j].blocks.length; k++)
                      for (
                        let n = 0;
                        n < d.weeks[i][j].blocks[k].exercises.length;
                        n++
                      )
                        d.weeks[i][j].blocks[k].exercises[n].lineageId =
                          d.weeks[week][j].blocks[k].exercises[n].lineageId;
                }
              });
            }}
          >
            Copiar semana a las siguientes
          </button>
        </div>
        <div className="routine-tabs" aria-label="Días">
          {doc.weeks[week].map((d, i) => (
            <button
              className={"button " + (day === i ? "" : "secondary")}
              key={d.id}
              onClick={() => setDay(i)}
            >
              {d.name}
            </button>
          ))}
          <button
            className="link-button"
            onClick={() =>
              mutate((d) => {
                d.weeks[week].push({
                  id: crypto.randomUUID(),
                  name: "Día " + (d.weeks[week].length + 1),
                  blocks: [],
                });
              })
            }
          >
            + Día
          </button>
        </div>
        <details className="routine-day-tools">
          <summary>Organizar día</summary>
          <div className="row">
            <button
              className="link-button"
              onClick={() =>
                mutate((d) => {
                  if (d.weeks[week].length >= 14) return;
                  const copy = cloneRoutineDocument({
                    ...d,
                    weeks: [[selected], [selected], [selected], [selected]],
                  }).weeks[0][0];
                  copy.name = selected.name + " (copia)";
                  d.weeks[week].splice(day + 1, 0, copy);
                })
              }
            >
              Duplicar día
            </button>
            <button
              className="link-button"
              disabled={day === 0}
              onClick={() => {
                mutate((d) => {
                  [d.weeks[week][day - 1], d.weeks[week][day]] = [
                    d.weeks[week][day],
                    d.weeks[week][day - 1],
                  ];
                });
                setDay(day - 1);
              }}
            >
              Mover día antes
            </button>
            <button
              className="link-button"
              disabled={doc.weeks[week].length === 1}
              onClick={() => {
                if (confirm("¿Eliminar este día del borrador?")) {
                  mutate((d) => {
                    d.weeks[week].splice(day, 1);
                  });
                  setDay(Math.max(0, day - 1));
                }
              }}
            >
              Eliminar día
            </button>
          </div>
        </details>
        <label className="field">
          Nombre del día
          <input
            value={selected.name}
            onChange={(e) =>
              mutate((d) => {
                d.weeks[week][day].name = e.target.value;
              })
            }
          />
        </label>
      </div>
      <div className="stack blocks">
        {selected.blocks.map((block, bi) => (
          <section className="card" key={block.id}>
            <div className="row spread">
              <label className="field">
                Bloque {bi + 1}
                <input
                  value={block.name}
                  onChange={(e) =>
                    mutate((d) => {
                      d.weeks[week][day].blocks[bi].name = e.target.value;
                    })
                  }
                />
              </label>
              <div className="row no-print">
                <button
                  className="link-button"
                  onClick={() =>
                    mutate((d) => {
                      const copy = cloneRoutineDocument({
                        ...d,
                        weeks: [[selected], [selected], [selected], [selected]],
                      }).weeks[0][0].blocks[bi];
                      d.weeks[week][day].blocks.splice(bi + 1, 0, copy);
                    })
                  }
                >
                  Duplicar bloque
                </button>
                <button
                  className="button secondary"
                  aria-label="Subir bloque"
                  disabled={bi === 0}
                  onClick={() =>
                    mutate((d) => {
                      const a = d.weeks[week][day].blocks;
                      [a[bi - 1], a[bi]] = [a[bi], a[bi - 1]];
                    })
                  }
                >
                  <ArrowUp size={16} />
                </button>
                <button
                  className="button secondary"
                  aria-label="Bajar bloque"
                  disabled={bi === selected.blocks.length - 1}
                  onClick={() =>
                    mutate((d) => {
                      const a = d.weeks[week][day].blocks;
                      [a[bi + 1], a[bi]] = [a[bi], a[bi + 1]];
                    })
                  }
                >
                  <ArrowDown size={16} />
                </button>
                <button
                  className="button secondary"
                  aria-label="Eliminar bloque"
                  onClick={() =>
                    mutate((d) => {
                      d.weeks[week][day].blocks.splice(bi, 1);
                    })
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
            <div className="fields block-config">
              <label className="field">
                Tipo
                <select
                  value={block.type}
                  onChange={(e) =>
                    mutate((d) => {
                      const b = d.weeks[week][day].blocks[bi];
                      b.type = e.target.value as Block["type"];
                      for (const x of b.exercises) x.warmup = b.type !== "main";
                    })
                  }
                >
                  <option value="main">Principal</option>
                  <option value="approximation">Aproximación</option>
                  <option value="mobility">Movilidad</option>
                </select>
              </label>
              <NumericField
                label="Descanso macro (min)"
                field="macroRest"
                value={block.macroRest}
                rawValue={rawValues.current[block.id + ":macroRest"]}
                onRaw={(raw) => {
                  const key = block.id + ":macroRest";
                  rawValues.current[key] = raw;
                  if (raw !== "" && !parseDisplayedNumber("macroRest", raw).ok)
                    rawInvalid.current.add(key);
                  else rawInvalid.current.delete(key);
                  change(doc);
                }}
                onChange={(v) =>
                  mutate((d) => {
                    d.weeks[week][day].blocks[bi].macroRest = v;
                  })
                }
              />
              <label className="field">
                Aplicar macro
                <select
                  value={block.macroTarget}
                  onChange={(e) =>
                    mutate((d) => {
                      d.weeks[week][day].blocks[bi].macroTarget = e.target
                        .value as Block["macroTarget"];
                    })
                  }
                >
                  <option value="series">Entre series</option>
                  <option value="blocks">Entre bloques</option>
                </select>
              </label>
            </div>
            {block.exercises.map((exercise, ei) => (
              <div className="exercise-editor" key={exercise.id}>
                <div className="row spread">
                  <div>
                    <h3>{exercise.name}</h3>
                    <small>{exercise.group}</small>
                  </div>
                  <div className="row">
                    <button
                      className="link-button"
                      disabled={ei === 0}
                      aria-label={"Subir " + exercise.name}
                      onClick={() =>
                        mutate((d) => {
                          const a = d.weeks[week][day].blocks[bi].exercises;
                          [a[ei - 1], a[ei]] = [a[ei], a[ei - 1]];
                        })
                      }
                    >
                      ↑
                    </button>
                    <button
                      className="link-button"
                      disabled={ei === block.exercises.length - 1}
                      aria-label={"Bajar " + exercise.name}
                      onClick={() =>
                        mutate((d) => {
                          const a = d.weeks[week][day].blocks[bi].exercises;
                          [a[ei + 1], a[ei]] = [a[ei], a[ei + 1]];
                        })
                      }
                    >
                      ↓
                    </button>
                    <button
                      className="link-button"
                      aria-label={"Quitar " + exercise.name}
                      onClick={() =>
                        mutate((d) => {
                          d.weeks[week][day].blocks[bi].exercises.splice(ei, 1);
                        })
                      }
                    >
                      Quitar
                    </button>
                  </div>
                </div>
                <div className="fields">
                  {(
                    [
                      "sets",
                      ...(exercise.type === "time"
                        ? ["durationSec"]
                        : exercise.type === "load_reps"
                          ? ["weight", "reps"]
                          : ["reps"]),
                      "microRest",
                    ] as const
                  ).map((field) => {
                    const f = field as keyof Position["prescription"];
                    const labels = {
                      weight: "Peso kg",
                      sets: "Series",
                      reps: "Repeticiones",
                      durationSec: "Duración (s)",
                      microRest: "Descanso micro (min)",
                    };
                    return (
                      <NumericField
                        key={f}
                        field={f}
                        label={labels[f]}
                        value={exercise.prescription[f]}
                        rawValue={rawValues.current[exercise.id + ":" + f]}
                        onRaw={(raw) => {
                          const key = exercise.id + ":" + f;
                          rawValues.current[key] = raw;
                          if (raw !== "" && !parseDisplayedNumber(f, raw).ok)
                            rawInvalid.current.add(key);
                          else rawInvalid.current.delete(key);
                          change(doc);
                        }}
                        onChange={(v) =>
                          mutate((d) => {
                            d.weeks[week][day].blocks[bi].exercises[
                              ei
                            ].prescription[f] = v;
                          })
                        }
                      />
                    );
                  })}
                </div>
              </div>
            ))}
            <button
              className="button secondary"
              onClick={() => setSearchBlock(block.id)}
            >
              <Plus size={17} />
              Agregar ejercicio
            </button>
          </section>
        ))}
      </div>
      <button
        className="button secondary"
        onClick={() =>
          mutate((d) =>
            d.weeks[week][day].blocks.push({
              id: crypto.randomUUID(),
              name: "Bloque " + (selected.blocks.length + 1),
              type: "main",
              macroRest: null,
              macroTarget: "series",
              exercises: [],
            }),
          )
        }
      >
        <Plus size={18} />
        Agregar bloque
      </button>
      {searchBlock && (
        <div className="modal-backdrop">
          <section
            className="modal card"
            role="dialog"
            aria-modal="true"
            aria-label="Biblioteca de ejercicios"
          >
            <div className="row spread">
              <h2>Elegí un ejercicio</h2>
              <button
                className="link-button"
                onClick={() => setSearchBlock(null)}
              >
                Cerrar
              </button>
            </div>
            <label className="field">
              Buscar ejercicio
              <input
                autoFocus
                placeholder="Nombre, músculo o equipo"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <div className="catalog-results">
              {searchExercises(query, [...ownExercises, ...catalog]).map(
                (e) => (
                  <button
                    className="catalog-option"
                    aria-label={e.name}
                    key={e.id}
                    onClick={() => addExercise(e)}
                  >
                    <span>{e.name}</span>
                    <small>
                      {e.group} · {e.equipment}
                    </small>
                  </button>
                ),
              )}
            </div>
          </section>
        </div>
      )}
    </fieldset>
  );
}
