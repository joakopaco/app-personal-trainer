import { LoadingState } from "../../components/LoadingState";
import { useEffect, useRef, useState, useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Pencil, Trash2, Undo2 } from "lucide-react";
import { liveQuery } from "dexie";
import { validateRoutine, type RoutineDocument } from "@pulso/domain/routines";
import type { NumericField } from "@pulso/domain/numbers";
import { useData } from "../../app/DataProvider";
import { cloud } from "../../adapters/supabase";
import { saveLibrary, type LibraryCommand } from "../../adapters/library";
import {
  isRestField,
  parseDisplayedNumber,
  restoreRestRaw,
  storeRestRaw,
} from "../../components/rest-minutes";
import { RoutineFields } from "./RoutineFields";
import { RoutineSummary } from "./RoutineSummary";
import {
  createTemplateDraft,
  sameRoutineContent,
  templateDraftKey,
  templatePath,
  type TemplateDraft,
} from "./template-drafts";
import { DraftStorage } from "./draft-storage";
import { useDraftNavigation } from "./use-draft-navigation";
import "./routine-editor.css";

export function TemplateEditor() {
  const { id } = useParams();
  return <TemplateEditorContent key={id} />;
}
function TemplateEditorContent() {
  const { id } = useParams(),
    { db } = useData(),
    navigate = useNavigate();
  const storage = useMemo(
    () => new DraftStorage(db, templateDraftKey(id!)),
    [db, id],
  );
  const [doc, setDoc] = useState<RoutineDocument | null>(null);
  const [revision, setRevision] = useState(0),
    [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false),
    [conflict, setConflict] = useState(false);
  const [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [reload, setReload] = useState(0),
    [localFailed, setLocalFailed] = useState(false);
  const rawValues = useRef<Record<string, string>>({}),
    rawInvalid = useRef(new Set<string>());
  const writes = useRef<Promise<unknown>>(Promise.resolve());
  const editVersion = useRef(0);
  const [writing, setWriting] = useState(false);
  const [confirmation, setConfirmation] = useState<"discard" | "delete" | null>(
    null,
  );
  const [pendingOperation, setPendingOperation] = useState<LibraryCommand>();
  const pendingSave = pendingOperation?.kind === "template";
  const pendingDelete = pendingOperation?.kind === "template_delete";
  useEffect(() => {
    const sub = liveQuery(() => db.meta.get("library-pending")).subscribe(
      (entry) => {
        const command = entry?.value as LibraryCommand | undefined;
        setPendingOperation(command?.id === id ? command : undefined);
      },
    );
    return () => sub.unsubscribe();
  }, [db, id]);
  useEffect(() => {
    let active = true;
    setLoaded(false);
    setDoc(null);
    setDirty(false);
    setConflict(false);
    setMessage("");
    rawValues.current = {};
    rawInvalid.current.clear();
    setError("");
    void (async () => {
      try {
        const local = await storage.read<TemplateDraft>();
        const pending = (await db.meta.get("library-pending"))?.value as
          LibraryCommand | undefined;
        const initialEdits = editVersion.current;
        if (!active) return;
        if (pending?.id === id) setPendingOperation(pending);
        if (local) {
          rawValues.current = Object.fromEntries(
            Object.entries(local.rawValues).map(([key, value]) => [
              key,
              isRestField(key.split(":").at(-1) as NumericField)
                ? restoreRestRaw(value)
                : value,
            ]),
          );
          rawInvalid.current = new Set(
            Object.entries(rawValues.current)
              .filter(
                ([key, value]) =>
                  value !== "" &&
                  !parseDisplayedNumber(
                    key.split(":").at(-1) as NumericField,
                    value,
                  ).ok,
              )
              .map(([key]) => key),
          );
          setDoc(local.document);
          setEditing(true);
          setDirty(true);
          setRevision(local.revision);
          setLoaded(true);
        }
        const { data, error: loadError } = await cloud()
          .from("routine_templates")
          .select("id,document,revision")
          .eq("id", id!)
          .maybeSingle();
        if (!active) return;
        if (editVersion.current !== initialEdits) return;
        if (
          !data &&
          pending &&
          pending.id === id &&
          pending.kind === "template_delete"
        ) {
          // A lost acknowledgement must still be retryable after the row is gone.
          setDoc(null);
          setRevision(pending.expectedRevision ?? 0);
          return;
        }
        if (local) {
          // An uncertain save may already have been confirmed on another screen.
          const same =
            data && sameRoutineContent(data.document, local.document);
          setRevision(
            same && pending?.id !== id ? data.revision : local.revision,
          );
          setConflict(
            Boolean(
              (!loadError && !data && local.revision > 0) ||
              (data &&
                !same &&
                data.revision !== local.revision &&
                pending?.id !== id),
            ),
          );
          if (loadError)
            setError(
              "No se pudo consultar la versión de la nube. Podés seguir trabajando en tu borrador.",
            );
        } else {
          if (loadError)
            throw Error(
              "No se pudo cargar la plantilla. Reintentá con conexión.",
            );
          if (!data)
            throw Error("Esta plantilla no existe o no pertenece a tu cuenta.");
          setDoc(data.document);
          setRevision(data.revision);
          setEditing(false);
          setDirty(false);
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        if (active) setLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [db, id, reload]);
  const { guard, allowNavigation } = useDraftNavigation(
    localFailed || writing || busy,
    () =>
      setError(
        "Esperá a que se guarden los cambios. Si hubo un error, reintentá antes de salir.",
      ),
  );
  function change(next: RoutineDocument) {
    editVersion.current += 1;
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
    setError("");
    setMessage("");
    setWriting(true);
    const draft: TemplateDraft = {
      id: id!,
      document: next,
      revision,
      rawValues: Object.fromEntries(
        Object.entries(rawValues.current).map(([key, value]) => [
          key,
          isRestField(key.split(":").at(-1) as NumericField)
            ? storeRestRaw(value)
            : value,
        ]),
      ),
    };
    const current = storage.write(draft);
    writes.current = current;
    void current.then(
      () => {
        if (writes.current === current) {
          setWriting(false);
          setLocalFailed(false);
        }
      },
      (cause) => {
        if (writes.current !== current) return;
        setWriting(false);
        setLocalFailed(true);
        if (/otra pestaña/.test((cause as Error).message)) setConflict(true);
        setError(
          "No se pudo conservar el borrador en este dispositivo. " +
            (cause as Error).message,
        );
      },
    );
  }
  async function save() {
    if (!doc) return;
    let acknowledged = false;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (rawInvalid.current.size)
        throw Error("Completá o corregí los campos antes de guardar.");
      if (doc.weeks.some((week) => week.length > 6))
        throw Error(
          "Las plantillas admiten hasta 6 días. Revisá la distribución antes de guardar.",
        );
      const issues = validateRoutine(doc);
      if (issues.length) throw Error(issues[0]);
      // Capture the latest document, including a retry after a failed local write.
      change(doc);
      await writes.current;
      const saved = await saveLibrary(
        db,
        pendingSave
          ? pendingOperation!
          : {
              workspaceId: db.scope.workspaceId,
              operationId: crypto.randomUUID(),
              id,
              expectedRevision: revision,
              kind: "template",
              payload: { document: doc },
            },
      );
      acknowledged = true;
      setDoc(saved.document);
      setRevision(saved.revision);
      setDirty(false);
      setEditing(false);
      setConflict(false);
      rawValues.current = {};
      rawInvalid.current.clear();
      setPendingOperation(undefined);
      await storage.remove();
      setMessage("Plantilla guardada en tu catálogo.");
    } catch (e) {
      setError((e as Error).message);
      if (acknowledged) {
        setLocalFailed(true);
        setError(
          "La plantilla se guardó en el catálogo. Falta limpiar la copia local; reintentá el guardado local.",
        );
        return;
      }
      try {
        const pending = (await db.meta.get("library-pending"))?.value as
          LibraryCommand | undefined;
        if (pending?.id !== id) {
          const { data } = await cloud()
            .from("routine_templates")
            .select("revision")
            .eq("id", id!)
            .maybeSingle();
          if (data && data.revision !== revision) setConflict(true);
        }
      } catch {
        /* Keep the original save failure visible. */
      }
    } finally {
      setBusy(false);
    }
  }
  async function discardDraft() {
    setBusy(true);
    setError("");
    try {
      await writes.current.catch(() => undefined);
      await db.transaction("rw", db.meta, async () => {
        const pending = (await db.meta.get("library-pending"))?.value as
          LibraryCommand | undefined;
        if (pending?.id === id)
          throw Error(
            "Primero reintentá la operación pendiente para confirmar qué quedó guardado.",
          );
      });
      await storage.remove();
      allowNavigation();
      navigate("/rutinas", { replace: true });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setConfirmation(null);
    }
  }
  async function deleteTemplate() {
    setBusy(true);
    setError("");
    try {
      await writes.current.catch(() => undefined);
      if (!pendingDelete) await storage.assertCurrent();
      await saveLibrary(
        db,
        pendingDelete
          ? pendingOperation!
          : {
              workspaceId: db.scope.workspaceId,
              operationId: crypto.randomUUID(),
              id,
              expectedRevision: revision,
              kind: "template_delete",
              payload: { name: doc?.name || "Rutina" },
            },
      );
      await storage.remove();
      allowNavigation();
      navigate("/rutinas", { replace: true });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setConfirmation(null);
    }
  }
  return (
    <div className="routine-workspace">
      {guard}
      <Link className="routine-back" to="/rutinas">
        <ArrowLeft size={18} aria-hidden="true" />
        Volver al catálogo
      </Link>
      <header className="page-heading">
        <div>
          <p className="eyebrow">PLANTILLA REUTILIZABLE</p>
          <h1>
            {pendingDelete
              ? "Eliminación pendiente"
              : editing
                ? revision
                  ? "Editar plantilla"
                  : "Crear plantilla"
                : doc?.name || "Plantilla"}
          </h1>
          <p className="muted">
            {writing
              ? "Guardando borrador…"
              : localFailed
                ? "Borrador sin confirmar"
                : dirty
                  ? "Borrador guardado en este dispositivo"
                  : "Tu biblioteca de rutinas"}
          </p>
        </div>
        <div className="routine-heading-actions">
          {doc &&
            !pendingDelete &&
            loaded &&
            (editing ? (
              <button
                className="button"
                disabled={busy || conflict}
                onClick={save}
              >
                {busy
                  ? "Guardando…"
                  : pendingSave
                    ? "Reintentar guardado"
                    : "Guardar plantilla"}
              </button>
            ) : (
              <button className="button" onClick={() => setEditing(true)}>
                <Pencil size={17} aria-hidden="true" />
                Editar plantilla
              </button>
            ))}
        </div>
      </header>
      {error && (
        <div role="alert" className="error">
          <p>{error}</p>
          {!doc && (
            <button
              className="button secondary"
              onClick={() => setReload((r) => r + 1)}
            >
              Reintentar
            </button>
          )}
        </div>
      )}
      {localFailed && (
        <button
          className="button secondary"
          disabled={writing || busy}
          onClick={async () => {
            if (!doc) return;
            if (dirty) change(doc);
            else
              try {
                await storage.remove();
                setLocalFailed(false);
                setError("");
              } catch (cause) {
                setError((cause as Error).message);
              }
          }}
        >
          Reintentar guardado local
        </button>
      )}
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      {pendingSave && !busy && (
        <p className="notice">
          Falta confirmar el guardado. Reintentá para recuperar la confirmación
          antes de seguir editando.
        </p>
      )}
      {pendingDelete && (
        <section className="notice stack">
          <p>
            Falta confirmar la eliminación. Reintentá para comprobar el
            resultado; no se eliminará otra rutina.
          </p>
          <button
            className="button danger"
            disabled={busy}
            onClick={deleteTemplate}
          >
            Reintentar eliminación
          </button>
        </section>
      )}
      {conflict && (
        <section className="notice stack">
          <strong>La plantilla cambió en otro dispositivo.</strong>
          <p>
            Conservamos tus cambios acá. Podés guardarlos como una nueva
            plantilla, sin reemplazar la versión del catálogo.
          </p>
          <button
            className="button secondary"
            disabled={busy}
            onClick={async () => {
              if (!doc) return;
              setBusy(true);
              try {
                await writes.current.catch(() => undefined);
                const copyId = await createTemplateDraft(
                  db,
                  {
                    ...doc,
                    name: doc.name.slice(0, 110) + " (copia)",
                  },
                  Object.fromEntries(
                    Object.entries(rawValues.current).map(([key, value]) => [
                      key,
                      isRestField(key.split(":").at(-1) as NumericField)
                        ? storeRestRaw(value)
                        : value,
                    ]),
                  ),
                );
                // Another tab may own the old draft now; keep that version intact.
                if (!localFailed) await storage.remove();
                allowNavigation();
                navigate(templatePath(copyId));
              } catch {
                setError("No se pudo conservar la copia. Reintentá.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Continuar como otra plantilla
          </button>
        </section>
      )}
      {!loaded && <LoadingState label="Cargando plantilla…" />}
      {loaded &&
        doc &&
        (editing ? (
          <RoutineFields
            doc={doc}
            change={change}
            busy={busy || Boolean(pendingOperation) || Boolean(confirmation)}
            rawValues={rawValues}
            rawInvalid={rawInvalid}
          />
        ) : (
          <RoutineSummary document={doc} />
        ))}
      {loaded && doc && (
        <p className="muted template-footnote">
          Para usar esta plantilla, abrí la ficha de un alumno y elegila al
          crear su rutina. Cada alumno recibe una copia independiente.
        </p>
      )}
      {loaded && doc && !pendingDelete && (dirty || revision > 0) && (
        <section className="routine-manage" aria-label="Administrar rutina">
          <div className="row">
            {dirty && (
              <button
                className="button secondary"
                disabled={busy || writing || Boolean(pendingOperation)}
                onClick={() => setConfirmation("discard")}
              >
                <Undo2 size={18} aria-hidden="true" />
                Descartar borrador
              </button>
            )}
            {revision > 0 && (
              <button
                className="button danger"
                disabled={
                  busy || writing || Boolean(pendingOperation) || conflict
                }
                onClick={() => setConfirmation("delete")}
              >
                <Trash2 size={18} aria-hidden="true" />
                Eliminar rutina
              </button>
            )}
          </div>
          <p className="muted">
            Las rutinas asignadas a alumnos y su historial se conservan.
          </p>
        </section>
      )}
      {confirmation && (
        <div className="modal-backdrop">
          <section
            className="card modal stack"
            role="dialog"
            aria-modal="true"
            aria-labelledby="template-action-title"
          >
            <h2 id="template-action-title">
              {confirmation === "discard"
                ? "Descartar borrador"
                : "Eliminar rutina"}
            </h2>
            <p>
              {confirmation === "discard"
                ? "Se descartarán los cambios de este dispositivo. Si ya existe una versión guardada, se conservará."
                : `Se eliminará «${doc?.name || "Rutina"}» del catálogo y su borrador en este dispositivo. Las copias de los alumnos y sus entrenamientos no se modifican.`}
            </p>
            <div className="row">
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => setConfirmation(null)}
              >
                Cancelar
              </button>
              <button
                className="button danger"
                disabled={busy}
                onClick={
                  confirmation === "discard" ? discardDraft : deleteTemplate
                }
              >
                {busy
                  ? "Confirmando…"
                  : confirmation === "discard"
                    ? "Descartar borrador"
                    : "Eliminar rutina"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
