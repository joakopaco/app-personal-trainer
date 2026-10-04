import { useEffect, useRef, useState } from "react";
import { useData } from "../app/DataProvider";
import { liveQuery } from "dexie";
import type { LocalStore } from "@pulso/sync/local-db";

function pendingUpdateWork(db: LocalStore) {
  return db.transaction(
    "r",
    db.outbox,
    db.rawInputs,
    db.meta,
    async () =>
      (await db.hasPending()) ||
      (await db.meta.toArray()).some(
        (m) =>
          m.key.startsWith("draft:") ||
          m.key.startsWith("template-draft:") ||
          m.key.startsWith("admin:") ||
          m.key === "library-pending",
      ),
  );
}
export function UpdateAvailable() {
  const { db } = useData();
  const stopUpdate = useRef<() => void>(() => undefined);
  useEffect(() => () => stopUpdate.current(), []);
  const [worker, setWorker] = useState<ServiceWorker | null>(null),
    [message, setMessage] = useState(""),
    [blocked, setBlocked] = useState(false),
    [pending, setPending] = useState(true),
    [updating, setUpdating] = useState(false);
  useEffect(() => {
    const sub = liveQuery(() => pendingUpdateWork(db)).subscribe({
      next: setPending,
      error: () => setPending(true),
    });
    return () => sub.unsubscribe();
  }, [db]);
  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    let active = true;
    void navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        if (active && reg.waiting) setWorker(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const installing = reg.installing;
          installing?.addEventListener("statechange", () => {
            if (
              active &&
              installing.state === "installed" &&
              navigator.serviceWorker.controller
            )
              setWorker(installing);
          });
        });
      })
      .catch(() => {
        if (active) setMessage("No se pudo preparar el inicio sin conexión.");
      });
    return () => {
      active = false;
    };
  }, []);
  if (!worker && !message) return null;
  return (
    <div className="notice no-print">
      <span aria-live="polite">
        {updating
          ? "Actualizando la aplicación…"
          : message ||
            (blocked && pending
              ? "Guardá y sincronizá los pendientes antes de actualizar."
              : "Hay una nueva versión disponible.")}
      </span>
      {worker && (
        <button
          className="link-button"
          disabled={updating}
          onClick={async () => {
            const reload = () => {
              stopUpdate.current();
              location.reload();
            };
            try {
              // A different tab or a later installation can replace the worker
              // while the trainer is reviewing pending work. Resolve it now.
              const registration =
                await navigator.serviceWorker.getRegistration();
              if (await pendingUpdateWork(db)) {
                setPending(true);
                setBlocked(true);
                return;
              }
              const waiting = registration?.waiting;
              if (!waiting) {
                if (registration?.active?.state === "activated") {
                  reload();
                  return;
                }
                throw Error("Update not ready");
              }
              setMessage("");
              setUpdating(true);
              navigator.serviceWorker.addEventListener(
                "controllerchange",
                reload,
                { once: true },
              );
              const timer = window.setTimeout(() => {
                stopUpdate.current();
                setUpdating(false);
                setMessage(
                  "La actualización no respondió. Tus cambios se conservan. Volvé a intentar.",
                );
              }, 10000);
              stopUpdate.current = () => {
                window.clearTimeout(timer);
                navigator.serviceWorker.removeEventListener(
                  "controllerchange",
                  reload,
                );
              };
              waiting.postMessage("ACTIVATE_REVIEWED_UPDATE");
            } catch {
              stopUpdate.current();
              navigator.serviceWorker.removeEventListener(
                "controllerchange",
                reload,
              );
              setUpdating(false);
              setMessage(
                "No se pudo verificar el guardado. Reintentá la actualización.",
              );
            }
          }}
        >
          Actualizar ahora
        </button>
      )}
    </div>
  );
}
