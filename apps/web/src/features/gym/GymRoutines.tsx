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
import { useGym } from "./GymContext";
import { Empty, LoadState, Modal, PageHeading } from "./ui";
import "../routines/routine-editor.css";
import "./gym-routine-editor.css";
import {
  GymRoutineDraftStorage,
  GymDraftConflict,
  parseGymRoutineDraft,
  sameGymRoutineBase,
  invalidRoutineInputs,
  pruneRoutineInputs,
  downloadGymRoutineDraft,
  type GymRoutineDraft,
  type PendingRoutineCommand,
} from "./routine-draft";
import { useDraftNavigation } from "../routines/use-draft-navigation";

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
      <div
        className="gym-tabs gym-routine-tabs"
        role="group"
        aria-label="Origen de las rutinas"
      >
        {(admin
          ? [
              ["catalog", "Catálogo"],
              ["draft", "Borradores"],
            ]
          : [
              ["catalog", "Del gimnasio"],
              ["personal", "Para mí"],
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
      <p className="muted gym-routine-context">
        {admin
          ? filter === "draft"
            ? "Preparaciones pendientes de publicar, incluidas las personalizadas."
            : "Rutinas reutilizables para los entrenados de tu gimnasio."
          : filter === "own"
            ? "Podés tener una rutina propia y adaptarla cuando quieras."
            : filter === "personal"
              ? "Rutinas que tu gimnasio preparó especialmente para vos."
              : "Elegí una rutina del gimnasio para tu próximo entrenamiento."}
      </p>
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
            {r.published_revision_id &&
              r.has_draft &&
              (admin || r.kind === "own") && (
                <span className="badge">Cambios sin publicar</span>
              )}
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
            {query
              ? "Probá con otro nombre o borrá la búsqueda para ver todas las rutinas."
              : filter === "own"
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
    <Editor
      key={id + access.userId + search.get("member")}
      id={id}
      memberId={search.get("member")}
    />
  );
}
function Editor({ id, memberId }: { id: string; memberId: string | null }) {
  const { access } = useGym(),
    navigate = useNavigate(),
    admin = access.mode === "admin",
    base = admin ? "/gimnasio/rutinas" : "/mi-entrenamiento/rutinas";
  const key =
    "pulso-gym-editor:" + access.userId + ":" + id + ":" + (memberId || "");
  const storage = useRef(new GymRoutineDraftStorage(key));
  const [doc, setDoc] = useState<RoutineDocument | null>(null),
    [saved, setSaved] = useState(""),
    [record, setRecord] = useState<
      | (GymRoutine & {
          draft: RoutineDocument | null;
          document: RoutineDocument;
        })
      | null
    >(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [pending, setPending] = useState<PendingRoutineCommand | null>(null),
    [confirm, setConfirm] = useState<"discard" | "retire" | null>(null),
    [recovery, setRecovery] = useState<{
      snapshot: GymRoutineDraft | null;
      original: string;
    } | null>(null),
    [storageProblem, setStorageProblem] = useState(false),
    [tabConflict, setTabConflict] = useState(false),
    [loading, setLoading] = useState(true),
    [serverUnavailable, setServerUnavailable] = useState(false),
    [reload, setReload] = useState(0),
    [localSaving, setLocalSaving] = useState(false);
  const [exported, setExported] = useState(false);
  const [pickingTemplate, setPickingTemplate] = useState(false);
  const [templateVersion, setTemplateVersion] = useState(0);
  const rawValues = useRef<Record<string, string>>({});
  const rawInvalid = useRef(new Set<string>());
  const latestWrite = useRef(0);
  const inFlight = useRef(false);
  const targetMember = record?.member_id || memberId;
  const returnTo =
    admin && targetMember ? "/gimnasio/entrenados/" + targetMember : base;
  function restore(snapshot: GymRoutineDraft) {
    rawValues.current = pruneRoutineInputs(
      snapshot.document,
      snapshot.rawValues,
    );
    rawInvalid.current = invalidRoutineInputs(rawValues.current);
    setDoc(snapshot.document);
    setPending(snapshot.pending);
    setTemplateVersion((v) => v + 1);
  }
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    void (async () => {
      let local: GymRoutineDraft | null = null;
      try {
        let encoded: string | null = null;
        let readError: unknown;
        try {
          encoded = await storage.current.read();
        } catch (e) {
          readError = e;
        }
        if (encoded) {
          try {
            local = parseGymRoutineDraft(encoded);
          } catch {
            /* Preserve the original for export below. */
          }
        }
        let current: NonNullable<typeof record> | null = null;
        let initial = blankRoutine();
        initial.name = admin ? "Nueva rutina" : "Mi rutina";
        if (id !== "nueva") {
          current = await rows<NonNullable<typeof record>>(
            cloud().rpc("gym_edit_routine", { routine_id: id }),
          );
          initial = current.document;
        }
        if (!live) return;
        setServerUnavailable(false);
        setRecord(current);
        setSaved(JSON.stringify(initial));
        setRecovery(null);
        setTabConflict(false);
        setStorageProblem(false);
        if (readError) storageError(readError);
        rawValues.current = {};
        rawInvalid.current.clear();
        setPending(null);
        setDoc(initial);
        setTemplateVersion((v) => v + 1);
        if (encoded) {
          try {
            const snapshot = parseGymRoutineDraft(encoded);
            if (
              snapshot.pending ||
              id === "nueva" ||
              (sameGymRoutineBase(snapshot.base, initial) &&
                (snapshot.baseRevision === undefined ||
                  snapshot.baseRevision === current?.revision))
            ) {
              restore(snapshot);
              setMessage(
                snapshot.pending
                  ? "Hay una operación pendiente de confirmar. Reintentala para conocer su resultado."
                  : "Recuperamos la preparación de este dispositivo.",
              );
            } else {
              setRecovery({ snapshot, original: encoded });
              setMessage("");
            }
          } catch {
            setRecovery({ snapshot: null, original: encoded });
          }
        }
      } catch (e) {
        if (live) {
          setError(gymError(e));
          setServerUnavailable(true);
          if (local) {
            restore(local);
            setSaved(local.base);
            setRecord(null);
            setRecovery(null);
            setTabConflict(false);
          } else setDoc(null);
        }
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [id, key, reload]);
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (
        event.key === key ||
        event.key === key + ":version" ||
        event.key === null
      ) {
        setTabConflict(true);
        setError(
          "La preparación cambió en otra pestaña. Exportá tus cambios antes de cargar la versión guardada.",
        );
      }
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, [key]);
  const dirty =
    doc !== null &&
    (JSON.stringify(doc) !== saved || rawInvalid.current.size > 0);
  const frozen =
    busy ||
    loading ||
    !!pending ||
    !!recovery ||
    tabConflict ||
    serverUnavailable;
  const navigation = useDraftNavigation(
    localSaving || (!exported && (storageProblem || tabConflict)),
    () =>
      setError(
        "Antes de salir, reintentá el guardado en este dispositivo o exportá una copia de la preparación.",
      ),
  );
  function snapshot(document = doc!, request = pending): GymRoutineDraft {
    return {
      base: saved,
      baseRevision: record?.revision,
      document,
      rawValues: { ...rawValues.current },
      pending: request,
    };
  }
  function storageError(e: unknown) {
    setStorageProblem(true);
    if (e instanceof GymDraftConflict) setTabConflict(true);
    setError(
      e instanceof GymDraftConflict
        ? e.message
        : "No se pudo guardar la preparación en este dispositivo. Reintentá o exportá una copia antes de salir.",
    );
  }
  async function persist(value: GymRoutineDraft) {
    const version = ++latestWrite.current;
    setLocalSaving(true);
    try {
      await storage.current.write(value);
      if (version === latestWrite.current) setStorageProblem(false);
      return true;
    } catch (e) {
      storageError(e);
      return false;
    } finally {
      if (version === latestWrite.current) setLocalSaving(false);
    }
  }
  function change(next: RoutineDocument) {
    if (frozen) return;
    setExported(false);
    rawValues.current = pruneRoutineInputs(next, rawValues.current);
    rawInvalid.current = invalidRoutineInputs(rawValues.current);
    setDoc(next);
    setMessage("");
    setError("");
    void persist(snapshot(next));
  }
  const validationErrors = doc ? validateRoutine(doc, true) : [];
  const oversizedWeek = doc?.weeks.findIndex((week) => week.length > 6) ?? -1;
  async function run(kind: PendingRoutineCommand["kind"]) {
    if (!doc || inFlight.current || recovery || tabConflict) return;
    if (!pending && serverUnavailable) return;
    if (!pending && (kind === "save_routine" || kind === "publish_routine")) {
      if (rawInvalid.current.size) {
        setError("Revisá los valores numéricos marcados antes de continuar.");
        return;
      }
      if (oversizedWeek >= 0) {
        setError(
          "Semana " +
            (oversizedWeek + 1) +
            ": organizá los ejercicios en un máximo de 6 días. Conservamos todos tus días para que puedas reorganizarlos.",
        );
        return;
      }
      const errors = validateRoutine(doc, kind === "publish_routine");
      if (errors.length) {
        setError(
          errors[0].startsWith("name:")
            ? "Escribí un nombre para la rutina."
            : errors[0],
        );
        return;
      }
    }
    const request: PendingRoutineCommand = pending || {
      operationId: crypto.randomUUID(),
      kind,
      payload:
        kind === "save_routine"
          ? id === "nueva"
            ? {
                kind: admin ? (memberId ? "personal" : "catalog") : "own",
                memberId,
                document: doc,
              }
            : { id, expectedRevision: record!.revision, document: doc }
          : { id, expectedRevision: record!.revision },
    };
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      // Persist the exact operation before sending, so a lost response is safely retryable.
      if (!(await persist(snapshot(doc, request)))) return;
      setPending(request);
      const result = await command(
        request.kind,
        request.payload,
        request.operationId,
      );
      try {
        await storage.current.remove();
      } catch (e) {
        storageError(e);
        return;
      }
      setPending(null);
      setStorageProblem(false);
      setSaved(JSON.stringify(doc));
      rawValues.current = {};
      rawInvalid.current.clear();
      setConfirm(null);
      if (request.kind !== "save_routine") {
        navigation.allowNavigation();
        navigate(returnTo);
      } else if (id === "nueva") {
        navigation.allowNavigation();
        navigate(
          base + "/" + result.id + (memberId ? "?member=" + memberId : ""),
          { replace: true },
        );
      } else {
        if (!record) setReload((v) => v + 1);
        setRecord(
          (r) =>
            r && {
              ...r,
              draft: doc,
              document: doc,
              has_draft: true,
              revision: result.revision,
            },
        );
        setMessage("Borrador guardado. Publicalo cuando esté listo.");
        setTemplateVersion((v) => v + 1);
      }
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (["22023", "40001", "42501", "23505"].includes(code || "")) {
        setPending(null);
        const persisted = await persist(snapshot(doc, null));
        if ((code === "40001" || serverUnavailable) && persisted) {
          setReload((v) => v + 1);
          setMessage(
            "El servidor tiene una versión más reciente. Elegí qué preparación querés revisar.",
          );
        }
      }
      if (e instanceof GymDraftConflict) storageError(e);
      else setError(gymError(e));
      setConfirm(null);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function chooseRecovery(local: boolean) {
    if (!recovery || busy) return;
    setBusy(true);
    setError("");
    try {
      if (local && recovery.snapshot) {
        // Rebase only after an explicit choice; the published version remains untouched.
        const chosen = {
          ...recovery.snapshot,
          base: saved,
          baseRevision: record?.revision,
          pending: null,
        };
        await storage.current.write(chosen);
        restore(chosen);
        setMessage(
          "Revisá tus cambios y guardá el borrador. La versión publicada se conserva hasta que publiques.",
        );
      } else {
        await storage.current.remove();
        setMessage("Se conserva la versión del servidor.");
      }
      setRecovery(null);
    } catch (e) {
      storageError(e);
    } finally {
      setBusy(false);
    }
  }
  const pendingLabel =
    pending?.kind === "publish_routine"
      ? "Reintentar publicación"
      : pending?.kind === "discard_routine"
        ? "Reintentar descarte"
        : pending?.kind === "retire_routine"
          ? "Reintentar retiro"
          : "Reintentar guardado";
  return (
    <>
      {navigation.guard}
      <PageHeading
        back={returnTo}
        eyebrow={
          admin
            ? targetMember
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
              disabled={frozen || (!dirty && id !== "nueva")}
              onClick={() => run("save_routine")}
            >
              {busy && pending?.kind === "save_routine"
                ? "Guardando…"
                : "Guardar borrador"}
            </button>
            {record && (
              <button
                className="button"
                disabled={frozen || dirty || !record.draft}
                onClick={() => run("publish_routine")}
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
      {loading && <p role="status">Cargando rutina…</p>}
      {!loading && !doc && (
        <button
          className="button secondary"
          onClick={() => setReload((v) => v + 1)}
        >
          Reintentar
        </button>
      )}
      {recovery && (
        <section
          className="card gym-draft-recovery"
          aria-label="Recuperar preparación"
        >
          <h2>
            {recovery.snapshot
              ? "Tenés dos versiones de esta rutina"
              : "Conservamos una preparación que no pudimos abrir"}
          </h2>
          <p>
            {recovery.snapshot
              ? "La versión del servidor cambió desde tu última edición. Podés revisar tus cambios locales o conservar la versión del servidor. Exportá una copia si querés guardar ambas."
              : "Podés exportar el archivo local antes de continuar con la versión del servidor."}
          </p>
          <div className="gym-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() =>
                downloadGymRoutineDraft(
                  id,
                  recovery.snapshot ?? recovery.original,
                )
              }
            >
              <Download size={16} /> Exportar copia local
            </button>
            {recovery.snapshot && (
              <button
                className="button"
                disabled={busy}
                onClick={() => chooseRecovery(true)}
              >
                Revisar mis cambios
              </button>
            )}
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => chooseRecovery(false)}
            >
              Usar versión del servidor
            </button>
          </div>
        </section>
      )}
      {(storageProblem || tabConflict || serverUnavailable) && doc && (
        <section
          className="card gym-draft-recovery"
          aria-label="Conservar cambios"
        >
          <p>
            Tu preparación sigue abierta. Conservá una copia antes de salir o
            cargar otra versión.
          </p>
          <div className="gym-actions">
            <button
              className="button secondary"
              onClick={() => {
                downloadGymRoutineDraft(id, snapshot());
                setExported(true);
              }}
            >
              <Download size={16} /> Exportar mis cambios
            </button>
            {tabConflict || serverUnavailable ? (
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => setReload((v) => v + 1)}
              >
                {serverUnavailable
                  ? "Reintentar conexión"
                  : "Cargar versión guardada"}
              </button>
            ) : (
              <button
                className="button secondary"
                disabled={busy || localSaving}
                onClick={() => void persist(snapshot())}
              >
                Reintentar guardado local
              </button>
            )}
          </div>
        </section>
      )}
      {pending && !busy && !recovery && !tabConflict && (
        <section
          className="card gym-draft-recovery"
          aria-label="Operación pendiente"
        >
          <p>
            Falta confirmar el resultado. Reintentá la misma operación antes de
            seguir editando; no se duplicará.
          </p>
          <button className="button" onClick={() => run(pending.kind)}>
            {pendingLabel}
          </button>
        </section>
      )}
      {doc && !loading && !recovery && (
        <div className="gym-routine-status" role="status">
          <span>
            {storageProblem || tabConflict
              ? "Hay cambios que requieren tu atención"
              : localSaving
                ? "Guardando en este dispositivo…"
                : pending
                  ? "Operación pendiente de confirmar"
                  : dirty
                    ? "Preparación guardada en este dispositivo"
                    : record?.draft
                      ? "Borrador guardado"
                      : "Sin cambios pendientes"}
          </span>
          {!pending && !storageProblem && (
            <span>
              {dirty
                ? "Guardá el borrador para poder publicarlo."
                : "4 semanas · Hasta 6 días por semana"}
            </span>
          )}
        </div>
      )}
      {doc && !loading && !frozen && validationErrors.length > 0 && (
        <details className="gym-publish-checklist">
          <summary>
            Para publicar: {validationErrors.length}{" "}
            {validationErrors.length === 1
              ? "detalle pendiente"
              : "detalles pendientes"}
          </summary>
          <ul>
            {validationErrors.map((issue, index) => (
              <li key={index}>
                {issue.startsWith("name:")
                  ? "Escribí un nombre para la rutina."
                  : issue}
              </li>
            ))}
          </ul>
        </details>
      )}
      {admin && id === "nueva" && doc && !loading && (
        <section className="card gym-template-start">
          <div>
            <h2>Punto de partida</h2>
            <p className="muted">
              Empezá desde cero en el editor o copiá una plantilla del catálogo
              de tu gimnasio.
            </p>
          </div>
          <button
            className="button secondary"
            disabled={frozen}
            onClick={() => setPickingTemplate(true)}
          >
            <Copy size={18} /> Usar plantilla
          </button>
        </section>
      )}
      {pickingTemplate && (
        <TemplatePicker
          dirty={dirty}
          close={() => setPickingTemplate(false)}
          apply={(template) => {
            rawValues.current = {};
            rawInvalid.current.clear();
            setError("");
            change(template);
            setTemplateVersion((v) => v + 1);
            setPickingTemplate(false);
            setMessage(
              "Plantilla copiada. Podés adaptarla; la original se conserva.",
            );
          }}
        />
      )}
      {doc && !loading && (
        <div className="gym-editor routine-workspace">
          <RoutineFields
            key={templateVersion}
            doc={doc}
            change={change}
            busy={frozen}
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
            disabled={frozen}
            onClick={() => setConfirm("discard")}
          >
            Descartar borrador
          </button>
        )}
        {record?.published_revision_id && !record.retired && admin && (
          <button
            className="button secondary"
            disabled={frozen}
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
                if (record)
                  await run(
                    confirm === "discard"
                      ? "discard_routine"
                      : "retire_routine",
                  );
                else {
                  setBusy(true);
                  try {
                    await storage.current.remove();
                    navigation.allowNavigation();
                    navigate(returnTo);
                  } catch (e) {
                    storageError(e);
                    setConfirm(null);
                  } finally {
                    setBusy(false);
                  }
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
function TemplatePicker({
  close,
  apply,
  dirty,
}: {
  close: () => void;
  apply: (doc: RoutineDocument) => void;
  dirty: boolean;
}) {
  const { access } = useGym();
  const data = useResource(
    () =>
      rows<GymRoutine[]>(
        cloud()
          .from("gym_routines")
          .select(routineColumns)
          .eq("gym_id", access.gymId)
          .eq("kind", "catalog")
          .eq("retired", false)
          .not("published_revision_id", "is", null)
          .order("name"),
      ),
    access.gymId,
  );
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<GymRoutine | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [replace, setReplace] = useState(false);
  return (
    <Modal
      title="Elegir plantilla"
      close={() => {
        if (!busy) close();
      }}
    >
      <p>
        Copiá una rutina publicada del catálogo y adaptala a la nueva rutina.
      </p>
      <label className="field">
        Buscar plantilla
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nombre de la rutina"
        />
      </label>
      <LoadState {...data} retry={data.reload} />
      <div
        className="gym-template-list"
        role="group"
        aria-label="Plantillas del gimnasio"
      >
        {data.value
          ?.filter((r) =>
            r.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
          )
          .map((r) => (
            <button
              key={r.id}
              className={"button " + (selected?.id === r.id ? "" : "secondary")}
              disabled={busy}
              aria-pressed={selected?.id === r.id}
              onClick={() => setSelected(r)}
            >
              {r.name}
            </button>
          ))}
      </div>
      {data.value?.length === 0 && (
        <p className="muted">
          Todavía no hay plantillas publicadas. Podés crear la rutina desde cero
          o publicar una en el catálogo.
        </p>
      )}
      {!!data.value?.length &&
        !data.value.some((r) =>
          r.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
        ) && <p className="muted">No hay plantillas con ese nombre.</p>}
      {dirty && (
        <label className="gym-check">
          <input
            type="checkbox"
            checked={replace}
            onChange={(e) => setReplace(e.target.checked)}
            disabled={busy}
          />
          Reemplazar la preparación actual con esta plantilla
        </label>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="gym-actions">
        <button className="button secondary" disabled={busy} onClick={close}>
          Cancelar
        </button>
        <button
          className="button"
          disabled={busy || !selected || (dirty && !replace)}
          onClick={async () => {
            if (!selected || busy) return;
            setBusy(true);
            setError("");
            try {
              const revision = await rows<GymRevision>(
                cloud()
                  .from("gym_routine_revisions")
                  .select("*")
                  .eq("id", selected.published_revision_id)
                  .single(),
              );
              const copy = cloneRoutineDocument(revision.document);
              apply(copy);
            } catch (e) {
              setError(gymError(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Copiando…" : "Usar esta plantilla"}
        </button>
      </div>
    </Modal>
  );
}
