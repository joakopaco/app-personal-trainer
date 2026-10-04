import { useLayoutEffect } from "react";
import type { LocalStore } from "@pulso/sync/local-db";
export function useSessionPosition(
  db: LocalStore,
  sessionId: string | undefined,
) {
  // Capture the outgoing scroll position before React removes the long session
  // DOM. A passive cleanup sees the position clamped by the next, shorter page.
  useLayoutEffect(() => {
    if (!sessionId) return;
    let active = true,
      restored = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const key = "scroll:" + sessionId;
    const save = () => {
      if (!restored) return;
      if (timer) clearTimeout(timer);
      const y = window.scrollY;
      timer = setTimeout(() => {
        void db.meta.put({ key, value: y }).catch(() => {});
      }, 250);
    };
    void db.meta.get(key).then((row) => {
      requestAnimationFrame(() => {
        if (!active) return;
        window.scrollTo({
          top: typeof row?.value === "number" ? row.value : 0,
          behavior: "instant",
        });
        restored = true;
      });
    });
    window.addEventListener("scroll", save, { passive: true });
    return () => {
      active = false;
      window.removeEventListener("scroll", save);
      if (timer) clearTimeout(timer);
      if (restored)
        void db.meta.put({ key, value: window.scrollY }).catch(() => {});
    };
  }, [db, sessionId]);
}
