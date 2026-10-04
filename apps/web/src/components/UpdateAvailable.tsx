import { useEffect, useState } from "react";
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
          m.key.startsWith("admin:") ||
          m.key === "library-pending",
      ),
  );
}
export function UpdateAvailable() {
  const { db } = useData();
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
            const reload = () => location.reload();
            try {
              if (await pendingUpdateWork(db)) {
                setPending(true);
                setBlocked(true);
                return;
              }
              setMessage("");
              setUpdating(true);
              navigator.serviceWorker.addEventListener(
                "controllerchange",
                reload,
                { once: true },
              );
              worker.postMessage("ACTIVATE_REVIEWED_UPDATE");
            } catch {
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
