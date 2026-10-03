import { useEffect, useState } from "react";
import { useData } from "../app/DataProvider";
export function UpdateAvailable() {
  const { db } = useData();
  const [worker, setWorker] = useState<ServiceWorker | null>(null),
    [message, setMessage] = useState("");
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
      {message || "Hay una nueva versión disponible."}
      {worker && (
        <button
          className="link-button"
          onClick={async () => {
            const drafts = (await db.meta.toArray()).some(
              (m) =>
                m.key.startsWith("draft:") ||
                m.key.startsWith("admin:") ||
                m.key === "library-pending",
            );
            if ((await db.hasPending()) || drafts) {
              setMessage(
                "Guardá y sincronizá los pendientes antes de actualizar.",
              );
              return;
            }
            navigator.serviceWorker.addEventListener(
              "controllerchange",
              () => location.reload(),
              { once: true },
            );
            worker.postMessage("ACTIVATE_REVIEWED_UPDATE");
          }}
        >
          Actualizar ahora
        </button>
      )}
    </div>
  );
}
