import { saveLibrary, type LibraryCommand } from "../../adapters/library";
import { liveQuery } from "dexie";
import { Star, ImageOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  catalog,
  searchExercises,
  type ExerciseDefinition,
} from "@pulso/domain/catalog";
import { cloud } from "../../adapters/supabase";
import { useData } from "../../app/DataProvider";
import "./exercise-library.css";
export function ExerciseLibrary() {
  const { db } = useData();
  const [pendingSave, setPendingSave] = useState<LibraryCommand>();
  const [pendingLoaded, setPendingLoaded] = useState(false);
  const [favoritesLoaded, setFavoritesLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [savingFavorite, setSavingFavorite] = useState<string>();
  const [favoriteFeedback, setFavoriteFeedback] = useState<{
    id: string;
    text: string;
  }>();
  const savingRef = useRef(false);
  const loadVersion = useRef(0);
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
  const refresh = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoading(true);
    setLoadError("");
    const [exercises, savedFavorites] = await Promise.allSettled([
      cloud()
        .from("custom_exercises")
        .select("*")
        .eq("workspace_id", db.scope.workspaceId),
      cloud()
        .from("exercise_favorites")
        .select("exercise_id")
        .eq("workspace_id", db.scope.workspaceId),
    ]);
    if (version !== loadVersion.current) return;
    const errors: string[] = [];
    if (
      exercises.status === "fulfilled" &&
      !exercises.value.error &&
      exercises.value.data
    )
      setOwn(exercises.value.data.map((e) => ({ ...e, aliases: [] })));
    else errors.push("No se pudieron cargar tus ejercicios propios.");
    if (
      savedFavorites.status === "fulfilled" &&
      !savedFavorites.value.error &&
      savedFavorites.value.data
    ) {
      setFavorites(savedFavorites.value.data.map((e) => e.exercise_id));
      setFavoritesLoaded(true);
    } else
      errors.push(
        "No se pudieron cargar tus favoritos. Reintentá para ver el estado guardado.",
      );
    setLoadError(errors.join(" "));
    setLoading(false);
  }, [db]);
  useEffect(() => {
    setFavoritesLoaded(false);
    setFavorites([]);
    setOwn([]);
    void refresh();
    return () => {
      loadVersion.current++;
    };
  }, [refresh]);
  useEffect(() => {
    setPendingLoaded(false);
    const sub = liveQuery(() => db.meta.get("library-pending")).subscribe(
      (entry) => {
        const command = entry?.value as LibraryCommand | undefined;
        setPendingSave(command);
        setPendingLoaded(true);
      },
    );
    return () => sub.unsubscribe();
  }, [db]);
  async function saveChange(command: LibraryCommand) {
    if (savingRef.current || loading) return false;
    savingRef.current = true;
    setSaving(true);
    setMessage("");
    const exerciseId =
      command.kind === "favorite"
        ? String(command.payload.exerciseId)
        : undefined;
    setSavingFavorite(exerciseId);
    setFavoriteFeedback(undefined);
    try {
      await saveLibrary(db, command);
      setPendingSave(undefined);
      if (exerciseId) {
        // The acknowledged write is authoritative; a second read can fail or
        // return an older snapshot and must not undo the confirmed star.
        setFavorites((current) =>
          command.payload.enabled
            ? [...new Set([...current, exerciseId])]
            : current.filter((id) => id !== exerciseId),
        );
        const text = command.payload.enabled
          ? "Agregado a favoritos."
          : "Quitado de favoritos.";
        setFavoriteFeedback({ id: exerciseId, text });
        setMessage(text);
      } else {
        await refresh();
        setMessage("Ejercicio guardado.");
      }
      return true;
    } catch (error) {
      const text = (error as Error).message;
      setMessage(text);
      if (exerciseId) setFavoriteFeedback({ id: exerciseId, text });
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
      setSavingFavorite(undefined);
    }
  }
  const pendingFavoriteId =
    pendingSave?.kind === "favorite"
      ? String(pendingSave.payload.exerciseId)
      : undefined;
  const pendingTemplate = pendingSave?.kind.startsWith("template");
  const blocked = saving || loading || !pendingLoaded || Boolean(pendingSave);
  const groups = [...new Set([...catalog, ...own].map((e) => e.group))];
  const results = searchExercises(query, [...own, ...catalog]).filter(
    (e) =>
      (!filter || e.group === filter) &&
      (!onlyFavorites || favorites.includes(e.id)),
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
          className="button secondary favorites-filter"
          aria-label="Solo favoritos"
          aria-pressed={onlyFavorites}
          disabled={!favoritesLoaded}
          onClick={() => setOnlyFavorites(!onlyFavorites)}
        >
          <Star
            size={18}
            aria-hidden="true"
            fill={onlyFavorites ? "currentColor" : "none"}
          />
          Solo favoritos ({favorites.length})
        </button>
        <button
          className="button"
          aria-expanded={form}
          onClick={() => setForm(!form)}
        >
          Crear ejercicio propio
        </button>
      </div>
      {loading && (
        <p className="muted" role="status">
          Cargando tus ejercicios y favoritos…
        </p>
      )}
      {loadError && (
        <div className="notice row" role="alert">
          <span>{loadError}</span>
          <button
            className="button secondary"
            disabled={saving || loading}
            onClick={() => void refresh()}
          >
            Reintentar carga
          </button>
        </div>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {pendingSave && !saving && (
        <div className="notice row">
          <span>
            {pendingTemplate
              ? "Hay una plantilla pendiente de guardar. Reintentá desde su editor antes de cambiar favoritos."
              : pendingFavoriteId
                ? "Hay un cambio de favorito pendiente de confirmar."
                : "Hay un ejercicio pendiente de guardar."}
          </span>
          {pendingTemplate ? (
            <a
              className="button secondary"
              href={"/rutinas/plantillas/" + pendingSave.id}
            >
              Abrir plantilla pendiente
            </a>
          ) : (
            <button
              className="button secondary"
              disabled={saving || loading}
              onClick={() => void saveChange(pendingSave)}
            >
              Reintentar guardado
            </button>
          )}
        </div>
      )}
      {form && (
        <form
          className="card stack blocks"
          onSubmit={async (e) => {
            e.preventDefault();
            if (blocked) return;
            const saved = await saveChange({
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
            if (saved) {
              setForm(false);
              setName("");
              setGroup("");
              setEquipment("");
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
            <button className="button" disabled={blocked}>
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
          <h2>
            {onlyFavorites
              ? "No hay favoritos con estos filtros"
              : "No encontramos ejercicios"}
          </h2>
          <p>
            {onlyFavorites
              ? "Marcá la estrella de un ejercicio para encontrarlo acá. También podés cambiar la búsqueda o el grupo muscular."
              : "Probá con otro nombre o elegí otro grupo muscular."}
          </p>
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
                    <div className="row exercise-actions">
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
                        title={
                          favorites.includes(e.id)
                            ? "Quitar de favoritos"
                            : "Agregar a favoritos"
                        }
                        disabled={blocked || !favoritesLoaded}
                        aria-busy={savingFavorite === e.id}
                        onClick={() => {
                          if (blocked || !favoritesLoaded) return;
                          void saveChange({
                            workspaceId: db.scope.workspaceId,
                            operationId: crypto.randomUUID(),
                            kind: "favorite",
                            payload: {
                              exerciseId: e.id,
                              enabled: !favorites.includes(e.id),
                            },
                          });
                        }}
                      >
                        <Star
                          size={18}
                          aria-hidden="true"
                          fill={
                            favorites.includes(e.id) ? "currentColor" : "none"
                          }
                        />
                        <span>Favorito</span>
                      </button>
                    </div>
                    {pendingFavoriteId === e.id && !saving ? (
                      <div className="favorite-feedback" role="status">
                        <span>Cambio pendiente de confirmar.</span>
                        <button
                          className="link-button"
                          disabled={loading}
                          onClick={() => void saveChange(pendingSave!)}
                        >
                          Reintentar favorito
                        </button>
                      </div>
                    ) : (
                      favoriteFeedback?.id === e.id && (
                        <p className="favorite-feedback" role="status">
                          {favoriteFeedback.text}
                        </p>
                      )
                    )}
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
