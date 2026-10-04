import { useEffect, useId, useMemo, useRef, useState } from "react";
import { cloud } from "../../adapters/supabase";
import { Download } from "lucide-react";
import { DocumentPreview } from "../../components/DocumentPreview";
import { Brand } from "../../components/Brand";
import { csvCell } from "@pulso/domain/metrics";
import { anatomicalFigure } from "./anatomicalFigure";
import {
  buildProgress,
  loadAllPages,
  muscleGroups,
  type ExerciseProgress,
  type ResultSession,
} from "./history-progress-model";

const number = (value: number) =>
  value.toLocaleString("es-AR", { maximumFractionDigits: 2 });
const date = (value: string) =>
  new Date(value + "T12:00:00").toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
export function MuscleMap({
  group,
  onSelect,
  trained,
  female,
}: {
  group: string;
  onSelect: (group: string) => void;
  trained: Set<string>;
  female: boolean;
}) {
  const [back, setBack] = useState(false);
  const shadeId = "muscle-shade-" + useId().replaceAll(":", "");
  // Only first-party paths and fixed anatomical group names enter this markup.
  const markup = anatomicalFigure({
    female,
    back,
    shadeId,
    region: (name, path) =>
      `<path d="${path}" data-muscle="${name}" role="button" tabindex="0" aria-label="Seleccionar ${name}" aria-pressed="${name === group}" class="muscle-region ${name === group ? "selected" : ""} ${trained.has(name) ? "trained" : ""}"/>`,
  });
  return (
    <section
      className="card history-anatomy"
      aria-label="Mapa muscular interactivo"
    >
      <div className="row">
        <div>
          <p className="eyebrow">EXPLORÁ EL PROGRESO</p>
          <h2>Elegí un músculo</h2>
        </div>
      </div>
      <div className="history-segments" aria-label="Vista del cuerpo">
        <button
          type="button"
          aria-pressed={!back}
          onClick={() => setBack(false)}
        >
          Frente
        </button>
        <button type="button" aria-pressed={back} onClick={() => setBack(true)}>
          Espalda
        </button>
      </div>
      <svg
        className="history-body"
        viewBox="0 0 200 525"
        aria-label={back ? "Anatomía posterior" : "Anatomía frontal"}
        onClick={(event) => {
          const name = (event.target as Element)
            .closest("[data-muscle]")
            ?.getAttribute("data-muscle");
          if (name) onSelect(name);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          const name = (event.target as Element)
            .closest("[data-muscle]")
            ?.getAttribute("data-muscle");
          if (name) {
            event.preventDefault();
            onSelect(name);
          }
        }}
      >
        <defs>
          <linearGradient id={shadeId}>
            <stop stopColor="#fff" stopOpacity=".22" />
            <stop offset="1" stopColor="#152016" stopOpacity=".06" />
          </linearGradient>
        </defs>
        <g dangerouslySetInnerHTML={{ __html: markup }} />
      </svg>
      <p className="history-map-legend">
        <span /> Con registros <i /> Seleccionado
      </p>
      <p className="muted">
        Seleccioná una zona para explorar sus ejercicios. El color indica
        registros disponibles, no fuerza muscular.
      </p>
    </section>
  );
}

function Trend({ exercise }: { exercise: ExerciseProgress }) {
  const [focused, setFocused] = useState<number | null>(null);
  const chartRef = useRef<SVGSVGElement>(null);
  const [chartWidth, setChartWidth] = useState(650);
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0)
        setChartWidth(Math.max(240, Math.round(entry.contentRect.width)));
    });
    observer.observe(chart);
    return () => observer.disconnect();
  }, []);
  useEffect(() => setFocused(null), [exercise.exerciseId]);
  const left = 48,
    right = chartWidth - 18;
  const points = exercise.points,
    first = points[0],
    last = points.at(-1)!;
  const delta = last.value - first.value,
    min = Math.min(...points.map((p) => p.value)),
    max = Math.max(...points.map((p) => p.value));
  const span = max - min || Math.max(max * 0.2, 1);
  const timeStart = Date.parse(first.date),
    timeSpan = Date.parse(last.date) - timeStart;
  const xy = points.map((point) => ({
    x: timeSpan
      ? left +
        ((Date.parse(point.date) - timeStart) / timeSpan) * (right - left)
      : (left + right) / 2,
    y: 190 - ((point.value - min) / span) * 140,
  }));
  const active =
    points[Math.min(focused ?? points.length - 1, points.length - 1)];
  return (
    <>
      <div className="history-comparison">
        <div>
          <small>Al inicio</small>
          <strong>
            {number(first.value)} <span>{exercise.unit}</span>
          </strong>
          <small>{date(first.date)}</small>
        </div>
        <div>
          <small>Último registro</small>
          <strong>
            {number(last.value)} <span>{exercise.unit}</span>
          </strong>
          <small>{date(last.date)}</small>
        </div>
        <div className="history-delta">
          <small>Cambio en el período</small>
          <strong>
            {points.length < 2 ? "—" : (delta > 0 ? "+" : "") + number(delta)}{" "}
            <span>{points.length < 2 ? "" : exercise.unit}</span>
          </strong>
          <small>
            {points.length < 2
              ? "Hace falta otro registro"
              : first.value === 0
                ? "Inicio en cero"
                : (delta > 0 ? "+" : "") +
                  number((delta / first.value) * 100) +
                  "%"}
          </small>
        </div>
      </div>
      <svg
        ref={chartRef}
        className="history-chart"
        viewBox={`0 0 ${chartWidth} 240`}
        role="img"
        aria-label={`Evolución de ${exercise.name} en ${exercise.unit}`}
      >
        {[0, 1, 2].map((n) => (
          <g key={n}>
            <line
              x1={left}
              x2={right}
              y1={190 - n * 70}
              y2={190 - n * 70}
              stroke="var(--line)"
            />
            <text x={left - 10} y={195 - n * 70} textAnchor="end">
              {number(min + (n * span) / 2)}
            </text>
          </g>
        ))}
        <polyline
          points={xy.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke="var(--ink)"
          strokeWidth="3"
        />
        {xy.map((point, i) => (
          <circle
            key={points[i].sessionId}
            cx={point.x}
            cy={point.y}
            r="6"
            fill="var(--accent)"
            stroke="var(--ink)"
            tabIndex={0}
            onFocus={() => setFocused(i)}
            onMouseEnter={() => setFocused(i)}
            onClick={() => setFocused(i)}
            aria-label={`${date(points[i].date)}: ${number(points[i].value)} ${exercise.unit}${exercise.type === "load_reps" ? ", " + points[i].reps + " repeticiones" : ""}`}
          >
            <title>
              {date(points[i].date)} · {number(points[i].value)} {exercise.unit}
            </title>
          </circle>
        ))}
        <text x={left} y="225">
          {date(first.date)}
        </text>
        <text x={right} y="225" textAnchor="end">
          {date(last.date)}
        </text>
      </svg>
      <p className="history-chart-reading" aria-live="polite">
        {date(active.date)} ·{" "}
        <strong>
          {number(active.value)} {exercise.unit}
        </strong>
        {exercise.type === "load_reps" ? ` × ${active.reps} reps` : ""} ·{" "}
        {active.sets} series ·{" "}
        {active.source === "quick_confirmed"
          ? "Confirmación rápida"
          : "Registro individual"}
      </p>
      <p className="muted">
        {points.length} sesiones.{" "}
        {exercise.type === "load_reps"
          ? "Mayor carga de una serie por sesión; consultá las repeticiones para interpretar cada cambio. No equivale a una medición de fuerza máxima."
          : exercise.type === "reps"
            ? "Mayor cantidad de repeticiones de una serie por sesión."
            : "Mayor duración de una serie por sesión."}{" "}
        Se excluyen calentamientos y series omitidas.
      </p>
      <details>
        <summary>Ver todos los valores del ejercicio</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Mejor serie ({exercise.unit})</th>
                {exercise.type === "load_reps" && <th>Reps de esa serie</th>}
                <th>Series</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.sessionId}>
                  <td>{date(point.date)}</td>
                  <td>{number(point.value)}</td>
                  {exercise.type === "load_reps" && <td>{point.reps}</td>}
                  <td>{point.sets}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}

export function Progress({
  studentId,
  studentName = "Alumno",
  gender,
  refresh = 0,
}: {
  studentId: string;
  studentName?: string;
  gender?: string;
  refresh?: number;
}) {
  const [exportData, setExportData] = useState<{
    exercises: ExerciseProgress[];
    period: string;
    count: number;
  } | null>(null);
  const [loadedRange, setLoadedRange] = useState("");
  const [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [period, setPeriod] = useState("all");
  const [sessions, setSessions] = useState<ResultSession[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [truncated, setTruncated] = useState(false);
  const [group, setGroup] = useState("Cuádriceps"),
    [exerciseKey, setExerciseKey] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setSessions([]);
    setTruncated(false);
    if (from && to && from > to) {
      setLoading(false);
      return;
    }
    void loadAllPages<ResultSession>((start, end) =>
      cloud()
        .from("sessions")
        .select(
          "id,date,ended_at,session_items(id,name,type,warmup,skipped,exercise_id,group,session_sets(id,ordinal,state,source,weight,reps,duration_sec))",
        )
        .eq("student_id", studentId)
        .eq("status", "closed")
        .gte("date", from || "1900-01-01")
        .lte("date", to || "9999-12-31")
        .order("date")
        .order("ended_at")
        .order("id")
        .range(start, end),
    )
      .then((result) => {
        if (!active) return;
        setSessions(result.rows);
        setTruncated(result.truncated);
        setLoadedRange(JSON.stringify([studentId, from, to]));
      })
      .catch(() => {
        if (active)
          setError(
            "No se pudo cargar el progreso. Verificá tu conexión y reintentá.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [studentId, from, to, refresh, retry]);
  const data = useMemo(() => buildProgress(sessions), [sessions]);
  const groups = [
    ...new Set([...muscleGroups, ...data.map((exercise) => exercise.group)]),
  ];
  const options = data.filter((exercise) => exercise.group === group),
    selected =
      options.find((exercise) => exercise.key === exerciseKey) || options[0];
  const trained = new Set(data.map((exercise) => exercise.group));
  const rangeLabel =
    from || to
      ? `${from ? date(from) : "Primer registro"} — ${to ? date(to) : "Último registro"}`
      : "Todo el historial registrado";
  const canExport =
    !loading &&
    !error &&
    !truncated &&
    data.length > 0 &&
    !(from && to && from > to) &&
    loadedRange === JSON.stringify([studentId, from, to]);
  function selectPeriod(value: string) {
    setPeriod(value);
    if (value === "custom") return;
    setTo("");
    if (value === "all") {
      setFrom("");
      return;
    }
    const now = new Date();
    now.setDate(now.getDate() - Number(value));
    setFrom(
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
    );
  }
  return (
    <section
      className="history-progress"
      aria-label="Progreso por grupo muscular"
    >
      <div className="history-intro">
        <div>
          <p className="eyebrow">CADA REGISTRO CUENTA</p>
          <h2>Evolución por grupo muscular</h2>
          <p>
            Explorá los ejercicios, compará registros y mirá cómo cambian con el
            tiempo.
          </p>
        </div>
        <label className="field">
          Período de progreso
          <select
            value={period}
            onChange={(event) => selectPeriod(event.target.value)}
          >
            <option value="all">Todo el historial</option>
            <option value="30">Últimos 30 días</option>
            <option value="90">Últimos 90 días</option>
            <option value="180">Últimos 6 meses</option>
            <option value="custom">Elegir fechas</option>
          </select>
        </label>
      </div>
      {period === "custom" && (
        <div className="row history-dates">
          <label className="field">
            Progreso desde
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>
          <label className="field">
            Progreso hasta
            <input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </label>
        </div>
      )}
      <p className="muted">
        {from || to
          ? `${from ? date(from) : "Primer registro"} — ${to ? date(to) : "Último registro"}`
          : "Todo el historial registrado"}
        {!loading && !error && !truncated && !(from && to && from > to)
          ? ` · ${sessions.length} ${sessions.length === 1 ? "sesión finalizada" : "sesiones finalizadas"}`
          : ""}
      </p>
      <div className="progress-export-actions">
        <button
          className="button secondary"
          disabled={!canExport}
          onClick={() =>
            setExportData({
              exercises: structuredClone(data),
              period: rangeLabel,
              count: sessions.length,
            })
          }
        >
          <Download size={18} />
          Exportar progreso
        </button>
        <small>
          Todos los ejercicios del período elegido, con gráficos y registros.
        </small>
      </div>
      {from && to && from > to && (
        <p role="alert" className="error">
          La fecha inicial debe ser anterior o igual a la final.
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}{" "}
          <button
            className="link-button"
            onClick={() => setRetry((value) => value + 1)}
          >
            Reintentar
          </button>
        </p>
      )}
      {truncated && (
        <p role="alert" className="notice">
          Este período supera las 5.000 sesiones. Elegí fechas más acotadas para
          comparar el período completo; no mostramos una evolución parcial.
        </p>
      )}
      <div className="history-progress-grid">
        <MuscleMap
          group={group}
          onSelect={setGroup}
          trained={truncated ? new Set() : trained}
          female={gender === "femenino"}
        />
        <section
          className="card history-focus"
          aria-label="Evolución del ejercicio"
        >
          <label className="field">
            Grupo muscular
            <select
              aria-label="Grupo muscular"
              value={group}
              onChange={(event) => setGroup(event.target.value)}
            >
              {groups.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
          <p className="eyebrow">{group}</p>
          <h2>
            {selected && !truncated ? selected.name : "Cada avance empieza acá"}
          </h2>
          {loading ? (
            <p role="status">Cargando todas las sesiones del período…</p>
          ) : truncated ? (
            <p>Acotá el período para ver el gráfico.</p>
          ) : error ? (
            <p>
              El progreso estará disponible cuando se puedan consultar los
              registros.
            </p>
          ) : selected ? (
            <>
              <label className="field">
                Ver ejercicio
                <select
                  value={selected.key}
                  onChange={(event) => setExerciseKey(event.target.value)}
                >
                  {options.map((exercise) => (
                    <option key={exercise.key} value={exercise.key}>
                      {exercise.name} · {exercise.unit}
                    </option>
                  ))}
                </select>
              </label>
              <Trend key={selected.key + from + to} exercise={selected} />
            </>
          ) : (
            <div className="history-empty">
              <strong>
                Sin registros de {group.toLocaleLowerCase("es-AR")} en este
                período.
              </strong>
              <p>
                Al finalizar un entrenamiento con series confirmadas, vas a ver
                acá tus cargas, repeticiones o tiempos. Podés explorar los otros
                músculos desde el mapa.
              </p>
            </div>
          )}
        </section>
      </div>
      {!loading && !error && !truncated && data.length > 0 && (
        <section className="history-group-section">
          <h3>Explorá los grupos con registros</h3>
          <div className="history-group-cards">
            {[...trained].map((name) => {
              const exercises = data.filter(
                (exercise) => exercise.group === name,
              );
              const representative = [...exercises].sort(
                (a, b) => b.points.length - a.points.length,
              )[0];
              const first = representative.points[0],
                last = representative.points.at(-1)!;
              return (
                <button
                  type="button"
                  key={name}
                  className={name === group ? "selected" : ""}
                  aria-pressed={name === group}
                  onClick={() => setGroup(name)}
                >
                  <strong>{name}</strong>
                  <span>
                    {exercises.length}{" "}
                    {exercises.length === 1 ? "ejercicio" : "ejercicios"} ·{" "}
                    {exercises.reduce(
                      (sum, exercise) =>
                        sum +
                        exercise.points.reduce(
                          (count, point) => count + point.sets,
                          0,
                        ),
                      0,
                    )}{" "}
                    series
                  </span>
                  <small>{representative.name}</small>
                  <span className="history-group-evolution">
                    {number(first.value)} → {number(last.value)}{" "}
                    {representative.unit}
                  </span>
                  <small>
                    {representative.points.length > 1
                      ? (last.value - first.value > 0 ? "+" : "") +
                        number(last.value - first.value) +
                        " " +
                        representative.unit +
                        " en el período"
                      : "Primer registro"}{" "}
                    · Ver evolución →
                  </small>
                </button>
              );
            })}
          </div>
        </section>
      )}
      {exportData && (
        <DocumentPreview
          title={"Progreso · " + studentName}
          onClose={() => setExportData(null)}
          actions={
            <button
              className="button secondary"
              onClick={() => {
                const records = [
                  [
                    "Alumno",
                    "Período",
                    "Grupo muscular",
                    "Ejercicio",
                    "Fecha",
                    "Valor",
                    "Unidad",
                    "Repeticiones",
                    "Series confirmadas",
                    "Volumen kg × reps",
                    "Origen",
                  ],
                  ...exportData.exercises.flatMap((exercise) =>
                    exercise.points.map((point) => [
                      studentName,
                      exportData.period,
                      exercise.group,
                      exercise.name,
                      point.date,
                      String(point.value),
                      exercise.unit,
                      point.reps === null ? "" : String(point.reps),
                      String(point.sets),
                      point.volume === null ? "" : String(point.volume),
                      point.source === "observed"
                        ? "Individual"
                        : "Confirmación rápida",
                    ]),
                  ),
                ];
                const url = URL.createObjectURL(
                  new Blob(
                    [
                      "\uFEFF" +
                        records
                          .map((record) => record.map(csvCell).join(";"))
                          .join("\r\n"),
                    ],
                    { type: "text/csv;charset=utf-8" },
                  ),
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
          <h1>Progreso de {studentName}</h1>
          <p>
            {exportData.period} · {exportData.count} sesiones finalizadas ·{" "}
            {exportData.exercises.length} ejercicios
          </p>
          <p className="document-context">
            Cada punto muestra la mayor carga, cantidad de repeticiones o
            duración confirmada del ejercicio en esa sesión. Excluye
            calentamiento y ejercicios omitidos. Las repeticiones y las
            condiciones pueden variar; los valores no miden fuerza absoluta.
          </p>
          {exportData.exercises.map((exercise) => (
            <section key={exercise.key} className="document-exercise">
              <p className="eyebrow">{exercise.group}</p>
              <h2>{exercise.name}</h2>
              <Trend exercise={exercise} />
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Valor ({exercise.unit})</th>
                    <th>Reps</th>
                    <th>Series</th>
                    <th>Origen</th>
                  </tr>
                </thead>
                <tbody>
                  {exercise.points.map((point) => (
                    <tr key={point.sessionId}>
                      <td>{date(point.date)}</td>
                      <td>{number(point.value)}</td>
                      <td>{point.reps ?? "—"}</td>
                      <td>{point.sets}</td>
                      <td>
                        {point.source === "observed"
                          ? "Individual"
                          : "Confirmación rápida"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </DocumentPreview>
      )}
    </section>
  );
}
