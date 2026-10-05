import { useEffect, useRef, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { Plus, ClipboardList, Download, Copy, Check } from "lucide-react";
import {
  blankRoutine,
  cloneRoutineDocument,
  validateRoutine,
  type RoutineDocument,
} from "@pulso/domain/routines";
import { cloud } from "../../adapters/supabase";
import { RoutineFields } from "../routines/RoutineFields";
import { RoutineSummary } from "../routines/RoutineSummary";
import { DocumentPreview } from "../../components/DocumentPreview";
import { RoutinePrint } from "../routines/RoutinePrint";
import {
  command,
  dateLabel,
  gymError,
  routineColumns,
  rows,
  useResource,
  type GymRoutine,
  type GymRevision,
} from "./api";
import { useGym } from "./GymPortal";
import { Empty, LoadState, Modal, PageHeading } from "./ui";
import "../routines/routine-editor.css";

const sourceName = {
  catalog: "Del gimnasio",
  personal: "Personalizada",
  own: "Mi rutina",
};
export function GymRoutines() {
  const { access, refresh } = useGym(),
    admin = access.mode === "admin",
    base = admin ? "/gimnasio/rutinas" : "/mi-entrenamiento/rutinas",
    navigate = useNavigate();
  const data = useResource(
    () =>
      rows<GymRoutine[]>(
        cloud()
          .from("gym_routines")
          .select(routineColumns)
          .order("updated_at", { ascending: false }),
      ),
    access.gymId + access.userId,
  );
  const [query, setQuery] = useState(""),
    [view, setView] = useState<GymRoutine | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [filter, setFilter] = useState("catalog");
  const list = data.value?.filter(
    (r) =>
      (admin
        ? filter === "draft"
          ? r.has_draft
          : r.kind === "catalog"
        : r.kind === filter) &&
      r.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  return (
    <>
      <PageHeading
        eyebrow={admin ? "TU CATÁLOGO" : "ELEGÍ CÓMO ENTRENAR"}
        title="Rutinas"
        description={
          admin
            ? "Prepará rutinas reutilizables para tu gimnasio. Publicalas cuando estén listas."
            : "Elegí del catálogo, usá una personalizada o prepará tu única rutina propia."
        }
        actions={
          admin && (
            <Link className="button" to={base + "/nueva"}>
              <Plus size={18} />
              Crear rutina
            </Link>
          )
        }
      />
      <div className="gym-tabs" role="group" aria-label="Origen de las rutinas">
        {(admin
          ? [
              ["catalog", "Catálogo"],
              ["draft", "Borradores"],
            ]
          : [
              ["catalog", "Del gimnasio"],
              ["personal", "Personalizadas para mí"],
              ["own", "Mi rutina"],
            ]
        ).map(([key, label]) => (
          <button
            key={key}
            className={"button " + (filter === key ? "" : "secondary")}
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <label className="field gym-search">
        Buscar rutina
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nombre de la rutina"
        />
      </label>
      <LoadState {...data} retry={data.reload} />
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="gym-grid">
        {list?.map((r) => (
          <article className="card stack" key={r.id}>
            <div className="gym-heading-row">
              <ClipboardList size={22} />
              <span className="badge">
                {access.selectedRevisionId === r.published_revision_id &&
                r.published_revision_id
                  ? "Seleccionada"
                  : r.retired
                    ? "Retirada"
                    : r.published_revision_id
                      ? sourceName[r.kind]
                      : "Borrador"}
              </span>
            </div>
            <h2>{r.name}</h2>
            <p className="muted">{dateLabel(r.updated_at)}</p>
            <div className="gym-actions">
              {r.published_revision_id && (
                <button className="button secondary" onClick={() => setView(r)}>
                  Ver rutina
                </button>
              )}
              {((admin && r.kind !== "own") ||
                (!admin && r.kind === "own")) && (
                <Link className="button secondary" to={base + "/" + r.id}>
                  {r.published_revision_id ? "Editar" : "Continuar borrador"}
                </Link>
              )}
              {!admin && r.published_revision_id && !r.retired && (
                <button
                  className="button"
                  disabled={
                    busy ||
                    access.selectedRevisionId === r.published_revision_id
                  }
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                      await command("select_routine", {
                        revisionId: r.published_revision_id,
                      });
                      await refresh();
                    } catch (e) {
                      setError(gymError(e));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {access.selectedRevisionId === r.published_revision_id ? (
                    <>
                      <Check size={18} />
                      En uso
                    </>
                  ) : (
                    "Elegir rutina"
                  )}
                </button>
              )}
              {admin && r.published_revision_id && (
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const revision = await rows<GymRevision>(
                        cloud()
                          .from("gym_routine_revisions")
                          .select("*")
                          .eq("id", r.published_revision_id)
                          .single(),
                      );
                      const doc = cloneRoutineDocument(revision.document);
                      doc.name = (doc.name + " · Copia").slice(0, 120);
                      const copy = await command("save_routine", {
                        kind: "catalog",
                        document: doc,
                      });
                      navigate(base + "/" + copy.id);
                    } catch (e) {
                      setError(gymError(e));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Copy size={16} />
                  Duplicar
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      {list?.length === 0 && (
        <Empty
          title={
            query
              ? "Sin coincidencias"
              : filter === "own"
                ? "Tu rutina, a tu manera"
                : filter === "personal"
                  ? "Todavía no tenés una personalizada"
                  : "Todavía no hay rutinas"
          }
        >
          <p>
            {filter === "own"
              ? "Podés crear una rutina propia y editarla cuando lo necesites."
              : filter === "personal"
                ? "Tu gimnasio puede preparar una rutina especialmente para vos."
                : "Las rutinas aparecerán acá cuando estén disponibles."}
          </p>
          {filter === "own" && !admin && !query && (
            <Link className="button" to={base + "/nueva"}>
              <Plus size={18} />
              Crear mi rutina
            </Link>
          )}
        </Empty>
      )}
      {view && <RoutineView routine={view} close={() => setView(null)} />}
    </>
  );
}
export function RoutineView({
  routine,
  close,
}: {
  routine: GymRoutine;
  close: () => void;
}) {
  const data = useResource(
    () =>
      rows<GymRevision>(
        cloud()
          .from("gym_routine_revisions")
          .select("*")
          .eq("id", routine.published_revision_id)
          .single(),
      ),
    routine.id,
  );
  const [exporting, setExporting] = useState(false);
  return (
    <>
      {exporting && data.value ? (
        <DocumentPreview
          title={data.value.document.name}
          onClose={() => setExporting(false)}
        >
          <RoutinePrint document={data.value.document} student="" preview />
        </DocumentPreview>
      ) : (
        <Modal title={routine.name} close={close}>
          <LoadState {...data} retry={data.reload} />
          {data.value && (
            <>
              <RoutineSummary document={data.value.document} />
              <button
                className="button secondary"
                onClick={() => setExporting(true)}
              >
                <Download size={18} />
                Exportar rutina
              </button>
            </>
          )}
        </Modal>
      )}
    </>
  );
}
export function GymRoutineEditor() {
  const { id = "nueva" } = useParams(),
    [search] = useSearchParams(),
    { access } = useGym();
  return (
    <Editor key={id + access.userId} id={id} memberId={search.get("member")} />
  );
}
function Editor({ id, memberId }: { id: string; memberId: string | null }) {
  const { access } = useGym(),
    navigate = useNavigate(),
    admin = access.mode === "admin",
    base = admin ? "/gimnasio/rutinas" : "/mi-entrenamiento/rutinas";
  const key =
    "pulso-gym-editor:" + access.userId + ":" + id + ":" + (memberId || "");
  const [doc, setDoc] = useState<RoutineDocument | null>(null),
    [saved, setSaved] = useState(""),
    [record, setRecord] = useState<
      (GymRoutine & { draft: RoutineDocument | null }) | null
    >(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [confirm, setConfirm] = useState<"discard" | "retire" | null>(null);
  const rawValues = useRef<Record<string, string>>({}),
    rawInvalid = useRef(new Set<string>());
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        let initial: RoutineDocument;
        let r:
          (NonNullable<typeof record> & { document: RoutineDocument }) | null =
          null;
        if (id === "nueva") {
          initial = blankRoutine();
          initial.name = admin ? "Nueva rutina" : "Mi rutina";
        } else {
          r = await rows<typeof record & { document: RoutineDocument }>(
            cloud().rpc("gym_edit_routine", { routine_id: id }),
          );
          initial = r!.document;
        }
        if (!live) return;
        setRecord(r);
        setSaved(JSON.stringify(initial));
        const local = localStorage.getItem(key);
        if (local) {
          try {
            const parsed = JSON.parse(local);
            if (
              parsed.base === JSON.stringify(initial) &&
              validateRoutine(parsed.document).length === 0
            )
              initial = parsed.document;
            else
              setMessage(
                "Hay cambios de otra versión guardados en este dispositivo. Se muestra la versión del servidor.",
              );
          } catch {
            setMessage("No pudimos recuperar la edición local.");
          }
        }
        setDoc(initial);
      } catch (e) {
        if (live) setError(gymError(e));
      }
    })();
    return () => {
      live = false;
    };
  }, [id, key]);
  const dirty = doc !== null && JSON.stringify(doc) !== saved;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function change(next: RoutineDocument) {
    setDoc(next);
    setMessage("");
    try {
      localStorage.setItem(
        key,
        JSON.stringify({ base: saved, document: next }),
      );
    } catch {
      setError(
        "No se pudo guardar la edición en este dispositivo. Guardá el borrador antes de salir.",
      );
    }
  }
  async function save() {
    if (!doc || busy) return;
    if (rawInvalid.current.size || validateRoutine(doc).length) {
      setError("Revisá los campos marcados antes de guardar.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await command(
        "save_routine",
        id === "nueva"
          ? {
              kind: admin ? (memberId ? "personal" : "catalog") : "own",
              memberId,
              document: doc,
            }
          : { id, expectedRevision: record!.revision, document: doc },
      );
      localStorage.removeItem(key);
      setSaved(JSON.stringify(doc));
      if (id === "nueva") navigate(base + "/" + result.id, { replace: true });
      else {
        setRecord((r) => r && { ...r, draft: doc, revision: result.revision });
        setMessage("Borrador guardado. Publicalo cuando esté listo.");
      }
    } catch (e) {
      setError(gymError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        back={memberId ? "/gimnasio/entrenados/" + memberId : base}
        eyebrow={
          admin
            ? memberId
              ? "RUTINA PERSONALIZADA"
              : "CATÁLOGO DEL GIMNASIO"
            : "MI RUTINA PROPIA"
        }
        title={id === "nueva" ? "Crear rutina" : "Preparar rutina"}
        description={
          record?.published_revision_id
            ? "La rutina publicada se conserva hasta que publiques estos cambios."
            : "Guardá la preparación y publicala para poder entrenar con ella."
        }
        actions={
          <>
            <button
              className="button secondary"
              disabled={busy || !doc || (!dirty && id !== "nueva")}
              onClick={save}
            >
              Guardar borrador
            </button>
            {record && (
              <button
                className="button"
                disabled={busy || dirty || !record.draft}
                onClick={async () => {
                  if (!doc || rawInvalid.current.size) return;
                  const errors = validateRoutine(doc, true);
                  if (errors.length) {
                    setError(
                      "Completá todos los días y los valores de los ejercicios antes de publicar.",
                    );
                    return;
                  }
                  setBusy(true);
                  try {
                    await command("publish_routine", {
                      id,
                      expectedRevision: record.revision,
                    });
                    localStorage.removeItem(key);
                    navigate(base);
                  } catch (e) {
                    setError(gymError(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Publicar rutina
              </button>
            )}
          </>
        }
      />
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      {!doc && !error && <p role="status">Cargando rutina…</p>}
      {doc && (
        <div className="gym-editor routine-workspace">
          <RoutineFields
            doc={doc}
            change={change}
            busy={busy}
            rawValues={rawValues}
            rawInvalid={rawInvalid}
            trainerCatalog={false}
          />
        </div>
      )}
      <div className="gym-actions gym-editor-footer">
        {(record?.draft || dirty || id === "nueva") && (
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => setConfirm("discard")}
          >
            Descartar borrador
          </button>
        )}
        {record?.published_revision_id && !record.retired && admin && (
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => setConfirm("retire")}
          >
            Retirar rutina
          </button>
        )}
      </div>
      {confirm && (
        <Modal
          title={
            confirm === "discard"
              ? "¿Descartar este borrador?"
              : "¿Retirar esta rutina?"
          }
          close={() => {
            if (!busy) setConfirm(null);
          }}
        >
          <p>
            {confirm === "discard"
              ? "Se elimina esta preparación. La rutina publicada y los entrenamientos se conservan."
              : "Dejará de estar disponible para nuevos entrenamientos. El historial se conserva."}
          </p>
          <div className="gym-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setConfirm(null)}
            >
              Cancelar
            </button>
            <button
              className="button danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  if (record)
                    await command(
                      confirm === "discard"
                        ? "discard_routine"
                        : "retire_routine",
                      { id, expectedRevision: record.revision },
                    );
                  localStorage.removeItem(key);
                  navigate(base);
                } catch (e) {
                  setError(gymError(e));
                  setConfirm(null);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {confirm === "discard" ? "Descartar borrador" : "Retirar rutina"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
