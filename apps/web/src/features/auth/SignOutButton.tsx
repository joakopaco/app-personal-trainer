import { useState } from "react";
import { LogOut } from "lucide-react";
import { useData } from "../../app/DataProvider";
import { cloud } from "../../adapters/supabase";

export function SignOutButton({ className = "" }: { className?: string }) {
  const data = useData();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function signOut() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      // Local drafts and queued edits belong to this user/workspace. Keep them
      // for the next login instead of blocking logout or deleting an open DB.
      const result = await cloud().auth.signOut({ scope: "local" });
      if (result.error) {
        const remaining = await cloud().auth.getSession();
        if (remaining.error || remaining.data.session) throw result.error;
      }
      data.suspend();
      localStorage.removeItem("pulso-access:" + data.db.scope.userId);
      location.assign("/login");
    } catch {
      setError(
        "No se pudo cerrar la sesión. Revisá la conexión y volvé a intentar.",
      );
      setBusy(false);
    }
  }

  return (
    <div className={`signout-control ${className}`}>
      {error && <p role="alert">{error}</p>}
      <button className="button secondary" disabled={busy} onClick={signOut}>
        <LogOut size={20} aria-hidden="true" />
        {busy ? "Cerrando sesión…" : "Cerrar sesión"}
      </button>
    </div>
  );
}
