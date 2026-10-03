import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { cloud, updateVerifiedPassword } from "../../adapters/supabase";
import { useAuth } from "./AuthProvider";
export function AuthCallback() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [invalidLink, setInvalidLink] = useState(false);
  const [verifiedUser, setVerifiedUser] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(true);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      try {
        const params = new URLSearchParams(location.search),
          hash = new URLSearchParams(location.hash.slice(1));
        const token = params.get("token_hash"),
          type = params.get("type");
        let verified;
        if (token && (type === "invite" || type === "recovery"))
          verified = await cloud().auth.verifyOtp({ token_hash: token, type });
        else if (params.has("code"))
          verified = await cloud().auth.exchangeCodeForSession(
            params.get("code")!,
          );
        else if (
          ["invite", "recovery"].includes(hash.get("type") ?? "") &&
          hash.has("access_token") &&
          hash.has("refresh_token")
        )
          verified = await cloud().auth.setSession({
            access_token: hash.get("access_token")!,
            refresh_token: hash.get("refresh_token")!,
          });
        else throw Error("Missing valid link");
        if (verified.error || !verified.data.session?.user.id)
          throw Error("Invalid link");
        setVerifiedUser(verified.data.session.user.id);
      } catch {
        setInvalidLink(true);
        setError("El enlace ya fue utilizado o venció. Solicitá uno nuevo.");
      } finally {
        history.replaceState(null, "", "/auth/callback");
        setVerifying(false);
      }
    })();
  }, []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const current = await cloud().auth.getSession();
      if (
        verifying ||
        invalidLink ||
        !verifiedUser ||
        current.data.session?.user.id !== verifiedUser
      )
        throw Error("Identity changed");
      await updateVerifiedPassword(current.data.session, password);
      if (
        (await cloud().auth.getSession()).data.session?.user.id !== verifiedUser
      )
        throw Error("Identity changed");
      auth.finishRecovery();
      navigate("/hoy", { replace: true });
    } catch {
      setError(
        "No se pudo cambiar la contraseña. Usá al menos 12 caracteres o solicitá un enlace nuevo.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-panel">
      <div>
        <h1>Elegí tu contraseña</h1>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {!verifying &&
        verifiedUser &&
        auth.session?.user.id === verifiedUser &&
        !invalidLink ? (
          <form className="stack" onSubmit={submit}>
            <label className="field">
              Nueva contraseña
              <input
                type="password"
                minLength={12}
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button className="button" disabled={busy}>
              Guardar contraseña
            </button>
          </form>
        ) : (
          <p>
            {verifying
              ? "Verificando el enlace…"
              : "Si el enlace no se pudo validar, volvé al ingreso y pedí uno nuevo."}
          </p>
        )}
        <a href="/login">Volver al ingreso</a>
      </div>
    </div>
  );
}
