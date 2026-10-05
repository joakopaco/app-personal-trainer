import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { Building2, LogOut, ShieldCheck } from "lucide-react";
import { cloud } from "../../adapters/supabase";
import { Brand } from "../../components/Brand";
import { DialogFocus } from "../../components/DialogFocus";
import { Captcha, captchaRequired, captchaSiteKey } from "../auth/Captcha";
import { PlatformAdmin } from "../gym/PlatformAdmin";
import "./platform.css";

type Access = { username: string; mustChangePassword: boolean; ready: boolean };
async function signIn(
  username: string,
  password: string,
  captchaToken: string,
) {
  const response = await fetch(
    import.meta.env.VITE_SUPABASE_URL + "/functions/v1/platform-login",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ username, password, captchaToken }),
    },
  );
  const result = await response.json();
  if (!response.ok) throw Error(result.error || "No se pudo iniciar sesión.");
  const signed = await cloud().auth.setSession(result);
  if (signed.error)
    throw Error("No se pudo abrir la sesión. Volvé a ingresar.");
}

// Session identity is used only to preserve UI; authority is checked by the RPC.
function sessionIdentity(session: Session | null) {
  if (!session) return "";
  try {
    const payload = JSON.parse(
      atob(
        session.access_token
          .split(".")[1]
          .replace(/-/g, "+")
          .replace(/_/g, "/"),
      ),
    );
    return session.user.id + ":" + payload.session_id;
  } catch {
    return session.access_token;
  }
}
export function PlatformApp() {
  const currentIdentity = useRef("");
  const [session, setSession] = useState<Session | null>(null);
  const [access, setAccess] = useState<Access | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [exiting, setExiting] = useState(false);
  useEffect(() => {
    document.title = "Pulso · Administración privada";
    let alive = true;
    const subscription = cloud().auth.onAuthStateChange((event, next) => {
      if (alive) {
        const identity = sessionIdentity(next);
        if (identity !== currentIdentity.current) {
          currentIdentity.current = identity;
          setAccess(null);
          setLoading(!!next);
        }
        if (event === "USER_UPDATED" || event === "TOKEN_REFRESHED") {
          setSession(next);
          return;
        }
        setSession(next);
        setAttempt((n) => n + 1);
      }
    });
    void cloud()
      .auth.getSession()
      .then(({ data, error }) => {
        if (!alive) return;
        currentIdentity.current = sessionIdentity(data.session);
        setSession(data.session);
        if (error)
          setError("No se pudo recuperar tu sesión. Volvé a ingresar.");
        if (!data.session) setLoading(false);
      });
    return () => {
      alive = false;
      subscription.data.subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    let alive = true;
    if (!session) {
      setAccess(null);
      setLoading(false);
      return;
    }
    const read = async () => {
      const result = await cloud().rpc("platform_access");
      if (!alive) return;
      if (result.error || !result.data) {
        setAccess(null);
        setError(
          "El acceso no está disponible. Volvé a ingresar con tu cuenta administrativa.",
        );
      } else {
        setAccess(result.data);
        setError("");
      }
      setLoading(false);
    };
    void read();
    const timer = setInterval(() => void read(), 60000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [session?.user.id, attempt]);
  async function logout() {
    setExiting(true);
    const result = await cloud().auth.signOut({ scope: "local" });
    const current = await cloud().auth.getSession();
    if (result.error && current.data.session)
      setError("No se pudo cerrar la sesión. Intentá nuevamente.");
    else {
      setSession(null);
      setAccess(null);
      setError("");
    }
    setExiting(false);
  }
  if (loading)
    return (
      <main>
        <p role="status">Verificando acceso…</p>
      </main>
    );
  if (!session) return <OperatorLogin />;
  if (!access?.ready)
    return (
      <div className="platform-auth">
        <div className="platform-auth-card card stack">
          <Brand />
          <p className="eyebrow">ADMINISTRACIÓN PRIVADA</p>
          {access?.mustChangePassword ? (
            <OperatorPassword
              username={access.username}
              done={() => setAttempt((n) => n + 1)}
            />
          ) : (
            <>
              <h1>Acceso no disponible</h1>
              <p className="error" role="alert">
                {error || "Volvé a ingresar para verificar tu acceso."}
              </p>
              <button
                className="button"
                onClick={() => setAttempt((n) => n + 1)}
              >
                Reintentar
              </button>
            </>
          )}
          <button
            className="button secondary"
            disabled={exiting}
            onClick={logout}
          >
            <LogOut size={18} />
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  return (
    <div className="platform-shell">
      <DialogFocus />
      <aside className="platform-sidebar">
        <Brand />
        <p className="eyebrow">ADMINISTRACIÓN PRIVADA</p>
        <nav aria-label="Administración">
          <a href="/administracion" aria-current="page">
            <Building2 size={20} />
            Gimnasios
          </a>
        </nav>
        <div className="platform-account">
          <span>{access.username}</span>
          <button
            className="button secondary"
            disabled={exiting}
            onClick={logout}
          >
            <LogOut size={18} />
            {exiting ? "Cerrando…" : "Cerrar sesión"}
          </button>
        </div>
      </aside>
      <main>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <PlatformAdmin operatorId={session.user.id} />
      </main>
    </div>
  );
}

function OperatorLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [captcha, setCaptcha] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await signIn(username.trim(), password, captcha);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setCaptcha("");
      setAttempt((n) => n + 1);
    }
  }
  return (
    <div className="platform-auth">
      <section className="platform-auth-card card stack">
        <Brand />
        <p className="eyebrow">ADMINISTRACIÓN PRIVADA</p>
        <h1>Administración de Pulso</h1>
        <p className="muted">Ingresá para gestionar los gimnasios.</p>
        <form className="stack" onSubmit={submit}>
          <label className="field">
            Usuario
            <input
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              maxLength={48}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="field">
            Contraseña
            <input
              type="password"
              autoComplete="current-password"
              required
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
          </label>
          <Captcha key={attempt} onToken={setCaptcha} responsive />
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button
            className="button"
            disabled={
              busy || (!!(captchaRequired || captchaSiteKey) && !captcha)
            }
          >
            {busy ? "Ingresando…" : "Ingresar"}
          </button>
        </form>
        <p className="platform-private-note">
          <ShieldCheck size={18} />
          Acceso exclusivo de administración.
        </p>
      </section>
    </div>
  );
}

function OperatorPassword({
  username,
  done,
}: {
  username: string;
  done: () => void;
}) {
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [captcha, setCaptcha] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (
      password !== repeat ||
      password === current ||
      !/^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{12,128}$/.test(password)
    ) {
      setError(
        "Elegí una contraseña nueva de 12 a 128 caracteres, con mayúscula, minúscula y número. Ambas copias deben coincidir.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      const update = await cloud().auth.updateUser({
        password,
        current_password: current,
      });
      // Reauthenticate even after a lost response: the password may have changed.
      try {
        await signIn(username, password, captcha);
      } catch {
        throw (
          update.error ??
          Error(
            "No se pudo verificar el cambio. Volvé a ingresar con la nueva contraseña.",
          )
        );
      }
      done();
    } catch {
      setError(
        "No se pudo completar el cambio. Revisá la contraseña actual y la conexión. Si el cambio ya se guardó, cerrá sesión e ingresá con la nueva contraseña.",
      );
    } finally {
      setBusy(false);
      setCaptcha("");
      setAttempt((n) => n + 1);
    }
  }
  return (
    <>
      <h1>Elegí tu contraseña</h1>
      <p>
        Antes de administrar gimnasios, reemplazá la contraseña inicial por una
        que solo conozcas vos.
      </p>
      <form className="stack" onSubmit={submit}>
        <label className="field">
          Contraseña actual
          <input
            type="password"
            autoComplete="current-password"
            required
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            disabled={busy}
          />
        </label>
        <label className="field">
          Nueva contraseña
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
          />
        </label>
        <label className="field">
          Repetí la nueva contraseña
          <input
            type="password"
            autoComplete="new-password"
            required
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            disabled={busy}
          />
        </label>
        <small className="muted">
          12 caracteres o más, con mayúscula, minúscula y número.
        </small>
        <Captcha key={attempt} onToken={setCaptcha} responsive />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button
          className="button"
          disabled={busy || (!!(captchaRequired || captchaSiteKey) && !captcha)}
        >
          {busy ? "Guardando…" : "Guardar contraseña"}
        </button>
      </form>
    </>
  );
}
