import { saveLibrary } from "../../adapters/library";
import { PrivateMedia } from "./PrivateMedia";
import { useEffect, useState } from "react";
import {
  catalog,
  searchExercises,
  type ExerciseDefinition,
} from "@pulso/domain/catalog";
import art from "@pulso/domain/art";
import { cloud } from "../../adapters/supabase";
import { useData } from "../../app/DataProvider";
export function ExerciseLibrary() {
  const { db } = useData();
  const [query, setQuery] = useState(""),
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
  return (
    <>
      <p className="eyebrow">BIBLIOTECA</p>
      <h1>Ejercicios</h1>
      <p className="muted">
        {catalog.length} ejercicios iniciales. Las ilustraciones se abren a
        pedido.
      </p>
      <div className="row spread">
        <label className="field">
          Buscar ejercicio
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nombre, músculo, equipo"
          />
        </label>
        <button className="button" onClick={() => setForm(!form)}>
          Crear ejercicio propio
        </button>
      </div>
      {message && <p className="notice">{message}</p>}
      {form && (
        <form
          className="card stack blocks"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await saveLibrary(db, {
                workspaceId: db.scope.workspaceId,
                operationId: crypto.randomUUID(),
                id: crypto.randomUUID(),
                expectedRevision: 0,
                kind: "exercise",
                payload: { name, group, equipment, type },
              });
              setForm(false);
              void refresh();
            } catch (e) {
              setMessage((e as Error).message);
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
            Músculo principal
            <input
              required
              maxLength={80}
              value={group}
              onChange={(e) => setGroup(e.target.value)}
            />
          </label>
          <label className="field">
            Equipo
            <input
              value={equipment}
              onChange={(e) => setEquipment(e.target.value)}
            />
          </label>
          <label className="field">
            Registro
            <select
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
            >
              <option value="load_reps">Carga y repeticiones</option>
              <option value="reps">Repeticiones</option>
              <option value="time">Tiempo</option>
            </select>
          </label>
          <button className="button">Guardar ejercicio</button>
        </form>
      )}
      <div className="grid blocks">
        {searchExercises(query, [...own, ...catalog]).map((e) => (
          <div className="card" key={e.id}>
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
                className="link-button"
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
                {favorites.includes(e.id) ? "★ Favorito" : "☆"}
              </button>
            </div>
          </div>
        ))}
      </div>
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
            {own.some((e) => e.id === selected.id) && (
              <PrivateMedia exerciseId={selected.id} />
            )}
            <p>
              {selected.group} · {selected.equipment}
            </p>
            <p className="muted">
              Carga registrada en kg, bajo la misma convención en cada sesión.
              El entrenador define la técnica y adaptación.
            </p>
          </section>
        </div>
      )}
    </>
  );
}
export function ExerciseArt({ exerciseId }: { exerciseId: string }) {
  const item = art.find((a) => a.exerciseId === exerciseId);
  const [frame, setFrame] = useState(0),
    [playing, setPlaying] = useState(false),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    setFrame(0);
    setPlaying(false);
    setFailed(false);
  }, [exerciseId]);
  useEffect(() => {
    if (!playing || !item) return;
    const timer = setInterval(
      () => setFrame((x) => (x + 1) % item.frames.length),
      850,
    );
    return () => clearInterval(timer);
  }, [playing, item]);
  if (!item)
    return (
      <p className="notice">
        Sin ilustración disponible. Podés registrar el ejercicio normalmente.
      </p>
    );
  return (
    <>
      <div
        style={{ background: "#f7f8f4", borderRadius: 12, textAlign: "center" }}
      >
        {failed ? (
          <p>La ilustración no está disponible sin conexión.</p>
        ) : (
          <img
            loading="lazy"
            src={item.frames[frame].path}
            width={280}
            height={280}
            style={{ maxWidth: "100%", height: "auto" }}
            alt={"Posición " + (frame + 1) + " del ejercicio"}
            onError={() => setFailed(true)}
          />
        )}
      </div>
      <div className="row">
        <button
          className="button secondary"
          onClick={() => setPlaying(!playing)}
        >
          {playing ? "Pausar" : "Reproducir posiciones"}
        </button>
        <button
          className="link-button"
          onClick={() => {
            setPlaying(false);
            setFrame((frame + 1) % item.frames.length);
          }}
        >
          Siguiente posición
        </button>
      </div>
      <small>
        Ilustraciones de{" "}
        <a href={item.attribution.creatorUrl} target="_blank" rel="noreferrer">
          {item.attribution.creator}
        </a>{" "}
        ·{" "}
        <a href={item.attribution.licenseUrl} target="_blank" rel="noreferrer">
          {item.attribution.license}
        </a>
        .{" "}
        {"source" in item.attribution ? (
          <>
            Derivación atribuida a{" "}
            <a href={item.attribution.source!.url}>Everkinetic</a>.{" "}
          </>
        ) : null}
        <a href="/exercise-art/credits.json" target="_blank">
          Origen y créditos por cuadro
        </a>
        . Sin modificaciones del arte.
      </small>
    </>
  );
}
