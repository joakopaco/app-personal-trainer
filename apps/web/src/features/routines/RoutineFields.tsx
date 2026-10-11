import { ExercisePalette } from "./ExercisePalette";
import { useEffect, useRef, useState, type RefObject } from "react";
import {
  Plus,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Trash2,
  Copy,
  ChevronDown,
  CalendarDays,
} from "lucide-react";
import {
  cloneRoutineDocument,
  type RoutineDocument,
  type Block,
  type RoutineDay,
} from "@pulso/domain/routines";
import {
  catalog,
  searchExercises,
  type ExerciseDefinition,
} from "@pulso/domain/catalog";
import {
  PrescriptionFields,
  PresetField,
  restOptions,
  restLabel,
} from "./PrescriptionFields";
import { cloud } from "../../adapters/supabase";

export function RoutineFields({
  doc,
  change,
  busy,
  rawValues,
  rawInvalid,
  trainerCatalog = true,
  scheduledWeekdays,
}: {
  doc: RoutineDocument;
  change: (doc: RoutineDocument) => void;
  busy: boolean;
  rawValues: RefObject<Record<string, string>>;
  rawInvalid: RefObject<Set<string>>;
  trainerCatalog?: boolean;
  scheduledWeekdays?: number[];
}) {
  const [week, setWeek] = useState(0),
    [day, setDay] = useState(0);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyTargets, setCopyTargets] = useState<number[]>([]);
  const [organizeMessage, setOrganizeMessage] = useState("");
  const copyRegion = useRef<HTMLDivElement>(null);
  const copyTrigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!copyOpen) return;
    copyRegion.current
      ?.querySelector<HTMLInputElement>('input[type="checkbox"]')
      ?.focus();
    const outside = (event: PointerEvent) => {
      if (!copyRegion.current?.contains(event.target as Node))
        setCopyOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [copyOpen]);
  function copyRawInputs(source: RoutineDay, copied: RoutineDay) {
    const snapshot = { ...rawValues.current };
    const ids = new Map<string, string>();
    source.blocks.forEach((block, i) => {
      ids.set(block.id, copied.blocks[i].id);
      block.exercises.forEach((exercise, j) =>
        ids.set(exercise.id, copied.blocks[i].exercises[j].id),
      );
    });
    for (const [key, value] of Object.entries(snapshot)) {
      const [id, ...suffix] = key.split(":");
      if (!ids.has(id)) continue;
      const nextKey = [ids.get(id), ...suffix].join(":");
      rawValues.current[nextKey] = value;
      if (rawInvalid.current.has(key)) rawInvalid.current.add(nextKey);
    }
  }
  function copyWeek() {
    if (!copyTargets.length || busy) return;
    mutate((next) => {
      const source = next.weeks[week];
      for (const target of copyTargets) {
        const copied = cloneRoutineDocument({
          ...next,
          weeks: [source, source, source, source],
        }).weeks[0];
        copied.forEach((copiedDay, di) => {
          copiedDay.blocks.forEach((block, bi) =>
            block.exercises.forEach((exercise, ei) => {
              exercise.lineageId =
                source[di].blocks[bi].exercises[ei].lineageId;
            }),
          );
          copyRawInputs(source[di], copiedDay);
        });
        next.weeks[target] = copied;
      }
    });
    setOrganizeMessage(
      `Semana ${week + 1} copiada a ${copyTargets.map((n) => n + 1).join(", ")}.`,
    );
    setCopyOpen(false);
    copyTrigger.current?.focus();
  }
  const [searchBlock, setSearchBlock] = useState<string | null>(null),
    [query, setQuery] = useState("");
  function mutate(fn: (copy: RoutineDocument) => void) {
    const next = structuredClone(doc);
    fn(next);
    for (const [weekIndex, days] of next.weeks.entries()) {
      const reordered =
        days.length !== doc.weeks[weekIndex].length ||
        days.some(
          (entry, index) => entry.id !== doc.weeks[weekIndex][index]?.id,
        );
      for (const [dayIndex, entry] of days.entries()) {
        if (reordered) entry.name = `Día ${dayIndex + 1}`;
        for (const block of entry.blocks) block.macroTarget = "blocks";
      }
    }
    change(next);
  }
  const [ownExercises, setOwnExercises] = useState<ExerciseDefinition[]>([]);
  useEffect(() => {
    if (!trainerCatalog) return;
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
  }, [trainerCatalog]);
  const [targetBlock, setTargetBlock] = useState("");
  const [dragOver, setDragOver] = useState<string | null>(null);
  // WebKit can strip custom DataTransfer formats during native drags.
  const draggedExerciseId = useRef<string | null>(null);
  const [added, setAdded] = useState("");
  const exercises = [...ownExercises, ...catalog];
  function addExercise(
    exercise: ExerciseDefinition,
    blockId: string = searchBlock ?? "",
  ) {
    if (busy) return;
    const existing = doc.weeks[week][day].blocks;
    if (blockId && !existing.some((b) => b.id === blockId)) return;
    const destination = blockId || existing[0]?.id || crypto.randomUUID();
    mutate((d) => {
      const blocks = d.weeks[week][day].blocks;
      if (!blocks.length)
        blocks.push({
          id: destination,
          name: "Bloque 1",
          type: "main",
          macroRest: null,
          macroTarget: "blocks",
          exercises: [],
        });
      const b = blocks.find((b) => b.id === destination)!;
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
          sets: 3,
          reps: exercise.type === "time" ? null : 10,
          durationSec: null,
          microRest: 60,
        },
      });
    });
    setTargetBlock(destination);
    setAdded(
      exercise.name +
        " agregado a " +
        (existing.find((b) => b.id === destination)?.name || "Bloque 1") +
        ".",
    );
    setSearchBlock(null);
    setQuery("");
  }
  const selected = doc.weeks[week][day] ?? doc.weeks[week][0];
  const scheduled = !!scheduledWeekdays?.length;
  const atDayLimit = doc.weeks[week].length >= 6;
  const destination = selected.blocks.some((b) => b.id === targetBlock)
    ? targetBlock
    : (selected.blocks[0]?.id ?? "");
  function dropProps(blockId: string) {
    return {
      onDragOver: (e: React.DragEvent<HTMLElement>) => {
        if (busy || !draggedExerciseId.current) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setDragOver(blockId);
      },
      onDragLeave: (e: React.DragEvent<HTMLElement>) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null))
          setDragOver(null);
      },
      onDrop: (e: React.DragEvent<HTMLElement>) => {
        if (busy || !draggedExerciseId.current) return;
        e.preventDefault();
        setDragOver(null);
        const exercise = exercises.find(
          (x) => x.id === draggedExerciseId.current,
        );
        draggedExerciseId.current = null;
        if (exercise) addExercise(exercise, blockId);
      },
    };
  }
  return (
    <fieldset disabled={busy} className="editor-fields">
      <div className="routine-composer">
        <ExercisePalette
          exercises={exercises}
          blocks={selected.blocks}
          target={destination}
          setTarget={setTargetBlock}
          add={addExercise}
          busy={busy}
          context={`Semana ${week + 1} · Día ${day + 1}`}
          feedback={added}
          onDragStart={(id) => {
            draggedExerciseId.current = id;
          }}
          onDragEnd={() => {
            draggedExerciseId.current = null;
            setDragOver(null);
          }}
        />
        <div className="routine-canvas">
          <div className="card stack routine-program-settings">
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
                    aria-pressed={week === i}
                    key={i}
                    onClick={() => {
                      setWeek(i);
                      setDay(0);
                      setCopyOpen(false);
                      setOrganizeMessage("");
                    }}
                  >
                    Semana {i + 1}
                  </button>
                ))}
              </div>
              <div
                className="routine-week-copy"
                ref={copyRegion}
                onKeyDown={(event) => {
                  if (event.key === "Escape" && copyOpen) {
                    event.stopPropagation();
                    setCopyOpen(false);
                    copyTrigger.current?.focus();
                  }
                }}
              >
                <button
                  ref={copyTrigger}
                  className="routine-manage-button routine-week-copy-trigger"
                  aria-expanded={copyOpen}
                  aria-controls="routine-week-copy-panel"
                  aria-haspopup="dialog"
                  onClick={() => {
                    if (!copyOpen)
                      setCopyTargets(
                        doc.weeks.map((_, i) => i).filter((i) => i > week),
                      );
                    setCopyOpen(!copyOpen);
                  }}
                >
                  <Copy size={16} aria-hidden="true" />
                  <span>Copiar semana {week + 1} a…</span>
                  <ChevronDown size={16} aria-hidden="true" />
                </button>
                {copyOpen && (
                  <section
                    id="routine-week-copy-panel"
                    className="routine-week-copy-panel"
                    role="dialog"
                    aria-label={`Copiar semana ${week + 1}`}
                  >
                    <div className="routine-week-copy-heading">
                      <strong>Copiar semana {week + 1}</strong>
                      <span>Elegí las semanas de destino</span>
                    </div>
                    <div className="routine-week-copy-options">
                      {doc.weeks.map(
                        (_, i) =>
                          i !== week && (
                            <label
                              key={i}
                              className={
                                copyTargets.includes(i) ? "is-selected" : ""
                              }
                            >
                              <input
                                type="checkbox"
                                checked={copyTargets.includes(i)}
                                onChange={(event) =>
                                  setCopyTargets((previous) =>
                                    event.target.checked
                                      ? [...previous, i].sort()
                                      : previous.filter((n) => n !== i),
                                  )
                                }
                              />
                              <CalendarDays size={17} aria-hidden="true" />
                              <span>Semana {i + 1}</span>
                            </label>
                          ),
                      )}
                    </div>
                    <p>
                      Se reemplazarán los días y ejercicios de las semanas
                      elegidas. La semana {week + 1} se conserva.
                    </p>
                    <div className="routine-week-copy-footer">
                      <button
                        className="routine-manage-button"
                        onClick={() => {
                          setCopyOpen(false);
                          copyTrigger.current?.focus();
                        }}
                      >
                        Cancelar
                      </button>
                      <button
                        className="button"
                        disabled={!copyTargets.length}
                        onClick={copyWeek}
                      >
                        {copyTargets.length
                          ? `Copiar a ${copyTargets.length} ${copyTargets.length === 1 ? "semana" : "semanas"}`
                          : "Elegí una semana"}
                      </button>
                    </div>
                  </section>
                )}
              </div>
            </div>
            <div className="routine-tabs" aria-label="Días">
              {doc.weeks[week].map((d, i) => (
                <button
                  className={"button " + (day === i ? "" : "secondary")}
                  aria-pressed={day === i}
                  key={d.id}
                  onClick={() => {
                    setDay(i);
                  }}
                >
                  Día {i + 1}
                </button>
              ))}
              {!scheduled && (
                <button
                  className="link-button"
                  disabled={atDayLimit}
                  onClick={() => {
                    mutate((d) => {
                      if (d.weeks[week].length >= 6) return;
                      d.weeks[week].push({
                        id: crypto.randomUUID(),
                        name: "Día " + (d.weeks[week].length + 1),
                        blocks: [],
                      });
                    });
                    if (!atDayLimit) setDay(doc.weeks[week].length);
                  }}
                >
                  + Día
                </button>
              )}
            </div>
            {scheduled ? (
              <p className="muted schedule-days-note routine-day-toolbar-schedule">
                <CalendarDays size={15} aria-hidden="true" />{" "}
                {doc.weeks[week].length}{" "}
                {doc.weeks[week].length === 1 ? "día" : "días"} de entrenamiento
                en esta semana
                <span>La agenda de asistencia se cambia en su ficha.</span>
              </p>
            ) : (
              <div
                className="routine-day-toolbar"
                aria-label="Acciones del día"
              >
                <div className="routine-day-toolbar-title">
                  <span>DÍA SELECCIONADO</span>
                  <strong>Día {day + 1}</strong>
                </div>
                <div className="routine-day-toolbar-actions">
                  <button
                    className="routine-manage-button"
                    aria-label="Duplicar día"
                    onClick={() => {
                      mutate((d) => {
                        if (d.weeks[week].length >= 6) return;
                        const copy = cloneRoutineDocument({
                          ...d,
                          weeks: [
                            [selected],
                            [selected],
                            [selected],
                            [selected],
                          ],
                        }).weeks[0][0];
                        copy.name = `Día ${day + 2}`;
                        copyRawInputs(selected, copy);
                        d.weeks[week].splice(day + 1, 0, copy);
                      });
                      if (!atDayLimit) setDay(day + 1);
                    }}
                    disabled={atDayLimit}
                  >
                    <Copy size={15} aria-hidden="true" />
                    Duplicar
                  </button>
                  <button
                    className="routine-manage-button"
                    aria-label="Mover día antes"
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
                    <ArrowLeft size={15} aria-hidden="true" />
                    Antes
                  </button>
                  <button
                    className="routine-manage-button"
                    aria-label="Mover día después"
                    disabled={day === doc.weeks[week].length - 1}
                    onClick={() => {
                      mutate((d) => {
                        [d.weeks[week][day], d.weeks[week][day + 1]] = [
                          d.weeks[week][day + 1],
                          d.weeks[week][day],
                        ];
                      });
                      setDay(day + 1);
                    }}
                  >
                    <ArrowRight size={15} aria-hidden="true" />
                    Después
                  </button>
                  <button
                    className="routine-manage-button is-danger"
                    aria-label="Eliminar día"
                    disabled={doc.weeks[week].length === 1}
                    onClick={() => {
                      if (
                        confirm(
                          `¿Eliminar «Día ${day + 1}» y sus bloques de la semana ${week + 1}?`,
                        )
                      ) {
                        mutate((d) => {
                          d.weeks[week].splice(day, 1);
                        });
                        setDay(Math.max(0, day - 1));
                      }
                    }}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                    Eliminar
                  </button>
                </div>
                {atDayLimit && (
                  <small className="routine-day-toolbar-limit">
                    Máximo de 6 días por semana.
                  </small>
                )}
              </div>
            )}
            {organizeMessage && (
              <p className="routine-week-copy-feedback" role="status">
                {organizeMessage}
              </p>
            )}
          </div>
          {!selected.blocks.length && (
            <div
              className={
                "routine-empty-drop" +
                (dragOver === "" ? " is-drop-target" : "")
              }
              {...dropProps("")}
            >
              <Plus size={24} aria-hidden="true" />
              <strong>Armá el primer bloque</strong>
              <span>Arrastrá un ejercicio del banco o usá Agregar bloque.</span>
            </div>
          )}
          <div className="stack blocks">
            {selected.blocks.map((block, bi) => (
              <section
                className={
                  "card routine-drop-block" +
                  (dragOver === block.id ? " is-drop-target" : "")
                }
                key={block.id}
                {...dropProps(block.id)}
                onFocusCapture={() => setTargetBlock(block.id)}
              >
                <div className="row spread">
                  <label className="field">
                    Bloque {bi + 1}
                    <input
                      maxLength={80}
                      value={block.name}
                      onChange={(e) =>
                        mutate((d) => {
                          d.weeks[week][day].blocks[bi].name = e.target.value;
                        })
                      }
                    />
                  </label>
                  <div className="row no-print block-actions">
                    <button
                      className="button secondary small"
                      aria-label="Duplicar bloque"
                      onClick={() =>
                        mutate((d) => {
                          const copy = cloneRoutineDocument({
                            ...d,
                            weeks: [
                              [selected],
                              [selected],
                              [selected],
                              [selected],
                            ],
                          }).weeks[0][0].blocks[bi];
                          d.weeks[week][day].blocks.splice(bi + 1, 0, copy);
                        })
                      }
                    >
                      <Copy size={16} aria-hidden="true" /> Duplicar
                    </button>
                    <button
                      className="button secondary icon-button"
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
                      className="button secondary icon-button"
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
                      className="button secondary icon-button"
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
                          for (const x of b.exercises)
                            x.warmup = b.type !== "main";
                        })
                      }
                    >
                      <option value="main">Principal</option>
                      <option value="approximation">Aproximación</option>
                      <option value="mobility">Movilidad</option>
                    </select>
                  </label>
                  <PresetField
                    label="Descanso del bloque"
                    value={block.macroRest}
                    options={restOptions}
                    format={restLabel}
                    pendingRaw={rawValues.current[block.id + ":macroRest"]}
                    onChange={(value) =>
                      mutate((d) => {
                        delete rawValues.current[block.id + ":macroRest"];
                        rawInvalid.current.delete(block.id + ":macroRest");
                        d.weeks[week][day].blocks[bi].macroRest = value;
                        d.weeks[week][day].blocks[bi].macroTarget = "blocks";
                      })
                    }
                  />
                  <p className="block-rest-note">
                    Al terminar este bloque, antes del siguiente.
                  </p>
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
                          className="button secondary icon-button"
                          disabled={ei === 0}
                          aria-label={"Subir " + exercise.name}
                          onClick={() =>
                            mutate((d) => {
                              const a = d.weeks[week][day].blocks[bi].exercises;
                              [a[ei - 1], a[ei]] = [a[ei], a[ei - 1]];
                            })
                          }
                        >
                          <ArrowUp size={16} aria-hidden="true" />
                        </button>
                        <button
                          className="button secondary icon-button"
                          disabled={ei === block.exercises.length - 1}
                          aria-label={"Bajar " + exercise.name}
                          onClick={() =>
                            mutate((d) => {
                              const a = d.weeks[week][day].blocks[bi].exercises;
                              [a[ei + 1], a[ei]] = [a[ei], a[ei + 1]];
                            })
                          }
                        >
                          <ArrowDown size={16} aria-hidden="true" />
                        </button>
                        <button
                          className="button secondary small"
                          aria-label={"Quitar " + exercise.name}
                          onClick={() =>
                            mutate((d) => {
                              d.weeks[week][day].blocks[bi].exercises.splice(
                                ei,
                                1,
                              );
                            })
                          }
                        >
                          Quitar
                        </button>
                      </div>
                    </div>
                    <PrescriptionFields
                      exercise={exercise}
                      rawValues={rawValues}
                      rawInvalid={rawInvalid}
                      onRawChange={() => change(doc)}
                      change={(prescription) =>
                        mutate((d) => {
                          d.weeks[week][day].blocks[bi].exercises[
                            ei
                          ].prescription = prescription;
                        })
                      }
                    />
                  </div>
                ))}
                <p className="block-drop-hint" aria-hidden="true">
                  {dragOver === block.id
                    ? "Soltá para agregar a este bloque"
                    : "Arrastrá un ejercicio del banco a este bloque"}
                </p>
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
                  macroTarget: "blocks",
                  exercises: [],
                }),
              )
            }
          >
            <Plus size={18} />
            Agregar bloque
          </button>
        </div>
      </div>
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
