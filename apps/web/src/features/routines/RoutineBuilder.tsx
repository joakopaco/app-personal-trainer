import { LoadingState } from "../../components/LoadingState";
import "./routine-editor.css";
import { StudentHeader } from "../students/StudentHeader";
import { RoutineSummary } from "./RoutineSummary";
import { useEffect, useState, useRef, useMemo } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { Plus, Pencil } from "lucide-react";
import {
  blankRoutine,
  validateRoutine,
  type RoutineDocument,
} from "@pulso/domain/routines";
import { RoutineFields } from "./RoutineFields";
import {
  isRestField,
  parseDisplayedNumber,
  restoreRestRaw,
  storeRestRaw,
} from "../../components/rest-minutes";
import { useData } from "../../app/DataProvider";
import { cloud } from "../../adapters/supabase";
import { DiscardStudentDraft } from "./StudentRoutines";
import { TemplateTools } from "./TemplateTools";
import { parseNumber } from "@pulso/domain/numbers";
import { DraftComparison } from "./DraftComparison";
import { gateway } from "../../adapters/supabase-gateway";
import { DraftStorage } from "./draft-storage";
import { downloadDraftRecovery } from "./draft-recovery";
import { useDraftNavigation } from "./use-draft-navigation";
import {
  createTemplateDraft,
  sameRoutineContent,
  templatePath,
} from "./template-drafts";
import type { CommandEnvelope, StudentSnapshot } from "@pulso/domain/contracts";
export function RoutineBuilder() {
  const { id } = useParams();
  const [params] = useSearchParams();
  return <RoutineBuilderEditor key={id + ":" + (params.get("draft") ?? "")} />;
}
function RoutineBuilderEditor() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const savedDocument = useRef<RoutineDocument | null>(null);
  const publishedSnapshot = useRef<StudentSnapshot | null>(null);
  const writes = useRef<Promise<unknown>>(Promise.resolve());
  const requestedDraft = params.get("draft");
  const [initialSource, setInitialSource] = useState("");
  const { rows, db, onlineCommand } = useData();
  const storage = useMemo(() => new DraftStorage(db, "draft:" + id), [db, id]);
  const [writing, setWriting] = useState(false);
  const [localFailed, setLocalFailed] = useState(false);
  const [pendingOperation, setPendingOperation] = useState<CommandEnvelope>();
  const pendingSave = pendingOperation?.kind === "save_draft";
  const pendingPublish = pendingOperation?.kind === "publish_routine";
  const row = rows.find((r) => r.studentId === id);
  const [doc, setDoc] = useState<RoutineDocument>(blankRoutine),
    [draftId, setDraftId] = useState<string>(() => crypto.randomUUID()),
    [draftRevision, setDraftRevision] = useState(0),
    [base, setBase] = useState<string | null>(null),
    [studentRevision, setStudentRevision] = useState(0),
    [loaded, setLoaded] = useState(false),
    [dirty, setDirty] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"start" | "edit" | "view">("start");
  const rawValues = useRef<Record<string, string>>({});
  const rawInvalid = useRef(new Set<string>());
  const [comparison, setComparison] = useState<{
    base: RoutineDocument;
    remote: StudentSnapshot;
    document: RoutineDocument;
    revisionBase: string | null;
    draftRevision: number;
    draftExists: boolean;
  } | null>(null);
  useEffect(() => {
    if (!row) return;
    let active = true;
    void (async () => {
      try {
        const storedValue = await storage.read<{
          doc: RoutineDocument;
          draftId: string;
          draftRevision: number;
          base: string | null;
          studentRevision: number;
          rawValues?: Record<string, string>;
          savedDocument?: RoutineDocument | null;
        }>();
        const stored = storedValue ? { value: storedValue } : undefined;
        const pending = (await db.meta.get("admin:" + id))?.value as
          CommandEnvelope | undefined;
        if (!active) return;
        if (pending && ["save_draft", "publish_routine"].includes(pending.kind))
          setPendingOperation(pending);
        const local =
          stored && (!requestedDraft || stored.value.draftId === requestedDraft)
            ? stored
            : undefined;
        if (stored && requestedDraft && !local) {
          setError(
            "Hay cambios pendientes en otro borrador de este alumno. Guardalo o descartalo antes de abrir otro.",
          );
          return;
        }
        if (local) {
          const l = local.value as {
            doc: RoutineDocument;
            draftId: string;
            draftRevision: number;
            base: string | null;
            studentRevision: number;
            rawValues?: Record<string, string>;
            savedDocument?: RoutineDocument | null;
          };
          if (active) {
            if (
              !pending &&
              l.draftRevision > 0 &&
              row.confirmed.routine &&
              row.confirmed.routine.id !== l.base &&
              sameRoutineContent(l.doc, row.confirmed.routine.document) &&
              Object.keys(l.rawValues ?? {}).length === 0
            ) {
              await storage.remove();
              if (active) navigate(`/alumnos/${id}/rutina`, { replace: true });
              return;
            }
            rawValues.current = Object.fromEntries(
              Object.entries(l.rawValues ?? {}).map(([key, value]) => [
                key,
                isRestField(
                  key.split(":").at(-1) as Parameters<typeof parseNumber>[0],
                )
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
                      key.split(":").at(-1) as Parameters<
                        typeof parseNumber
                      >[0],
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
            savedDocument.current =
              l.savedDocument ??
              (!l.draftRevision
                ? (row.confirmed.routine?.document ?? null)
                : null);
            const changed =
              !sameRoutineContent(l.doc, savedDocument.current) ||
              rawInvalid.current.size > 0;
            setDirty(changed);
            setMode("edit");
            setLoaded(true);
          }
          return;
        }
        if (
          pending &&
          ["save_draft", "publish_routine"].includes(pending.kind) &&
          (!requestedDraft || pending.payload.draftId === requestedDraft)
        ) {
          // Older clients removed the local snapshot after save. The durable
          // administrative command still owns the acknowledgement retry.
          const pendingDoc =
            pending.kind === "save_draft"
              ? (pending.payload.document as RoutineDocument)
              : (row.confirmed.routine?.document ?? blankRoutine());
          setDoc(pendingDoc);
          setDraftId(pending.payload.draftId as string);
          setDraftRevision(pending.payload.expectedDraftRevision as number);
          setBase(pending.payload.baseRoutineRevisionId as string | null);
          setStudentRevision(pending.expectedRevision);
          savedDocument.current =
            pending.kind === "publish_routine" ? pendingDoc : null;
          setDirty(pending.kind === "save_draft");
          setMode("edit");
          setLoaded(true);
          return;
        }
        let query = cloud()
          .from("routine_drafts")
          .select("*")
          .eq("student_id", id!);
        if (requestedDraft) query = query.eq("id", requestedDraft);
        const { data, error: loadError } = await query
          .order("updated_at", { ascending: false })
          .limit(1);
        if (!active) return;
        if (loadError)
          throw Error(
            "No se pudo cargar el borrador. Volvé a intentar con conexión.",
          );
        if (requestedDraft && !data?.[0]) {
          navigate(`/alumnos/${id}/borradores`, { replace: true });
          return;
        }
        if (data?.[0]) {
          savedDocument.current = data[0].document;
          setDoc(data[0].document);
          setDraftId(data[0].id);
          setDraftRevision(data[0].revision);
          setBase(data[0].base_revision_id);
          setMode("edit");
        } else {
          savedDocument.current = row.projection.routine?.document ?? null;
          setDoc(row.projection.routine?.document ?? blankRoutine());
          setBase(row.projection.routine?.id ?? null);
          setDraftId(crypto.randomUUID());
          setDraftRevision(0);
          setMode(row.projection.routine ? "edit" : "start");
        }
        setStudentRevision(row.confirmed.revision);
        setLoaded(true);
      } catch (cause) {
        if (active) setError((cause as Error).message);
      }
    })();
    return () => {
      active = false;
    };
  }, [row?.studentId, db, id, requestedDraft]);
  useEffect(() => {
    if (loaded && params.get("nueva") === "1") {
      setInitialSource(params.get("base") || "");
      setMode("start");
      setError("");
      setComparison(null);
      setMessage("");
      setParams({}, { replace: true });
    }
  }, [loaded, params, setParams]);
  const { guard, allowNavigation } = useDraftNavigation(
    writing || localFailed || busy,
    () =>
      setError(
        "Esperá a que se conserven los cambios. Si hubo un error, reintentá antes de salir.",
      ),
  );
  function persist(value: unknown) {
    setWriting(true);
    const current = storage.write(value);
    writes.current = current;
    void current.then(
      () => {
        if (writes.current === current) {
          setWriting(false);
          setLocalFailed(false);
          if (localFailed) setError("");
        }
      },
      (cause) => {
        if (writes.current === current) {
          setWriting(false);
          setLocalFailed(true);
          setError(
            "No se pudo conservar el borrador en este dispositivo. " +
              (cause as Error).message,
          );
        }
      },
    );
    return current;
  }
  function draftSnapshot(next: RoutineDocument) {
    return {
      doc: next,
      savedDocument: savedDocument.current,
      draftId,
      draftRevision,
      base,
      studentRevision,
      rawValues: Object.fromEntries(
        Object.entries(rawValues.current).map(([key, value]) => [
          key,
          isRestField(
            key.split(":").at(-1) as Parameters<typeof parseNumber>[0],
          )
            ? storeRestRaw(value)
            : value,
        ]),
      ),
    };
  }
  async function createNew(next: RoutineDocument) {
    const nextBase = row!.confirmed.routine?.id ?? null;
    const nextRevision = row!.confirmed.revision;
    // Persist the replacement before showing it. Reuse the explicitly replaced
    // draft so its old cloud copy cannot resurface after publication.
    await writes.current.catch(() => undefined);
    await persist({
      doc: next,
      draftId,
      draftRevision,
      base: nextBase,
      studentRevision: nextRevision,
      rawValues: {},
      savedDocument: null,
    });
    savedDocument.current = null;
    rawValues.current = {};
    rawInvalid.current.clear();
    setDoc(next);
    setBase(nextBase);
    setStudentRevision(nextRevision);
    setDirty(true);
    setError("");
    setMessage(
      "Nueva rutina en preparación. Guardá el borrador y luego activalo cuando esté listo.",
    );
    setMode("edit");
  }
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
    const changed =
      !sameRoutineContent(next, savedDocument.current) ||
      rawInvalid.current.size > 0;
    setDirty(changed);
    setMessage("");
    void persist(draftSnapshot(next)).catch(() => undefined);
  }
  async function handleCommandError(cause: unknown) {
    const message = (cause as Error).message;
    setError(message);
    try {
      const pending = (await db.meta.get("admin:" + id))?.value as
        CommandEnvelope | undefined;
      setPendingOperation(
        pending && ["save_draft", "publish_routine"].includes(pending.kind)
          ? pending
          : undefined,
      );
      if (pending) return;
    } catch {
      return;
    }
    if (!/cambiaron|cambió|versión|conflict|changed|stale draft/i.test(message))
      return;
    try {
      const remote = await gateway(db.scope).fetchStudent(db.scope, id!);
      const remoteDraft = await cloud()
        .from("routine_drafts")
        .select("document,revision,base_revision_id")
        .eq("id", draftId)
        .maybeSingle();
      if (remoteDraft.error) throw remoteDraft.error;
      const activeChanged = remote.routine && remote.routine.id !== base;
      const draftChanged =
        remoteDraft.data && remoteDraft.data.revision !== draftRevision;
      const draftConsumed = !remoteDraft.data && draftRevision > 0;
      if (activeChanged || draftChanged || draftConsumed) {
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
          document:
            activeChanged || draftConsumed
              ? (remote.routine?.document ?? blankRoutine())
              : remoteDraft.data!.document,
          revisionBase:
            activeChanged || draftConsumed
              ? (remote.routine?.id ?? null)
              : remoteDraft.data!.base_revision_id,
          draftRevision: remoteDraft.data?.revision ?? 0,
          draftExists: Boolean(remoteDraft.data),
        });
      } else {
        setStudentRevision(remote.revision);
        setError(
          message + " El borrador se conserva. Volvé a intentar guardar.",
        );
      }
    } catch {
      setError(
        message +
          " No se pudo recuperar la versión vigente. El borrador se conserva.",
      );
    }
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      if (rawInvalid.current.size)
        throw Error("Completá o corregí los campos antes de guardar.");
      const issues = validateRoutine(doc);
      if (issues.length) throw Error(issues[0]);
      await persist(draftSnapshot(doc));
      const latest = await gateway(db.scope).fetchStudent(db.scope, id!);
      if (!pendingSave && (latest.routine?.id ?? null) !== base)
        throw Error(
          "La rutina activa cambió. Revisá los cambios antes de guardar.",
        );
      const snapshot = await onlineCommand(
        id!,
        "save_draft",
        pendingSave
          ? pendingOperation!.payload
          : {
              draftId,
              expectedDraftRevision: draftRevision,
              baseRoutineRevisionId: base,
              document: doc,
            },
        latest.revision,
      );
      savedDocument.current = structuredClone(doc);
      setDraftRevision(draftRevision + 1);
      setStudentRevision(snapshot.revision);
      setDirty(false);
      rawValues.current = {};
      setPendingOperation(undefined);
      await persist({
        ...draftSnapshot(doc),
        savedDocument: doc,
        draftRevision: draftRevision + 1,
        studentRevision: snapshot.revision,
        rawValues: {},
      });
      setMessage("Borrador guardado. Todavía no cambia la rutina activa.");
      setMode("view");
    } catch (e) {
      await handleCommandError(e);
    } finally {
      setBusy(false);
    }
  }
  async function publish() {
    setBusy(true);
    setError("");
    try {
      if (
        !pendingPublish &&
        !publishedSnapshot.current &&
        row?.projection.sessions.length
      )
        throw Error(
          "Finalizá el entrenamiento abierto antes de activar una nueva rutina.",
        );
      if (
        !pendingPublish &&
        !publishedSnapshot.current &&
        (dirty || !draftRevision)
      )
        throw Error("Guardá el borrador antes de activar.");
      const issues = validateRoutine(doc, true);
      if (!pendingPublish && !publishedSnapshot.current && issues.length)
        throw Error(issues[0]);
      if (!pendingPublish && !publishedSnapshot.current)
        await storage.assertCurrent();
      const latest =
        publishedSnapshot.current ??
        (await gateway(db.scope).fetchStudent(db.scope, id!));
      const snapshot =
        publishedSnapshot.current ??
        (await onlineCommand(
          id!,
          "publish_routine",
          pendingPublish
            ? pendingOperation!.payload
            : {
                draftId,
                expectedDraftRevision: draftRevision,
                baseRoutineRevisionId: base,
                targetMonth: new Intl.DateTimeFormat("en-CA", {
                  timeZone: "America/Argentina/Buenos_Aires",
                  year: "numeric",
                  month: "2-digit",
                }).format(new Date()),
              },
          latest.revision,
        ));
      publishedSnapshot.current = snapshot;
      await storage.remove();
      setPendingOperation(undefined);
      setBase(snapshot.routine!.id);
      setStudentRevision(snapshot.revision);
      setDraftId(crypto.randomUUID());
      setDraftRevision(0);
      setMessage("Rutina activa. La versión anterior se conserva.");
      allowNavigation();
      navigate(`/alumnos/${id}/rutina`, {
        replace: true,
        state: { activated: true },
      });
    } catch (e) {
      if (publishedSnapshot.current) {
        setLocalFailed(true);
        setError(
          "La rutina ya está activa. Reintentá la activación para terminar de limpiar el borrador local.",
        );
        return;
      }
      await handleCommandError(e);
    } finally {
      setBusy(false);
    }
  }
  if (!row || !loaded)
    return (
      <div className="stack">
        {error ? (
          <p role="alert">{error}</p>
        ) : (
          <LoadingState label="Cargando borrador…" />
        )}
        {error && (
          <button
            className="button secondary"
            onClick={() => navigate(`/alumnos/${id}/borradores`)}
          >
            Volver a borradores
          </button>
        )}
      </div>
    );
  const isNew =
    !row.projection.routine ||
    doc.weeks[0][0].id !== row.projection.routine.document.weeks[0][0].id;
  const activationIssues = validateRoutine(doc, true);
  return (
    <div className="student-page routine-workspace">
      {guard}
      <StudentHeader data={row.projection} />
      <header className="student-section-toolbar">
        <div>
          <h2>
            {mode === "edit"
              ? isNew
                ? "Nueva rutina · borrador"
                : "Editar borrador"
              : mode === "start"
                ? "Crear rutina"
                : doc.name}
          </h2>
          <p className="muted">
            {mode === "start"
              ? "Elegí una base para preparar su próxima rutina"
              : writing
                ? "Guardando borrador…"
                : localFailed
                  ? "Cambios sin guardar en este dispositivo"
                  : dirty
                    ? "Borrador guardado en este dispositivo"
                    : draftRevision
                      ? activationIssues.length
                        ? "Borrador guardado · falta completar la programación"
                        : "Borrador listo para activar"
                      : row.projection.routine
                        ? "Sin cambios pendientes"
                        : "Programación de 4 semanas"}
          </p>
        </div>
        <div className="routine-heading-actions">
          {mode === "edit" && (
            <button
              className={
                "button" + (draftRevision && !dirty ? " secondary" : "")
              }
              disabled={busy || (!dirty && !pendingSave)}
              onClick={save}
            >
              {pendingSave ? "Reintentar guardado" : "Guardar borrador"}
            </button>
          )}
          {mode === "view" && (
            <button
              className={"button" + (draftRevision ? " secondary" : "")}
              disabled={busy || Boolean(pendingOperation)}
              onClick={() => setMode("edit")}
            >
              <Pencil size={17} aria-hidden="true" /> Editar borrador
            </button>
          )}
          {mode !== "start" && draftRevision > 0 && (
            <button
              className="button"
              disabled={busy || dirty || pendingSave}
              onClick={publish}
            >
              {pendingPublish ? "Reintentar activación" : "Activar rutina"}
            </button>
          )}
          {mode !== "start" && (
            <button
              className="button secondary"
              disabled={busy || Boolean(pendingOperation)}
              onClick={() => {
                setInitialSource("");
                setMessage("");
                setError("");
                setComparison(null);
                setMode("start");
              }}
            >
              <Plus size={17} aria-hidden="true" /> Nueva rutina
            </button>
          )}
          {mode !== "start" && (dirty || draftRevision > 0) && (
            <DiscardStudentDraft
              studentId={id!}
              draftId={draftId}
              revision={draftRevision}
              disabled={busy || Boolean(pendingOperation)}
              beforeDiscard={() => writes.current.catch(() => undefined)}
              onDiscard={() => {
                allowNavigation();
                navigate(`/alumnos/${id}/borradores`, { replace: true });
              }}
            />
          )}
        </div>
      </header>
      {mode !== "start" && (dirty || draftRevision > 0) && (
        <p className="notice">
          {row.projection.routine
            ? `La rutina vigente, «${row.projection.routine.document.name}», sigue activa. `
            : ""}
          {dirty
            ? "Guardá los cambios y activá el borrador cuando esté listo."
            : activationIssues.length
              ? "Borrador guardado. Completá los días de las cuatro semanas antes de activarlo."
              : "Borrador guardado. Podés activarlo cuando esté listo."}
        </p>
      )}
      {mode === "view" && draftRevision > 0 && activationIssues.length > 0 && (
        <section
          className="routine-activation-checklist"
          aria-label="Pendientes para activar"
        >
          <h3>Antes de activar</h3>
          <p>Un ejercicio completo por día alcanza. Revisá estos puntos:</p>
          <ul>
            {activationIssues.map((issue, i) => (
              <li key={i}>{issue}</li>
            ))}
          </ul>
          <p>
            Si las semanas repiten el plan, usá «Copiar semana» en el editor.
          </p>
        </section>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {localFailed && (
        <button
          className="button secondary"
          onClick={() => downloadDraftRecovery(id!, draftSnapshot(doc))}
        >
          Descargar copia de recuperación
        </button>
      )}
      {localFailed && (
        <button
          className="button secondary"
          disabled={writing || busy}
          onClick={() => {
            void persist(draftSnapshot(doc)).catch(() => undefined);
          }}
        >
          Reintentar guardado local
        </button>
      )}
      {localFailed && (
        <button
          className="button secondary"
          disabled={writing || busy}
          onClick={async () => {
            setBusy(true);
            try {
              const copy = await createTemplateDraft(
                db,
                doc,
                draftSnapshot(doc).rawValues,
              );
              allowNavigation();
              navigate(templatePath(copy));
            } catch (cause) {
              setError((cause as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Conservar cambios como otra plantilla
        </button>
      )}
      {pendingOperation && (
        <p className="notice">
          Falta confirmar la operación. Reintentá antes de seguir editando.
        </p>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {comparison && (
        <DraftComparison
          base={comparison.base}
          local={doc}
          remote={comparison.document}
          onCancel={() => setComparison(null)}
          onApply={async (next) => {
            const nextId = comparison.draftExists
                ? draftId
                : crypto.randomUUID(),
              nextBase = comparison.revisionBase,
              nextRevision = comparison.remote.revision,
              nextDraftRevision = comparison.draftRevision;
            try {
              await persist({
                doc: next,
                draftId: nextId,
                draftRevision: nextDraftRevision,
                base: nextBase,
                studentRevision: nextRevision,
                rawValues: {},
                savedDocument: null,
              });
              rawValues.current = {};
              rawInvalid.current.clear();
              savedDocument.current = null;
              setDoc(next);
              setBase(nextBase);
              setDraftId(nextId);
              setDraftRevision(nextDraftRevision);
              setStudentRevision(nextRevision);
              setDirty(true);
              setComparison(null);
              setError("");
              setMode("edit");
              setMessage("Borrador revisado. Guardalo antes de activar.");
            } catch {
              /* The comparison remains open until the copy is durable. */
            }
          }}
        />
      )}
      {mode === "start" && (
        <TemplateTools
          studentId={id!}
          hasDraft={dirty || draftRevision > 0}
          initialSource={initialSource}
          onApply={createNew}
          onCancel={
            row.projection.routine || dirty || draftRevision
              ? () =>
                  dirty || draftRevision
                    ? setMode("edit")
                    : navigate(`/alumnos/${id}/rutina`)
              : undefined
          }
        />
      )}
      {mode === "view" && <RoutineSummary document={doc} />}
      {mode === "edit" && (
        <RoutineFields
          key={draftId}
          doc={doc}
          change={change}
          busy={busy || Boolean(pendingOperation)}
          scheduledWeekdays={row.projection.schedule?.weekdays}
          rawValues={rawValues}
          rawInvalid={rawInvalid}
        />
      )}
    </div>
  );
}
