import { saveLibrary, type LibraryCommand } from "../../adapters/library";
import { liveQuery } from "dexie";
import { Star, ImageOff } from "lucide-react";
import { useEffect, useState } from "react";
import {
  catalog,
  searchExercises,
  type ExerciseDefinition,
} from "@pulso/domain/catalog";
import { cloud } from "../../adapters/supabase";
import { useData } from "../../app/DataProvider";
export function ExerciseLibrary() {
  const { db } = useData();
  const [pendingSave, setPendingSave] = useState<LibraryCommand>();
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState(""),
    [saving, setSaving] = useState(false),
    [own, setOwn] = useState<ExerciseDefinition[]>([]),
    [favorites, setFavorites] = useState<string[]>([]),
    [selected, setSelected] = useState<ExerciseDefinition | null>(null),
    [form, setForm] = useState(false),
    [name, setName] = useState(""),
    [group, setGroup] = useState(""),
    [equipment, setEquipment] = useState(""),
    [type, setType] = useState<ExerciseDefinition["type"]>("load_reps"),
    [message, setMessage] = useState("");
  async function refresh() {
    const a = await cloud().from("custom_exercises").select("*");
    const b = await cloud().from("exercise_favorites").select("exercise_id");
    if (a.data) setOwn(a.data.map((e) => ({ ...e, aliases: [] })));
    if (b.data) setFavorites(b.data.map((e) => e.exercise_id));
  }
  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => {
    const sub = liveQuery(() => db.meta.get("library-pending")).subscribe(
      (entry) => {
        const command = entry?.value as LibraryCommand | undefined;
        setPendingSave(
          command && !command.kind.startsWith("template") ? command : undefined,
        );
      },
    );
    return () => sub.unsubscribe();
  }, [db]);
  const groups = [...new Set([...catalog, ...own].map((e) => e.group))];
  const results = searchExercises(query, [...own, ...catalog]).filter(
    (e) => !filter || e.group === filter,
  );
  return (
    <>
      <p className="eyebrow">BIBLIOTECA</p>
      <h1>Ejercicios</h1>
      <p className="muted">
        {catalog.length + own.length} ejercicios organizados por grupo muscular.
      </p>
      <div className="catalog-toolbar">
        <label className="field">
          Buscar ejercicio
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nombre, músculo o material"
          />
        </label>
        <label className="field">
          Filtrar por grupo muscular
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">Todos los grupos</option>
            {groups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <button
          className="button"
          aria-expanded={form}
          onClick={() => setForm(!form)}
        >
          Crear ejercicio propio
        </button>
      </div>
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {pendingSave && (
        <div className="notice row">
          <span>Hay un ejercicio o favorito pendiente de guardar.</span>
          <button
            className="button secondary"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await saveLibrary(db, pendingSave);
                await refresh();
                setMessage("Cambio guardado.");
              } catch (e) {
                setMessage((e as Error).message);
              } finally {
                setSaving(false);
              }
            }}
          >
            Reintentar guardado
          </button>
        </div>
      )}
      {form && (
        <form
          className="card stack blocks"
          onSubmit={async (e) => {
            e.preventDefault();
            if (saving) return;
            setSaving(true);
            setMessage("");
            try {
              await saveLibrary(db, {
                workspaceId: db.scope.workspaceId,
                operationId: crypto.randomUUID(),
                id: crypto.randomUUID(),
                expectedRevision: 0,
                kind: "exercise",
                payload: {
                  name: name.trim(),
                  group,
                  equipment: equipment.trim() || "Sin material",
                  type,
                },
              });
              setForm(false);
              setName("");
              setGroup("");
              setEquipment("");
              await refresh();
            } catch (e) {
              setMessage((e as Error).message);
            } finally {
              setSaving(false);
            }
          }}
        >
          <label className="field">
            Nombre
            <input
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="field">
            Grupo muscular
            <select
              aria-label="Grupo muscular"
              required
              value={group}
              onChange={(e) => setGroup(e.target.value)}
            >
              <option value="">Elegí un grupo</option>
              {groups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Material
            <input
              placeholder="Por ejemplo: barra, mancuernas o sin material"
              maxLength={80}
              value={equipment}
              onChange={(e) => setEquipment(e.target.value)}
            />
          </label>
          <label className="field">
            Qué vas a registrar
            <select
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
            >
              <option value="load_reps">Peso (kg) y repeticiones</option>
              <option value="reps">Solo repeticiones</option>
              <option value="time">Tiempo (segundos)</option>
            </select>
          </label>
          <p className="muted">
            El material es lo que se usa para realizar el ejercicio. El tipo de
            registro define los valores que vas a anotar durante el
            entrenamiento.
          </p>
          <div className="row">
            <button className="button" disabled={saving}>
              {saving ? "Guardando…" : "Guardar ejercicio"}
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={() => setForm(false)}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
      <p className="muted" role="status">
        {results.length} ejercicios encontrados
      </p>
      {!results.length && (
        <div className="card">
          <h2>No encontramos ejercicios</h2>
          <p>Probá con otro nombre o elegí otro grupo muscular.</p>
        </div>
      )}
      {groups
        .filter((g) => results.some((e) => e.group === g))
        .map((g) => (
          <section className="exercise-group" key={g} aria-label={g}>
            <h2>
              {g}{" "}
              <span className="badge">
                {results.filter((e) => e.group === g).length}
              </span>
            </h2>
            <div className="grid exercise-grid">
              {results
                .filter((e) => e.group === g)
                .map((e) => (
                  <article className="card exercise-card" key={e.id}>
                    <h3>{e.name}</h3>
                    <p className="muted">
                      {e.group} · {e.equipment}
                    </p>
                    <div className="row">
                      <button
                        className="button secondary"
                        onClick={() => setSelected(e)}
                      >
                        Ver detalle
                      </button>
                      <button
                        className="button secondary favorite-button"
                        aria-pressed={favorites.includes(e.id)}
                        aria-label={"Favorito " + e.name}
                        onClick={async () => {
                          try {
                            await saveLibrary(db, {
                              workspaceId: db.scope.workspaceId,
                              operationId: crypto.randomUUID(),
                              kind: "favorite",
                              payload: {
                                exerciseId: e.id,
                                enabled: !favorites.includes(e.id),
                              },
                            });
                            void refresh();
                          } catch (e) {
                            setMessage((e as Error).message);
                          }
                        }}
                      >
                        <Star
                          size={18}
                          aria-hidden="true"
                          fill={
                            favorites.includes(e.id) ? "currentColor" : "none"
                          }
                        />
                        <span className="sr-only">
                          {favorites.includes(e.id)
                            ? "Favorito"
                            : "Agregar a favoritos"}
                        </span>
                      </button>
                    </div>
                  </article>
                ))}
            </div>
          </section>
        ))}
      {selected && (
        <div className="modal-backdrop">
          <section
            className="card modal stack"
            role="dialog"
            aria-modal="true"
            aria-label={selected.name}
          >
            <div className="row spread">
              <h2>{selected.name}</h2>
              <button className="link-button" onClick={() => setSelected(null)}>
                Cerrar
              </button>
            </div>
            <ExerciseArt exerciseId={selected.id} />
            <p>
              {selected.group} · {selected.equipment}
            </p>
            <p className="muted">
              {selected.type === "load_reps"
                ? "Registrá el peso en kg y las repeticiones."
                : selected.type === "reps"
                  ? "Registrá la cantidad de repeticiones."
                  : "Registrá el tiempo en segundos."}{" "}
              El entrenador define la técnica y adaptación.
            </p>
          </section>
        </div>
      )}
    </>
  );
}
export function ExerciseArt(_props: { exerciseId: string }) {
  return (
    <div className="exercise-placeholder">
      <ImageOff size={32} aria-hidden="true" />
      <strong>Sin ilustración disponible</strong>
      <span>Podés registrar el ejercicio normalmente.</span>
    </div>
  );
}
