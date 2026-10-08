import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, Timer } from "lucide-react";
import { useData } from "../../app/DataProvider";

type ClockState = {
  end: number | null;
  paused: number | null;
  started: boolean;
};
const initial: ClockState = { end: null, paused: 60, started: false };
const secondsLeft = (state: ClockState, now: number) =>
  state.paused ?? Math.max(0, Math.ceil(((state.end ?? now) - now) / 1000));

export function RestTimer({ session }: { session: { id: string } }) {
  const { db } = useData();
  return <RestClock session={session} storage={db.meta} />;
}

// The same clock serves both modalities; only persistence changes.
export function RestClock({
  session,
  storage,
}: {
  session: { id: string };
  storage: {
    get: (key: string) => PromiseLike<{ value: unknown } | undefined>;
    put: (entry: { key: string; value: unknown }) => PromiseLike<unknown>;
  };
}) {
  const [state, setState] = useState(initial);
  const latest = useRef(initial);
  const writes = useRef(Promise.resolve());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    let active = true;
    void Promise.resolve(storage.get("timer:" + session.id))
      .then((r) => {
        if (!active) return;
        const saved = r?.value as Partial<ClockState> | undefined;
        if (
          saved &&
          (saved.end === null || typeof saved.end === "number") &&
          (saved.paused === null || typeof saved.paused === "number")
        ) {
          const restored = {
            end: saved.end,
            paused: saved.paused,
            started:
              saved.started ?? (saved.end !== null || saved.paused !== null),
          } as ClockState;
          latest.current = restored;
          setState(restored);
        }
      })
      .catch(() => {
        if (active) setError("No se pudo recuperar el descanso anterior.");
      })
      .finally(() => {
        if (active) setReady(true);
      });
    const tick = () => setNow(Date.now());
    const interval = setInterval(tick, 250);
    document.addEventListener("visibilitychange", tick);
    return () => {
      active = false;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [session.id, storage]);
  function save(next: ClockState) {
    latest.current = next;
    writes.current = writes.current.then(async () => {
      try {
        await storage.put({ key: "timer:" + session.id, value: next });
        setError("");
      } catch {
        setError(
          "El descanso funciona, pero no se pudo guardar en este dispositivo.",
        );
      }
      // A displayed adjustment has already completed its persistence attempt.
      // This also avoids losing the last tap when the page reloads immediately.
      setState(next);
      setNow(Date.now());
    });
  }
  const remaining = secondsLeft(state, now);
  const running = state.end !== null && remaining > 0;
  const status = !ready
    ? "Cargando…"
    : running
      ? "En marcha"
      : remaining === 0
        ? "Descanso terminado"
        : state.started
          ? "En pausa"
          : "Listo para empezar";
  const action = running
    ? "Pausar descanso"
    : remaining > 0 && state.started
      ? "Continuar descanso"
      : "Iniciar descanso";
  return (
    <section
      className={"rest-clock" + (running ? " is-running" : "")}
      aria-label="Temporizador de descanso"
    >
      <div className="rest-clock-title">
        <Timer size={20} aria-hidden="true" />
        <h2>Descanso</h2>
      </div>
      <div className="rest-clock-face">
        <div>
          <div
            className="rest-clock-digits"
            role="timer"
            aria-label="Tiempo restante"
            aria-live="off"
          >
            {Math.floor(remaining / 60)}:
            {String(remaining % 60).padStart(2, "0")}
          </div>
          <span className="rest-clock-status" role="status">
            {status}
          </span>
        </div>
        <button
          className="rest-clock-play"
          aria-label={action}
          disabled={!ready}
          onClick={() => {
            const current = latest.current,
              left = secondsLeft(current, Date.now());
            save(
              current.end !== null && left > 0
                ? { end: null, paused: left, started: true }
                : {
                    end: Date.now() + (left || 60) * 1000,
                    paused: null,
                    started: true,
                  },
            );
          }}
        >
          {running ? (
            <Pause size={32} fill="currentColor" aria-hidden="true" />
          ) : (
            <Play size={32} fill="currentColor" aria-hidden="true" />
          )}
          <span>
            {running
              ? "Pausar"
              : state.started && remaining > 0
                ? "Seguir"
                : "Iniciar"}
          </span>
        </button>
      </div>
      <div className="rest-clock-actions">
        <button
          className="button secondary"
          aria-label="Reiniciar descanso"
          disabled={!ready}
          onClick={() => save(initial)}
        >
          <RotateCcw size={18} aria-hidden="true" />
          <span className="rest-reset-label">Reiniciar</span>
        </button>
        <button
          className="button secondary"
          aria-label="Agregar 15 segundos"
          disabled={!ready}
          onClick={() => {
            const current = latest.current,
              left = secondsLeft(current, Date.now());
            save(
              current.end !== null && left > 0
                ? { ...current, end: current.end + 15000 }
                : { ...current, end: null, paused: left + 15 },
            );
          }}
        >
          +15 s
        </button>
      </div>
      {error && <small role="alert">{error}</small>}
    </section>
  );
}
