import { RoutinePrint } from "./RoutinePrint";
import { useEffect, useState, useRef } from "react";
import { Link, useParams } from "react-router-dom";
import { Plus, ArrowUp, ArrowDown, Trash2 } from "lucide-react";
import {
  blankRoutine,
  cloneRoutineDocument,
  validateRoutine,
  type RoutineDocument,
  type Block,
  type Position,
} from "@pulso/domain/routines";
import {
  searchExercises,
  type ExerciseDefinition,
} from "@pulso/domain/catalog";
import { NumericField } from "../../components/NumericField";
import { useData } from "../../app/DataProvider";
import { cloud } from "../../adapters/supabase";
import { TemplateTools } from "./TemplateTools";
import { parseNumber } from "@pulso/domain/numbers";
import { catalog } from "@pulso/domain/catalog";
import { DraftComparison } from "./DraftComparison";
import { gateway } from "../../adapters/supabase-gateway";
import type { StudentSnapshot } from "@pulso/domain/contracts";
export function RoutineList() {
  const { rows } = useData();
  return (
    <>
      <p className="eyebrow">PREPARÁ EL PRÓXIMO PASO</p>
      <h1>Rutinas</h1>
      <Link className="button secondary" to="/biblioteca">
        Explorar biblioteca de ejercicios
      </Link>
      <div className="grid">
        {rows
          .filter((r) => !r.projection.student.archived)
          .map((r) => (
            <Link
              className="card student-card"
              key={r.studentId}
              to={"/rutinas/" + r.studentId}
            >
              <h2>{r.projection.student.name}</h2>
              <p>
                {r.projection.routine?.document.name ??
                  "Crear su primera rutina"}
              </p>
              <span className="badge">
                {r.projection.period?.month ?? "Sin asignar"}
              </span>
            </Link>
          ))}
      </div>
      {!rows.length && (
        <Link className="button" to="/alumnos">
          Agregar alumnos
        </Link>
      )}
    </>
  );
}
export function RoutineBuilder() {
  const { id } = useParams();
  const { rows, db, onlineCommand } = useData();
  const row = rows.find((r) => r.studentId === id);
  const [doc, setDoc] = useState<RoutineDocument>(blankRoutine),
    [week, setWeek] = useState(0),
    [day, setDay] = useState(0),
    [draftId, setDraftId] = useState<string>(() => crypto.randomUUID()),
    [draftRevision, setDraftRevision] = useState(0),
    [base, setBase] = useState<string | null>(null),
    [studentRevision, setStudentRevision] = useState(0),
    [loaded, setLoaded] = useState(false),
    [dirty, setDirty] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [searchBlock, setSearchBlock] = useState<string | null>(null),
    [query, setQuery] = useState("");
  const rawValues = useRef<Record<string, string>>({});
  const rawInvalid = useRef(new Set<string>());
  const [comparison, setComparison] = useState<{
    base: RoutineDocument;
    remote: StudentSnapshot;
  } | null>(null);
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
  useEffect(() => {
    if (!row) return;
    let active = true;
    void (async () => {
      const local = await db.meta.get("draft:" + id);
      if (local) {
        const l = local.value as {
          doc: RoutineDocument;
          draftId: string;
          draftRevision: number;
          base: string | null;
          studentRevision: number;
          rawValues?: Record<string, string>;
        };
        if (active) {
          rawValues.current = l.rawValues ?? {};
          rawInvalid.current = new Set(
            Object.entries(rawValues.current)
              .filter(
                ([key, value]) =>
                  value.trim() !== "" &&
                  !parseNumber(
                    key.split(":").at(-1) as Parameters<typeof parseNumber>[0],
                    value,
                  ).ok,
              )
              .map(([key]) => key),
          );
          setDoc(l.doc);
          setDraftId(l.draftId);
          setDraftRevision(l.draftRevision);
          setBase(l.base);
          setStudentRevision(l.studentRevision);
          setDirty(true);
          setLoaded(true);
        }
        return;
      }
      const { data, error } = await cloud()
        .from("routine_drafts")
        .select("*")
        .eq("student_id", id!)
        .order("updated_at", { ascending: false })
        .limit(1);
      if (!active) return;
      if (error) {
        setError(
          "No se pudo cargar el borrador. Volvé a intentar con conexión.",
        );
        return;
      }
      if (data?.[0]) {
        setDoc(data[0].document);
        setDraftId(data[0].id);
        setDraftRevision(data[0].revision);
        setBase(data[0].base_revision_id);
      } else {
        setDoc(row.projection.routine?.document ?? blankRoutine());
        setBase(row.projection.routine?.id ?? null);
      }
      setStudentRevision(row.confirmed.revision);
      setLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, [row?.studentId, db, id]);
  function change(next: RoutineDocument) {
    const valid = new Set(
      next.weeks.flatMap((w) =>
        w.flatMap((d) =>
          d.blocks.flatMap((b) => [b.id, ...b.exercises.map((e) => e.id)]),
        ),
      ),
    );
    for (const key of Object.keys(rawValues.current))
      if (!valid.has(key.split(":")[0])) {
        delete rawValues.current[key];
        rawInvalid.current.delete(key);
      }

    setDoc(next);
    setDirty(true);
    setMessage("");
    void db.meta
      .put({
        key: "draft:" + id,
        value: {
          doc: next,
          draftId,
          draftRevision,
          base,
          studentRevision,
          rawValues: rawValues.current,
        },
      })
      .catch(() =>
        setError("No se pudo conservar el borrador en este dispositivo."),
      );
  }
  function mutate(fn: (copy: RoutineDocument) => void) {
    const next = structuredClone(doc);
    fn(next);
    change(next);
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      if (rawInvalid.current.size)
        throw Error("Completá o corregí los campos antes de guardar.");
      const issues = validateRoutine(doc);
      if (issues.length) throw Error(issues[0]);
      const snapshot = await onlineCommand(
        id!,
        "save_draft",
        {
          draftId,
          expectedDraftRevision: draftRevision,
          baseRoutineRevisionId: base,
          document: doc,
        },
        studentRevision,
      );
      setDraftRevision(draftRevision + 1);
      setStudentRevision(snapshot.revision);
      setDirty(false);
      rawValues.current = {};
      await db.meta.delete("draft:" + id);
      setMessage("Borrador guardado. Todavía no cambia la rutina activa.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function publish() {
    setBusy(true);
    setError("");
    try {
      if (row?.projection.sessions.length)
        throw Error(
          "Finalizá el entrenamiento abierto antes de activar una nueva rutina.",
        );
      if (dirty || !draftRevision)
        throw Error("Guardá el borrador antes de activar.");
      const issues = validateRoutine(doc, true);
      if (issues.length) throw Error(issues[0]);
      const snapshot = await onlineCommand(
        id!,
        "publish_routine",
        {
          draftId,
          expectedDraftRevision: draftRevision,
          baseRoutineRevisionId: base,
          targetMonth: new Intl.DateTimeFormat("en-CA", {
            timeZone: "America/Argentina/Buenos_Aires",
            year: "numeric",
            month: "2-digit",
          }).format(new Date()),
        },
        studentRevision,
      );
      setBase(snapshot.routine!.id);
      setStudentRevision(snapshot.revision);
      setDraftId(crypto.randomUUID());
      setDraftRevision(0);
      setMessage("Rutina activa. La versión anterior se conserva.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
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
  if (!row || !loaded) return <p role="status">Cargando borrador… {error}</p>;
  const selected = doc.weeks[week][day];
  return (
    <>
      <Link to={"/alumnos/" + id}>← {row.projection.student.name}</Link>
      <header className="page-heading">
        <div>
          <p className="eyebrow">PROGRAMACIÓN MENSUAL</p>
          <h1>Constructor de rutina</h1>
          <p className="muted">
            {row.projection.student.name} ·{" "}
            {dirty ? "Cambios sin publicar" : "Borrador de trabajo"}
          </p>
        </div>
        <div className="row no-print">
          <button className="button secondary" disabled={busy} onClick={save}>
            Guardar borrador
          </button>
          <button className="button" disabled={busy} onClick={publish}>
            Activar rutina
          </button>
        </div>
      </header>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      <div className="row no-print">
        <button
          className="button secondary"
          onClick={async () => {
            try {
              const remote = await gateway(db.scope).fetchStudent(
                db.scope,
                id!,
              );
              if (!remote.routine)
                throw Error("No hay rutina vigente para comparar.");
              const original = base
                ? await cloud()
                    .from("routine_revisions")
                    .select("document")
                    .eq("id", base)
                    .single()
                : null;
              if (original?.error) throw original.error;
              setComparison({
                base: original?.data?.document ?? blankRoutine(),
                remote,
              });
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Comparar con rutina vigente
        </button>
        <button
          className="link-button"
          onClick={async () => {
            if (
              !confirm(
                "Descartar este borrador local y partir de la rutina vigente. ¿Continuar?",
              )
            )
              return;
            const current = await gateway(db.scope).fetchStudent(db.scope, id!);
            setDoc(current.routine?.document ?? blankRoutine());
            setBase(current.routine?.id ?? null);
            setDraftId(crypto.randomUUID());
            setDraftRevision(0);
            setStudentRevision(current.revision);
            setDirty(false);
            rawInvalid.current.clear();
            await db.meta.delete("draft:" + id);
          }}
        >
          Descartar borrador local
        </button>
      </div>
      {comparison && (
        <DraftComparison
          base={comparison.base}
          local={doc}
          remote={comparison.remote.routine!.document}
          onCancel={() => setComparison(null)}
          onApply={(next) => {
            const nextId = crypto.randomUUID(),
              nextBase = comparison.remote.routine!.id,
              nextRevision = comparison.remote.revision;
            setDoc(next);
            setBase(nextBase);
            setDraftId(nextId);
            setDraftRevision(0);
            setStudentRevision(nextRevision);
            setDirty(true);
            rawInvalid.current.clear();
            void db.meta.put({
              key: "draft:" + id,
              value: {
                doc: next,
                draftId: nextId,
                draftRevision: 0,
                base: nextBase,
                studentRevision: nextRevision,
              },
            });
            setComparison(null);
            setMessage("Borrador revisado. Guardalo antes de activar.");
          }}
        />
      )}
      <fieldset disabled={busy} className="editor-fields">
        <TemplateTools document={doc} onApply={change} />
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
          <div className="row spread">
            <div className="row">
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
          <div className="row">
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
          <div className="row no-print">
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
                <NumericField
                  label="Descanso macro (s)"
                  field="macroRest"
                  value={block.macroRest}
                  rawValue={rawValues.current[block.id + ":macroRest"]}
                  onRaw={(raw) => {
                    const key = block.id + ":macroRest";
                    rawValues.current[key] = raw;
                    if (raw.trim() !== "" && !parseNumber("macroRest", raw).ok)
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
                        microRest: "Descanso micro (s)",
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
                            if (raw.trim() !== "" && !parseNumber(f, raw).ok)
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
      <RoutinePrint document={doc} student={row.projection.student.name} />
    </>
  );
}
