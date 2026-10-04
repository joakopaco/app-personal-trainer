import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Brand } from "../../components/Brand";
import { cloud, updateVerifiedPassword } from "../../adapters/supabase";
import { useAuth } from "./AuthProvider";
import {
  passwordHint,
  passwordPattern,
  validPassword,
} from "../../adapters/password";
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
  const signupToken = useRef(
    (() => {
      const params = new URLSearchParams(location.search);
      return ["signup", "email"].includes(params.get("type") ?? "")
        ? params.get("token_hash")
        : null;
    })(),
  );
  const [confirmingSignup, setConfirmingSignup] = useState(
    Boolean(signupToken.current),
  );
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (signupToken.current) {
      // A GET from an email scanner must not consume a single-use link.
      history.replaceState(null, "", "/auth/callback");
      setVerifying(false);
      return;
    }
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
  async function confirmSignup() {
    if (busy || !signupToken.current) return;
    setBusy(true);
    setError("");
    try {
      const result = await cloud().auth.verifyOtp({
        token_hash: signupToken.current,
        type: "signup",
      });
      if (result.error || !result.data.session?.user.email_confirmed_at)
        throw Error("Invalid confirmation");
      signupToken.current = null;
      auth.finishRecovery();
      navigate("/hoy", { replace: true });
    } catch {
      setInvalidLink(true);
      setConfirmingSignup(false);
      setError("El enlace ya fue utilizado o venció. Solicitá uno nuevo.");
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!validPassword(password)) {
      setError(passwordHint);
      return;
    }
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
        "No se pudo cambiar la contraseña. " +
          passwordHint +
          " Si el enlace venció, solicitá uno nuevo.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-panel auth-callback">
      <div>
        <div className="auth-callback-brand">
          <Brand />
        </div>
        <h1>
          {confirmingSignup ? "Confirmá tu email" : "Elegí tu contraseña"}
        </h1>
        {confirmingSignup && (
          <div className="stack">
            <p>
              Confirmá tu correo para activar tu cuenta de entrenador y abrir tu
              espacio privado.
            </p>
            <button className="button" disabled={busy} onClick={confirmSignup}>
              {busy ? "Verificando…" : "Confirmar mi email"}
            </button>
          </div>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {!confirmingSignup &&
          (!verifying &&
          verifiedUser &&
          auth.session?.user.id === verifiedUser &&
          !invalidLink ? (
            <form className="stack" onSubmit={submit}>
              <label className="field">
                Nueva contraseña
                <input
                  type="password"
                  minLength={8}
                  pattern={passwordPattern}
                  aria-describedby="new-password-hint"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <small id="new-password-hint">{passwordHint}</small>
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
          ))}
        <a className="button secondary" href="/login">
          Volver al ingreso
        </a>
      </div>
    </div>
  );
}
