import { useState, type FormEvent } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { cloud, supabase } from "../../adapters/supabase";
import { Captcha, captchaRequired, captchaSiteKey } from "./Captcha";
import { Brand } from "../../components/Brand";
import {
  passwordHint,
  passwordPattern,
  validPassword,
} from "../../adapters/password";
type Mode = "login" | "signup" | "recovery" | "resend";
// Controls available email actions, never authorization. Supabase owns signup policy.
const emailEnabled = import.meta.env.VITE_AUTH_EMAIL_ENABLED !== "false";
export function Login() {
  const [role, setRole] = useState("trainer");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [mode, setMode] = useState<Mode>("login");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [captcha, setCaptcha] = useState("");
  const [captchaAttempt, setCaptchaAttempt] = useState(0);
  function changeMode(next: Mode) {
    setMode(next);
    setError("");
    setMessage("");
    setPassword("");
    setRepeat("");
    setCaptcha("");
    setCaptchaAttempt((x) => x + 1);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (
      busy ||
      (role !== "trainer" && mode !== "login") ||
      (!emailEnabled && (mode === "recovery" || mode === "resend")) ||
      ((captchaRequired || captchaSiteKey) && !captcha)
    )
      return;
    if (mode === "signup" && !validPassword(password)) {
      setError(passwordHint);
      return;
    }
    if (mode === "signup" && password !== repeat) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    const normalizedEmail = email.trim().toLowerCase();
    const captchaToken = captcha || undefined;
    try {
      if (mode === "signup") {
        const { error, data } = await cloud().auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            emailRedirectTo: location.origin + "/auth/callback",
            captchaToken,
          },
        });
        if (error && error.code !== "user_already_exists") throw error;
        setPassword("");
        setRepeat("");
        setMessage(
          data.session
            ? "Cuenta creada. Abriendo tu espacio…"
            : emailEnabled
              ? "Revisá tu correo. Si el email puede registrarse, recibirás un enlace para confirmar tu cuenta. Si ya tenés una cuenta, ingresá o recuperá tu contraseña."
              : "No se pudo abrir una cuenta nueva. Intentá ingresar con tus datos; si el problema continúa, contactá al administrador del piloto.",
        );
      } else if (mode === "recovery") {
        const { error } = await cloud().auth.resetPasswordForEmail(
          normalizedEmail,
          {
            redirectTo: location.origin + "/auth/callback",
            captchaToken,
          },
        );
        if (error) throw error;
        setMessage(
          "Si el email tiene una cuenta, recibirás un enlace para recuperar el acceso.",
        );
      } else if (mode === "resend") {
        const { error } = await cloud().auth.resend({
          type: "signup",
          email: normalizedEmail,
          options: {
            emailRedirectTo: location.origin + "/auth/callback",
            captchaToken,
          },
        });
        if (error) throw error;
        setMessage(
          "Si tu cuenta está pendiente de confirmación, recibirás un nuevo enlace. Revisá también el correo no deseado.",
        );
      } else {
        const { error } = await cloud().auth.signInWithPassword({
          email: normalizedEmail,
          password,
          options: { captchaToken },
        });
        if (error) throw error;
      }
    } catch {
      setError(
        mode === "login"
          ? emailEnabled
            ? "No pudimos ingresar. Revisá tus datos, la confirmación del email y tu conexión."
            : "No pudimos ingresar. Revisá tu email, contraseña y conexión."
          : "No pudimos completar la solicitud. Revisá los datos y tu conexión; si ya lo intentaste, esperá un minuto.",
      );
    } finally {
      setBusy(false);
      setCaptcha("");
      setCaptchaAttempt((x) => x + 1);
    }
  }
  return (
    <div className="auth-page">
      <section className="auth-story">
        <Brand />
        <div>
          <p className="eyebrow">EL ENTRENAMIENTO, EN TUS MANOS</p>
          <h2>
            {role === "trainer"
              ? "Más presente."
              : role === "gym"
                ? "Tu gimnasio."
                : "Tu entrenamiento."}
            <br />
            {role === "trainer"
              ? "En cada repetición."
              : role === "gym"
                ? "En movimiento."
                : "Tu progreso."}
          </h2>
          <p>
            {role === "trainer"
              ? "Un espacio para preparar rutinas, acompañar a tus alumnos y ver cómo progresan."
              : role === "gym"
                ? "Organizá las rutinas de tu gimnasio y acompañá el progreso de cada persona."
                : "Tus rutinas, tus series y tu evolución. Todo listo para entrenar."}
          </p>
        </div>
        <p>Hecho para el ritmo de tu jornada.</p>
      </section>
      <section className="auth-panel">
        <div>
          <div className="auth-mobile-brand">
            <Brand />
          </div>
          <label className="field account-picker">
            Tipo de cuenta
            <select
              value={role}
              disabled={busy}
              onChange={(e) => {
                setRole(e.target.value);
                changeMode("login");
              }}
            >
              <option value="trainer">Entrenador</option>
              <option value="gym">Gimnasio</option>
              <option value="member">Entrenado</option>
            </select>
          </label>
          <>
            <p className="eyebrow">TU ESPACIO PRIVADO</p>
            <h1>
              {mode === "login"
                ? "Tu jornada empieza acá"
                : mode === "signup"
                  ? "Creá tu cuenta"
                  : mode === "resend"
                    ? "Confirmá tu email"
                    : "Recuperá tu acceso"}
            </h1>
            <p className="muted">
              {mode === "signup"
                ? emailEnabled
                  ? "Un espacio propio para vos y tus alumnos. Confirmá tu correo para empezar."
                  : "Un espacio propio para vos y tus alumnos. Creá tu cuenta y empezá a entrenar."
                : mode === "login"
                  ? role === "trainer"
                    ? "Ingresá con tu cuenta de entrenador."
                    : role === "gym"
                      ? "Ingresá con la cuenta que te entregó Pulso."
                      : "Ingresá con la cuenta que te entregó tu gimnasio."
                  : mode === "resend"
                    ? "Te enviamos un nuevo enlace de confirmación."
                    : "Te enviamos un enlace para elegir una contraseña nueva."}
            </p>
            {!supabase && (
              <p className="notice">
                El acceso está en preparación. Intentá más tarde.
              </p>
            )}
            <form className="stack" onSubmit={submit}>
              <label className="field">
                Email
                <input
                  type="email"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  value={email}
                  disabled={busy}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              {(mode === "login" || mode === "signup") && (
                <label className="field">
                  Contraseña
                  <input
                    type="password"
                    aria-label="Contraseña"
                    aria-describedby={
                      mode === "signup" ? "password-hint" : undefined
                    }
                    autoComplete={
                      mode === "signup" ? "new-password" : "current-password"
                    }
                    minLength={mode === "signup" ? 8 : undefined}
                    pattern={mode === "signup" ? passwordPattern : undefined}
                    required
                    value={password}
                    disabled={busy}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  {mode === "signup" && (
                    <small id="password-hint">{passwordHint}</small>
                  )}
                </label>
              )}
              {mode === "signup" && (
                <label className="field">
                  Repetí la contraseña
                  <input
                    type="password"
                    autoComplete="new-password"
                    required
                    value={repeat}
                    disabled={busy}
                    onChange={(e) => setRepeat(e.target.value)}
                  />
                </label>
              )}
              <Captcha key={captchaAttempt} onToken={setCaptcha} />
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              {message && (
                <p className="notice" role="status">
                  {message}
                </p>
              )}
              <button
                className="button"
                disabled={
                  busy ||
                  !supabase ||
                  (!!(captchaRequired || captchaSiteKey) && !captcha)
                }
              >
                {busy
                  ? "Un momento…"
                  : mode === "login"
                    ? "Ingresar"
                    : mode === "signup"
                      ? "Crear mi cuenta"
                      : mode === "resend"
                        ? "Reenviar confirmación"
                        : "Enviar enlace"}
                <ArrowRight size={17} />
              </button>
              {role === "trainer" && (
                <div className="auth-actions">
                  {mode === "login" ? (
                    <>
                      <button
                        type="button"
                        className="button secondary"
                        disabled={busy}
                        onClick={() => changeMode("signup")}
                      >
                        Crear cuenta
                      </button>
                      {emailEnabled && (
                        <button
                          type="button"
                          className="link-button"
                          disabled={busy}
                          onClick={() => changeMode("recovery")}
                        >
                          Olvidé mi contraseña
                        </button>
                      )}
                      {emailEnabled && (
                        <button
                          type="button"
                          className="link-button"
                          disabled={busy}
                          onClick={() => changeMode("resend")}
                        >
                          No recibí la confirmación
                        </button>
                      )}
                    </>
                  ) : (
                    <button
                      type="button"
                      className="link-button"
                      disabled={busy}
                      onClick={() => changeMode("login")}
                    >
                      Volver al ingreso
                    </button>
                  )}
                </div>
              )}
            </form>
            {!emailEnabled && role === "trainer" && (
              <p className="muted">
                Durante el piloto no enviamos correos de confirmación ni de
                recuperación. Guardá tu contraseña; si perdés el acceso,
                contactá al administrador del piloto.
              </p>
            )}
            <p className="auth-note">
              <ShieldCheck size={16} aria-hidden="true" /> Una cuenta por email.
              {role === "trainer"
                ? "Cada entrenador tiene su espacio privado."
                : "Tus datos y tu progreso, en tu cuenta."}
            </p>
          </>
        </div>
      </section>
    </div>
  );
}
