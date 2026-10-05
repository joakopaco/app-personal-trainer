import "./routine-editor.css";
import { StudentHeader } from "../students/StudentHeader";
import { RoutineSummary } from "./RoutineSummary";
import { useEffect, useState, useRef } from "react";
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
import type { StudentSnapshot } from "@pulso/domain/contracts";
export function RoutineBuilder() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const savedDocument = useRef<RoutineDocument | null>(null);
  const writes = useRef<Promise<unknown>>(Promise.resolve());
  const requestedDraft = params.get("draft");
  const [initialSource, setInitialSource] = useState("");
  const { rows, db, onlineCommand } = useData();
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
  } | null>(null);
  useEffect(() => {
    if (!row) return;
    let active = true;
    void (async () => {
      let query = cloud()
        .from("routine_drafts")
        .select("*")
        .eq("student_id", id!);
      if (requestedDraft) query = query.eq("id", requestedDraft);
      const { data, error: loadError } = await query
        .order("updated_at", { ascending: false })
        .limit(1);
      const stored = await db.meta.get("draft:" + id);
      const local =
        stored &&
        (!requestedDraft ||
          (stored.value as { draftId: string }).draftId === requestedDraft)
          ? stored
          : undefined;
      if (!active) return;
      if (loadError && !local) {
        setError(
          "No se pudo cargar el borrador. Volvé a intentar con conexión.",
        );
        return;
      }
      if (stored && requestedDraft && !local) {
        setError(
          "Hay cambios pendientes en otro borrador de este alumno. Guardalo o descartalo antes de abrir otro.",
        );
        return;
      }
      if (requestedDraft && !local && !data?.[0]) {
        navigate(`/alumnos/${id}/borradores`, { replace: true });
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
          savedDocument.current =
            l.savedDocument ??
            (data?.[0]?.revision === l.draftRevision
              ? data[0].document
              : !l.draftRevision
                ? (row.confirmed.routine?.document ?? null)
                : null);
          const changed =
            JSON.stringify(l.doc) !== JSON.stringify(savedDocument.current) ||
            rawInvalid.current.size > 0;
          setDirty(changed);
          setMode("edit");
          setLoaded(true);
        }
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
  async function createNew(next: RoutineDocument) {
    const nextBase = row!.confirmed.routine?.id ?? null;
    const nextRevision = row!.confirmed.revision;
    // Persist the replacement before showing it. Reuse the explicitly replaced
    // draft so its old cloud copy cannot resurface after publication.
    await writes.current;
    savedDocument.current = null;
    await db.meta.put({
      key: "draft:" + id,
      value: {
        doc: next,
        draftId,
        draftRevision,
        base: nextBase,
        studentRevision: nextRevision,
        rawValues: {},
      },
    });
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
      JSON.stringify(next) !== JSON.stringify(savedDocument.current) ||
      rawInvalid.current.size > 0;
    setDirty(changed);
    setMessage("");
    writes.current = writes.current
      .catch(() => undefined)
      .then(
        async () =>
          await (!changed
            ? db.meta.delete("draft:" + id)
            : db.meta.put({
                key: "draft:" + id,
                value: {
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
                        key.split(":").at(-1) as Parameters<
                          typeof parseNumber
                        >[0],
                      )
                        ? storeRestRaw(value)
                        : value,
                    ]),
                  ),
                },
              })),
      )
      .catch(() =>
        setError("No se pudo conservar el borrador en este dispositivo."),
      );
  }
  async function handleCommandError(cause: unknown) {
    const message = (cause as Error).message;
    setError(message);
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
      if (activeChanged || draftChanged) {
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
          document: activeChanged
            ? remote.routine!.document
            : remoteDraft.data!.document,
          revisionBase: activeChanged
            ? remote.routine!.id
            : remoteDraft.data!.base_revision_id,
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
      await writes.current;
      const latest = await gateway(db.scope).fetchStudent(db.scope, id!);
      if ((latest.routine?.id ?? null) !== base)
        throw Error(
          "La rutina activa cambió. Revisá los cambios antes de guardar.",
        );
      const snapshot = await onlineCommand(
        id!,
        "save_draft",
        {
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
      await db.meta.delete("draft:" + id);
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
      if (row?.projection.sessions.length)
        throw Error(
          "Finalizá el entrenamiento abierto antes de activar una nueva rutina.",
        );
      if (dirty || !draftRevision)
        throw Error("Guardá el borrador antes de activar.");
      const issues = validateRoutine(doc, true);
      if (issues.length) throw Error(issues[0]);
      const latest = await gateway(db.scope).fetchStudent(db.scope, id!);
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
        latest.revision,
      );
      setBase(snapshot.routine!.id);
      setStudentRevision(snapshot.revision);
      setDraftId(crypto.randomUUID());
      setDraftRevision(0);
      setMessage("Rutina activa. La versión anterior se conserva.");
      navigate(`/alumnos/${id}/rutina`, {
        replace: true,
        state: { activated: true },
      });
    } catch (e) {
      await handleCommandError(e);
    } finally {
      setBusy(false);
    }
  }
  if (!row || !loaded)
    return (
      <div className="stack">
        <p role={error ? "alert" : "status"}>{error || "Cargando borrador…"}</p>
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
  return (
    <div className="student-page routine-workspace">
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
              : dirty
                ? "Borrador guardado en este dispositivo"
                : draftRevision
                  ? "Borrador listo para activar"
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
              disabled={busy || !dirty}
              onClick={save}
            >
              Guardar borrador
            </button>
          )}
          {mode === "view" && (
            <button
              className={"button" + (draftRevision ? " secondary" : "")}
              disabled={busy}
              onClick={() => setMode("edit")}
            >
              <Pencil size={17} aria-hidden="true" /> Editar borrador
            </button>
          )}
          {mode !== "start" && draftRevision > 0 && (
            <button
              className="button"
              disabled={busy || dirty}
              onClick={publish}
            >
              Activar rutina
            </button>
          )}
          {mode !== "start" && (
            <button
              className="button secondary"
              disabled={busy}
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
              beforeDiscard={() => writes.current}
              onDiscard={() =>
                navigate(`/alumnos/${id}/borradores`, { replace: true })
              }
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
            : "Borrador guardado. Podés activarlo cuando esté listo."}
        </p>
      )}
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
      {comparison && (
        <DraftComparison
          base={comparison.base}
          local={doc}
          remote={comparison.document}
          onCancel={() => setComparison(null)}
          onApply={(next) => {
            const nextId = crypto.randomUUID(),
              nextBase = comparison.revisionBase,
              nextRevision = comparison.remote.revision;
            rawValues.current = {};
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
            setError("");
            savedDocument.current = null;
            setMode("edit");
            setMessage("Borrador revisado. Guardalo antes de activar.");
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
          busy={busy}
          rawValues={rawValues}
          rawInvalid={rawInvalid}
        />
      )}
    </div>
  );
}
