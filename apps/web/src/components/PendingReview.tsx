import { useEffect, useState } from "react";
import { liveQuery } from "dexie";
import { Link, useLocation } from "react-router-dom";
import { useData } from "../app/DataProvider";

// Keep recovery reachable outside Settings, including interrupted library writes.
export function PendingReview() {
  const { db, pending, error } = useData();
  const { pathname } = useLocation();
  const [localReview, setLocalReview] = useState(false);
  useEffect(() => {
    const subscription = liveQuery(async () => {
      const meta = await db.meta.toArray();
      return (
        meta.some(
          (m) =>
            m.key === "library-pending" ||
            m.key.startsWith("admin:") ||
            m.key.startsWith("draft:") ||
            m.key.startsWith("template-draft:"),
        ) || (await db.rawInputs.count()) > 0
      );
    }).subscribe(setLocalReview);
    return () => subscription.unsubscribe();
  }, [db]);
  if (
    pathname === "/sincronizacion" ||
    (!localReview && !error && !pending.length)
  )
    return null;
  return (
    <p className="notice">
      Tenés cambios pendientes de confirmar.{" "}
      <Link to="/sincronizacion">Revisar cambios pendientes</Link>
    </p>
  );
}
