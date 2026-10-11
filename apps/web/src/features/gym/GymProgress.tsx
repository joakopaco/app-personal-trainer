import { useState } from "react";
import { useParams } from "react-router-dom";
import { Download } from "lucide-react";
import { cloud } from "../../adapters/supabase";
import { useGym } from "./GymContext";
import {
  accountColumns,
  dateLabel,
  rows,
  useResource,
  type GymAccount,
  type GymSession,
  type GymRevision,
} from "./api";
import { Empty, LoadState, PageHeading } from "./ui";
import { MuscleMap, ExportAnatomy, Trend } from "../history/Progress";
import {
  buildProgress,
  loadAllPages,
  type ResultSession,
} from "../history/history-progress-model";
import { DateInput } from "../../components/DateInput";
import { DocumentPreview } from "../../components/DocumentPreview";
import { Brand } from "../../components/Brand";
import { progressCsv, sessionDate } from "./progress-model";
import { restLabel } from "../routines/PrescriptionFields";
import "../history/history.css";

function progressRows(sessions: GymSession[]): ResultSession[] {
  return sessions.map((s) => ({
    id: s.id,
    date: sessionDate(s.started_at),
    ended_at: s.finished_at!,
    session_items: s.day.blocks
      .flatMap((b) => b.exercises)
      .map((e) => {
        const result = s.results.find((r) => r.positionId === e.id);
        return {
          id: e.id,
          name: e.name,
          type: e.type,
          warmup: e.warmup,
          skipped: result?.skipped ?? false,
          exercise_id: e.exerciseId,
          group: e.group,
          session_sets: (result?.sets || []).map((set, n) => ({
            id: e.id + "-" + n,
            ordinal: n,
            state: set.confirmed ? "done" : "pending",
            source: "member",
            weight: set.weight,
            reps: set.reps,
            duration_sec: set.durationSec,
          })),
        };
      }),
  }));
}
export function GymProgress() {
  const { id } = useParams(),
    { access } = useGym(),
    memberId = id || access.userId;
  const [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [group, setGroup] = useState(""),
    [exercise, setExercise] = useState(""),
    [exporting, setExporting] = useState(false);
  const data = useResource(async () => {
    const member = await rows<GymAccount>(
      cloud()
        .from("gym_accounts")
        .select(accountColumns)
        .eq("user_id", memberId)
        .single(),
    );
    const sessions = await loadAllPages<GymSession>((start, end) =>
      cloud()
        .from("gym_sessions")
        .select("*")
        .eq("member_id", memberId)
        .eq("status", "finished")
        .order("started_at", { ascending: false })
        .order("id")
        .range(start, end),
    );
    const revisionIds = [
      ...new Set(sessions.rows.map((session) => session.routine_revision_id)),
    ];
    const revisions: GymRevision[] = [];
    for (let start = 0; start < revisionIds.length; start += 100) {
      revisions.push(
        ...(await rows<GymRevision[]>(
          cloud()
            .from("gym_routine_revisions")
            .select("id,document")
            .in("id", revisionIds.slice(start, start + 100)),
        )),
      );
    }
    const dayLabels = new Map(
      sessions.rows.map((session) => {
        const index =
          revisions
            .find((r) => r.id === session.routine_revision_id)
            ?.document.weeks[session.week]?.findIndex(
              (day) => day.id === session.day.id,
            ) ?? -1;
        return [session.id, index >= 0 ? `Día ${index + 1}` : session.day.name];
      }),
    );
    return { member, ...sessions, dayLabels };
  }, access.gymId + memberId);
  const invalidRange = !!(from && to && from > to);
  const filtered = (data.value?.rows || []).filter(
      (s) =>
        !invalidRange &&
        (!from || sessionDate(s.started_at) >= from) &&
        (!to || sessionDate(s.started_at) <= to),
    ),
    progress = buildProgress(progressRows(filtered)),
    trained = new Set(progress.map((e) => e.group)),
    activeGroup = trained.has(group) ? group : "",
    matching = progress.filter((e) => !activeGroup || e.group === activeGroup),
    selected = matching.find((e) => e.key === exercise) || matching[0];
  const volume = progress.reduce(
      (total, e) =>
        total + e.points.reduce((sum, p) => sum + (p.volume || 0), 0),
      0,
    ),
    sets = progress.reduce(
      (total, e) => total + e.points.reduce((sum, p) => sum + p.sets, 0),
      0,
    );
  return (
    <>
      <PageHeading
        back={id ? "/gimnasio/entrenados/" + id : undefined}
        eyebrow={data.value?.member.name || access.name}
        title="Progreso"
        description="Cada serie confirmada cuenta. Explorá tu evolución por ejercicio."
        actions={
          <button
            className="button secondary"
            disabled={!data.value || invalidRange || !progress.length}
            onClick={() => setExporting(true)}
          >
            <Download size={18} />
            Exportar progreso
          </button>
        }
      />
      <div className="gym-progress-filters card">
        <div className="gym-date-filters">
          <label className="field">
            Desde
            <DateInput
              aria-label="Desde"
              value={from}
              aria-invalid={invalidRange}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="field">
            Hasta
            <DateInput
              aria-label="Hasta"
              value={to}
              aria-invalid={invalidRange}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
        </div>
        {(from || to) && (
          <button
            className="button secondary"
            onClick={() => {
              setFrom("");
              setTo("");
            }}
          >
            Todo el historial
          </button>
        )}
      </div>
      {invalidRange && (
        <p className="error" role="alert">
          La fecha Desde debe ser anterior o igual a Hasta.
        </p>
      )}
      <LoadState {...data} retry={data.reload} />
      {data.value?.truncated && (
        <p className="notice">Se muestran los últimos 5000 entrenamientos.</p>
      )}
      {data.value && (
        <>
          <div className="gym-stats">
            <div className="card">
              <strong>{filtered.length}</strong>
              <span>Entrenamientos</span>
            </div>
            <div className="card">
              <strong>{sets}</strong>
              <span>Series confirmadas</span>
            </div>
            <div className="card">
              <strong>{volume.toLocaleString("es-AR")} kg</strong>
              <span>Volumen · carga × repeticiones</span>
            </div>
          </div>
          <div className="gym-progress-grid">
            <MuscleMap
              group={activeGroup}
              onSelect={(g) => {
                setGroup(g === activeGroup ? "" : g);
                setExercise("");
              }}
              trained={trained}
              female={data.value.member.gender === "female"}
            />
            <div className="stack">
              <section className="card stack">
                <div className="gym-heading-row">
                  <h2>Evolución por ejercicio</h2>
                  {activeGroup && (
                    <button
                      className="button secondary"
                      onClick={() => setGroup("")}
                    >
                      Todos los músculos
                    </button>
                  )}
                </div>
                <label className="field">
                  Grupo muscular
                  <select
                    value={activeGroup}
                    onChange={(e) => {
                      setGroup(e.target.value);
                      setExercise("");
                    }}
                  >
                    <option value="">Todos los músculos</option>
                    {[...trained].sort().map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Ejercicio
                  <select
                    value={selected?.key || ""}
                    onChange={(e) => setExercise(e.target.value)}
                  >
                    {matching.map((e) => (
                      <option key={e.key} value={e.key}>
                        {e.name}
                      </option>
                    ))}
                    {!matching.length && (
                      <option value="">Sin registros confirmados</option>
                    )}
                  </select>
                </label>
                {selected ? (
                  <Trend exercise={selected} />
                ) : (
                  <p className="muted">
                    Completá un entrenamiento para ver tu evolución.
                  </p>
                )}
              </section>
              <section className="card stack">
                <h2>Entrenamientos anteriores</h2>
                {!filtered.length ? (
                  <p className="muted">
                    Todavía no hay entrenamientos en este período.
                  </p>
                ) : (
                  filtered.map((s) => (
                    <details key={s.id} className="gym-history-item">
                      <summary>
                        <strong>{s.routine_name}</strong>
                        <span>
                          {dateLabel(s.started_at)} · Semana {s.week + 1} ·{" "}
                          {data.value!.dayLabels.get(s.id)}
                        </span>
                      </summary>
                      <div className="stack">
                        {s.day.blocks
                          .flatMap((b) => b.exercises)
                          .map((e) => {
                            const result = s.results.find(
                              (r) => r.positionId === e.id,
                            );
                            return (
                              <div key={e.id}>
                                <strong>{e.name}</strong>
                                <p className="muted">
                                  {result?.skipped
                                    ? "No se realizó"
                                    : result?.sets
                                        .filter((s) => s.confirmed)
                                        .map((s) =>
                                          e.type === "time"
                                            ? restLabel(s.durationSec ?? 0)
                                            : e.type === "reps"
                                              ? `${s.reps} repeticiones`
                                              : `${s.weight} kg × ${s.reps}`,
                                        )
                                        .join(" · ") ||
                                      "Sin series confirmadas"}
                                </p>
                              </div>
                            );
                          })}
                      </div>
                    </details>
                  ))
                )}
              </section>
            </div>
          </div>
        </>
      )}
      {exporting && data.value && (
        <DocumentPreview
          title={"Progreso de " + data.value.member.name}
          onClose={() => setExporting(false)}
          actions={
            <button
              className="button secondary"
              onClick={() => {
                const url = URL.createObjectURL(
                  new Blob([progressCsv(data.value!.member.name, progress)], {
                    type: "text/csv;charset=utf-8",
                  }),
                );
                const link = document.createElement("a");
                link.href = url;
                link.download = "pulso-progreso.csv";
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
            >
              Descargar CSV
            </button>
          }
        >
          <div className="document-brand">
            <Brand />
          </div>
          <h1>Progreso de {data.value.member.name}</h1>
          <p>
            {access.gymName} · {from || "Desde el inicio"} — {to || "Hoy"}
          </p>
          <p>
            {filtered.length}{" "}
            {filtered.length === 1 ? "entrenamiento" : "entrenamientos"} ·{" "}
            {sets} {sets === 1 ? "serie" : "series"} ·{" "}
            {volume.toLocaleString("es-AR")} kg de volumen
          </p>
          <p className="document-context">
            Cada punto muestra la mayor carga, repeticiones o duración
            confirmada del ejercicio en esa sesión. Excluye calentamiento y
            ejercicios omitidos. Las repeticiones y las condiciones pueden
            variar; los valores no miden fuerza absoluta.
          </p>
          <ExportAnatomy
            female={data.value.member.gender === "female"}
            trained={trained}
          />
          {progress.map((e) => (
            <section className="gym-print-week" key={e.key}>
              <h2>{e.name}</h2>
              <Trend exercise={e} report />
            </section>
          ))}
        </DocumentPreview>
      )}
    </>
  );
}
