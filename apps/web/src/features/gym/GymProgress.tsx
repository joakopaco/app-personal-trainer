import { useState } from "react";
import { useParams } from "react-router-dom";
import { Download } from "lucide-react";
import { cloud } from "../../adapters/supabase";
import { useGym } from "./GymPortal";
import {
  accountColumns,
  dateLabel,
  rows,
  useResource,
  type GymAccount,
  type GymSession,
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
import "../history/history.css";

function progressRows(sessions: GymSession[]): ResultSession[] {
  return sessions.map((s) => ({
    id: s.id,
    date: s.started_at.slice(0, 10),
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
    return { member, ...sessions };
  }, access.gymId + memberId);
  const filtered = (data.value?.rows || []).filter(
      (s) =>
        (!from || s.started_at.slice(0, 10) >= from) &&
        (!to || s.started_at.slice(0, 10) <= to),
    ),
    progress = buildProgress(progressRows(filtered)),
    trained = new Set(progress.map((e) => e.group)),
    matching = progress.filter((e) => !group || e.group === group),
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
            disabled={!data.value}
            onClick={() => setExporting(true)}
          >
            <Download size={18} />
            Exportar progreso
          </button>
        }
      />
      <div className="gym-date-filters">
        <label className="field">
          Desde
          <DateInput value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="field">
          Hasta
          <DateInput value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>
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
              group={group}
              onSelect={(g) => {
                setGroup(g === group ? "" : g);
                setExercise("");
              }}
              trained={trained}
              female={data.value.member.gender === "female"}
            />
            <div className="stack">
              <section className="card stack">
                <div className="gym-heading-row">
                  <h2>Evolución por ejercicio</h2>
                  {group && (
                    <button
                      className="button secondary"
                      onClick={() => setGroup("")}
                    >
                      Todos los músculos
                    </button>
                  )}
                </div>
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
                          {dateLabel(s.started_at)} · {s.day.name}
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
                                            ? `${s.durationSec} s`
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
        >
          <Brand />
          <h1>Progreso de {data.value.member.name}</h1>
          <p>
            {access.gymName} · {from || "Desde el inicio"} — {to || "Hoy"}
          </p>
          <p>
            {filtered.length} entrenamientos · {sets} series ·{" "}
            {volume.toLocaleString("es-AR")} kg de volumen
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
