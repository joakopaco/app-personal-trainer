import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import type { LocalStore } from "@pulso/sync/local-db";
import { useData } from "../app/DataProvider";

export async function canReloadApp(db: LocalStore, pathname: string) {
  if (pathname !== "/hoy" || document.visibilityState !== "visible")
    return false;
  if (
    document.querySelector('[role="dialog"]') ||
    document.activeElement?.matches(
      'input,textarea,select,[contenteditable="true"]',
    )
  )
    return false;
  return db.transaction(
    "r",
    db.students,
    db.outbox,
    db.rawInputs,
    db.meta,
    async () => {
      if (await db.hasPending()) return false;
      if (
        (await db.students.toArray()).some(
          (row) => row.projection.sessions.length > 0,
        )
      )
        return false;
      return !(await db.meta.toArray()).some(
        (entry) =>
          entry.key.startsWith("admin:") || entry.key === "library-pending",
      );
    },
  );
}

// Updates are infrastructure, not a task for the trainer. Activate the new
// shell in the background and only reload an idle home screen. IndexedDB and
// older cached assets remain intact for drafts and other open tabs.
export function AppUpdates() {
  const { db } = useData();
  const { pathname } = useLocation();
  const route = useRef(pathname);
  route.current = pathname;
  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    let active = true,
      changed = false,
      checking = false,
      reloading = false;
    let registration: ServiceWorkerRegistration | undefined;
    const hadController = Boolean(navigator.serviceWorker.controller);
    async function reloadWhenIdle() {
      if (!active || !changed || checking || reloading) return;
      checking = true;
      try {
        if (
          (await canReloadApp(db, route.current)) &&
          active &&
          route.current === "/hoy"
        ) {
          reloading = true;
          location.reload();
        }
      } catch {
        /* Keep the current page if storage cannot be verified. */
      } finally {
        checking = false;
      }
    }
    const activate = () =>
      registration?.waiting?.postMessage("ACTIVATE_REVIEWED_UPDATE");
    const installed = () => {
      const installing = registration?.installing;
      installing?.addEventListener("statechange", () => {
        if (active && installing.state === "installed") activate();
      });
    };
    const controllerChanged = () => {
      if (!hadController) return;
      changed = true;
      void reloadWhenIdle();
    };
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      controllerChanged,
    );
    void navigator.serviceWorker
      .register("/sw.js")
      .then((value) => {
        if (!active) return;
        registration = value;
        registration.addEventListener("updatefound", installed);
        installed();
        activate();
      })
      .catch(() => {
        /* No global technical notice or blocked update button. */
      });
    const timer = window.setInterval(() => void reloadWhenIdle(), 3000);
    window.addEventListener("focus", reloadWhenIdle);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", reloadWhenIdle);
      registration?.removeEventListener("updatefound", installed);
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        controllerChanged,
      );
    };
  }, [db]);
  return null;
}
