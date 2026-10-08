import { LoadingState } from "../../components/LoadingState";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowUpRight, ClipboardList, Plus } from "lucide-react";
import { liveQuery } from "dexie";
import { blankRoutine } from "@pulso/domain/routines";
import { useData } from "../../app/DataProvider";
import { cloud } from "../../adapters/supabase";
import {
  createTemplateDraft,
  templatePath,
  type TemplateDraft,
} from "./template-drafts";
import "./routine-editor.css";

type Entry = { id: string; name: string; updated_at: string };
export function RoutineCatalog() {
  const { db } = useData();
  const navigate = useNavigate();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [drafts, setDrafts] = useState<TemplateDraft[]>([]);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [search, setSearch] = useState(""),
    [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const sub = liveQuery(() => db.meta.toArray()).subscribe((rows) =>
      setDrafts(
        rows
          .filter((r) => r.key.startsWith("template-draft:"))
          .map((r) => r.value as TemplateDraft),
      ),
    );
    return () => sub.unsubscribe();
  }, [db]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void (async () => {
      // Paginate so a growing catalog does not silently stop at the API row limit.
      const all: Entry[] = [];
      try {
        for (let from = 0; ; from += 100) {
          const { data, error } = await cloud()
            .from("routine_templates")
            .select("id,name,updated_at")
            .order("name")
            .order("id")
            .range(from, from + 99);
          if (error) throw error;
          if (!active) return;
          all.push(...(data ?? []));
          if (!data || data.length < 100) break;
        }
        setEntries(all);
      } catch {
        if (active)
          setError(
            "No se pudo cargar el catálogo. Tus borradores de este dispositivo siguen disponibles.",
          );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [reload]);
  const items = [
    ...drafts.map((d) => ({ id: d.id, name: d.document.name, draft: true })),
    ...entries
      .filter((e) => !drafts.some((d) => d.id === e.id))
      .map((e) => ({ ...e, draft: false })),
  ].filter((e) =>
    e.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  return (
    <div className="routine-workspace routine-catalog">
      <header className="page-heading">
        <div>
          <p className="eyebrow">TU CATÁLOGO</p>
          <h1>Rutinas</h1>
          <p className="muted">
            Creá rutinas reutilizables y usalas como punto de partida desde la
            ficha de cada alumno.
          </p>
        </div>
        <button
          className="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              navigate(
                templatePath(await createTemplateDraft(db, blankRoutine())),
              );
            } catch {
              setError(
                "No se pudo guardar el nuevo borrador en este dispositivo. Reintentá.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <Plus size={18} aria-hidden="true" />
          Crear plantilla
        </button>
      </header>
      {error && (
        <div className="error" role="alert">
          <p>{error}</p>
          <button
            className="button secondary"
            onClick={() => setReload((r) => r + 1)}
          >
            Reintentar
          </button>
        </div>
      )}
      <label className="field catalog-search">
        Buscar rutina
        <input
          type="search"
          value={search}
          placeholder="Nombre de la rutina"
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      {loading && <LoadingState label="Cargando catálogo…" />}
      <div className="template-grid">
        {items.map((entry) => (
          <Link
            className="card template-card"
            to={templatePath(entry.id)}
            key={entry.id}
          >
            <div className="row spread">
              <ClipboardList size={24} aria-hidden="true" />
              <span className="badge">
                {entry.draft ? "Borrador en este dispositivo" : "Plantilla"}
              </span>
            </div>
            <h2>{entry.name || "Rutina sin nombre"}</h2>
            <span className="template-open">
              {entry.draft ? "Continuar edición" : "Ver rutina"}
              <ArrowUpRight size={18} aria-hidden="true" />
            </span>
          </Link>
        ))}
      </div>
      {!loading && !items.length && (
        <section className="card routine-empty">
          <h2>
            {search
              ? "No encontramos esa rutina"
              : "Tus próximas rutinas empiezan acá"}
          </h2>
          <p className="muted">
            {search
              ? "Probá con otro nombre."
              : "Creá una plantilla desde cero o guardá una copia de una rutina desde la ficha de un alumno."}
          </p>
        </section>
      )}
    </div>
  );
}
