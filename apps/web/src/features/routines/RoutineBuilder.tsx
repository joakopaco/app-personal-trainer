import "./routine-editor.css";
import { RoutineSummary } from "./RoutineSummary";
import { useEffect, useState, useRef } from "react";
import { Link, useParams } from "react-router-dom";
import { Plus, ArrowLeft, Pencil } from "lucide-react";
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
import { TemplateTools } from "./TemplateTools";
import { parseNumber } from "@pulso/domain/numbers";
import { DraftComparison } from "./DraftComparison";
import { gateway } from "../../adapters/supabase-gateway";
import type { StudentSnapshot } from "@pulso/domain/contracts";
export function RoutineBuilder() {
  const { id } = useParams();
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
          setDirty(true);
          setMode("edit");
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
        setMode("edit");
      } else {
        setDoc(row.projection.routine?.document ?? blankRoutine());
        setBase(row.projection.routine?.id ?? null);
        setDraftId(crypto.randomUUID());
        setDraftRevision(0);
        setMode(row.projection.routine ? "view" : "start");
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
        },
      })
      .catch(() =>
        setError("No se pudo conservar el borrador en este dispositivo."),
      );
  }
  async function handleCommandError(cause: unknown) {
    const message = (cause as Error).message;
    setError(message);
    if (!/cambiaron|versión|conflict|changed|stale draft/i.test(message))
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
      setMode("view");
    } catch (e) {
      await handleCommandError(e);
    } finally {
      setBusy(false);
    }
  }
  if (!row || !loaded) return <p role="status">Cargando borrador… {error}</p>;
  return (
    <div className="routine-workspace">
      <Link className="routine-back" to={"/alumnos/" + id}>
        <ArrowLeft size={18} aria-hidden="true" /> Volver a{" "}
        {row.projection.student.name}
      </Link>
      <header className="page-heading">
        <div>
          <p className="eyebrow">PROGRAMACIÓN MENSUAL</p>
          <h1>
            {mode === "edit"
              ? "Editar rutina"
              : mode === "start"
                ? "Crear rutina"
                : doc.name}
          </h1>
          <p className="muted">
            {row.projection.student.name} ·{" "}
            {dirty
              ? "Borrador guardado en este dispositivo"
              : draftRevision
                ? "Borrador listo para activar"
                : row.projection.routine
                  ? "Rutina activa"
                  : "Programación de 4 semanas"}
          </p>
        </div>
        <div className="routine-heading-actions">
          {mode === "edit" && (
            <button
              className={
                "button" + (draftRevision && !dirty ? " secondary" : "")
              }
              disabled={busy}
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
              <Pencil size={17} aria-hidden="true" /> Editar rutina
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
          {mode === "view" && !draftRevision && !dirty && (
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setMode("start")}
            >
              <Plus size={17} aria-hidden="true" /> Nueva rutina
            </button>
          )}
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
            setMode("edit");
            setMessage("Borrador revisado. Guardalo antes de activar.");
          }}
        />
      )}
      {mode === "start" && (
        <TemplateTools
          onApply={(next) => {
            change(next);
            setMode("edit");
          }}
          onCancel={row.projection.routine ? () => setMode("view") : undefined}
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
