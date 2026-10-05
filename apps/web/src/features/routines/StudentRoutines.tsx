import { useEffect, useState } from "react";
import {
  Link,
  Navigate,
  useNavigate,
  useParams,
  useSearchParams,
  useLocation,
} from "react-router-dom";
import type { RoutineDocument } from "@pulso/domain/routines";
import { useData } from "../../app/DataProvider";
import { cloud } from "../../adapters/supabase";
import { StudentHeader } from "../students/StudentHeader";
import { RoutineSummary } from "./RoutineSummary";
import { ExportRoutine } from "./ExportRoutine";
import "./routine-editor.css";

export function ActiveRoutine() {
  const { id } = useParams();
  const { rows, db } = useData();
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const data = rows.find((r) => r.studentId === id)?.projection;
  async function editCurrent() {
    setChecking(true);
    setError("");
    try {
      const local = await db.meta.get("draft:" + id);
      const saved = await cloud()
        .from("routine_drafts")
        .select("id")
        .eq("student_id", id!)
        .limit(1);
      if (saved.error) throw saved.error;
      if (local || saved.data?.length)
        navigate(`/alumnos/${id}/borradores`, { state: { pending: true } });
      else navigate(`/alumnos/${id}/borradores/editar`);
    } catch (e) {
      setError("No se pudo abrir la edición. " + (e as Error).message);
    } finally {
      setChecking(false);
    }
  }
  // Old bookmarks retain their intent without putting the editor in the active tab.
  if (params.get("nueva") === "1")
    return (
      <Navigate replace to={`/alumnos/${id}/borradores/editar?${params}`} />
    );
  if (!data) return <p role="status">Cargando rutina…</p>;
  return (
    <div className="student-page routine-workspace">
      <StudentHeader data={data} />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {location.state?.activated && (
        <p className="notice" role="status">
          Rutina activa. La versión anterior se conserva.
        </p>
      )}
      <header className="student-section-toolbar">
        <div>
          <h2>{data.routine?.document.name || "Rutina actual"}</h2>
          <p className="muted">
            {data.routine
              ? "Esta es la rutina que usa el alumno para entrenar."
              : "Todavía no hay una rutina activa."}
          </p>
        </div>
        <div className="routine-heading-actions">
          {data.routine && (
            <button
              className="button secondary"
              disabled={checking}
              onClick={editCurrent}
            >
              Editar rutina
            </button>
          )}
          <Link
            className="button"
            to={`/alumnos/${id}/borradores/editar?nueva=1`}
          >
            Nueva rutina
          </Link>
        </div>
      </header>
      {data.routine && (
        <>
          <div className="row">
            <ExportRoutine
              document={data.routine.document}
              student={data.student.name}
              month={data.period?.month}
            />
          </div>
          <RoutineSummary document={data.routine.document} />
        </>
      )}
    </div>
  );
}

export function DiscardStudentDraft({
  studentId,
  draftId,
  revision,
  onDiscard,
  beforeDiscard,
}: {
  studentId: string;
  draftId: string;
  revision: number;
  onDiscard: () => void;
  beforeDiscard?: () => Promise<unknown>;
}) {
  const { db } = useData();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reviewed, setReviewed] = useState<{
    revision: number;
    name: string;
  } | null>(null);
  async function review() {
    setConfirm(true);
    setBusy(true);
    setError("");
    setReviewed(null);
    try {
      const result = await cloud()
        .from("routine_drafts")
        .select("revision,document")
        .eq("student_id", studentId)
        .eq("id", draftId)
        .maybeSingle();
      if (result.error) throw result.error;
      setReviewed({
        revision: result.data?.revision ?? 0,
        name: result.data?.document.name ?? "",
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function discard() {
    setBusy(true);
    setError("");
    try {
      await beforeDiscard?.();
      // Even a locally edited draft can have a saved cloud copy.
      const result = await cloud().rpc("discard_student_draft", {
        workspace_id: db.scope.workspaceId,
        student_id: studentId,
        draft_id: draftId,
        expected_revision: reviewed!.revision,
      });
      if (result.error) throw result.error;
      await db.transaction("rw", db.meta, async () => {
        const local = await db.meta.get("draft:" + studentId);
        if ((local?.value as { draftId?: string })?.draftId === draftId)
          await db.meta.delete("draft:" + studentId);
      });
      setConfirm(false);
      onDiscard();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button className="button secondary" onClick={review}>
        Descartar borrador
      </button>
      {confirm && (
        <div className="modal-backdrop">
          <section
            className="card modal stack"
            role="dialog"
            aria-modal="true"
            aria-label="Descartar borrador"
          >
            <h2>¿Descartar este borrador?</h2>
            <p>
              Se eliminará esta preparación y sus cambios pendientes. La rutina
              actual y el historial se conservan.
            </p>
            {reviewed && reviewed.revision !== revision && reviewed.name && (
              <p className="notice">
                También se descartará la versión guardada más reciente de «
                {reviewed.name}».
              </p>
            )}
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            {error && (
              <button
                className="button secondary"
                disabled={busy}
                onClick={review}
              >
                Revisar versión guardada
              </button>
            )}
            <div className="row">
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => setConfirm(false)}
              >
                Cancelar
              </button>
              <button
                className="button danger"
                disabled={busy || !reviewed}
                onClick={discard}
              >
                {busy ? "Descartando…" : "Descartar borrador"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

type DraftItem = {
  id: string;
  document: RoutineDocument;
  revision: number;
  local?: boolean;
};
export function StudentDrafts() {
  const { id } = useParams();
  const location = useLocation();
  const { rows, db } = useData();
  const data = rows.find((r) => r.studentId === id)?.projection;
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const local = (await db.meta.get("draft:" + id))?.value as
          | { doc: RoutineDocument; draftId: string; draftRevision: number }
          | undefined;
        const result = await cloud()
          .from("routine_drafts")
          .select("id,document,revision")
          .eq("student_id", id!)
          .order("updated_at", { ascending: false });
        if (result.error) throw result.error;
        const items: DraftItem[] = result.data ?? [];
        if (local) {
          const index = items.findIndex((d) => d.id === local.draftId);
          if (index >= 0) items.splice(index, 1);
          items.unshift({
            id: local.draftId,
            document: local.doc,
            revision: local.draftRevision,
            local: true,
          });
        }
        if (active) {
          setDrafts(items);
          setError("");
        }
      } catch (e) {
        if (active)
          setError(
            "No se pudieron cargar los borradores. " + (e as Error).message,
          );
      } finally {
        if (active) setLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [db, id, version]);
  if (!data) return <p role="status">Cargando alumno…</p>;
  return (
    <div className="student-page routine-workspace">
      <StudentHeader data={data} />
      {location.state?.pending && drafts.length > 0 && (
        <p className="notice">
          Ya hay una rutina en preparación. Continuá ese borrador o descartalo
          antes de editar la rutina actual.
        </p>
      )}
      <header className="student-section-toolbar">
        <div>
          <h2>Borradores</h2>
          <p className="muted">
            Rutinas en preparación. Solo cambian la rutina actual cuando las
            activás.
          </p>
        </div>
        <Link
          className="button"
          to={`/alumnos/${id}/borradores/editar?nueva=1`}
        >
          Nueva rutina
        </Link>
      </header>
      {error && (
        <p className="error" role="alert">
          {error}
          <button
            className="button secondary"
            onClick={() => setVersion((v) => v + 1)}
          >
            Reintentar
          </button>
        </p>
      )}
      {!loaded && <p role="status">Cargando borradores…</p>}
      {loaded && !error && !drafts.length && (
        <section className="card empty">
          <h3>No hay borradores pendientes</h3>
          <p>
            Podés crear una rutina desde cero, una plantilla, otro alumno o una
            rutina anterior.
          </p>
        </section>
      )}
      {drafts.map((d) => (
        <section className="card stack" key={d.id}>
          <div>
            <span className="badge">
              {d.local ? "Cambios en este dispositivo" : "Borrador guardado"}
            </span>
            <h3>{d.document.name}</h3>
          </div>
          <div className="row">
            <Link
              className="button"
              to={`/alumnos/${id}/borradores/editar?draft=${d.id}`}
            >
              Continuar borrador
            </Link>
            <DiscardStudentDraft
              studentId={id!}
              draftId={d.id}
              revision={d.revision}
              onDiscard={() => setVersion((v) => v + 1)}
            />
          </div>
        </section>
      ))}
    </div>
  );
}
