import { LoadingState } from "../../components/LoadingState";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, X, Copy, Check } from "lucide-react";
import { accountAction, gymError } from "./api";
import { cloud } from "../../adapters/supabase";
import { useAuth } from "../auth/AuthProvider";
import { Captcha, captchaRequired, captchaSiteKey } from "../auth/Captcha";

export function PageHeading({
  eyebrow,
  title,
  description,
  actions,
  back,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  back?: string;
}) {
  return (
    <header className="gym-heading">
      {back && (
        <Link className="button secondary gym-back" to={back}>
          <ArrowLeft size={18} /> Volver
        </Link>
      )}
      <div className="gym-heading-row">
        <div>
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1>{title}</h1>
          {description && <p className="muted">{description}</p>}
        </div>
        {actions && <div className="gym-actions">{actions}</div>}
      </div>
    </header>
  );
}
export function LoadState({
  loading,
  error,
  retry,
}: {
  loading: boolean;
  error: string;
  retry: () => void;
}) {
  return loading ? (
    <LoadingState label="Cargando tu espacio…" />
  ) : error ? (
    <div className="card stack">
      <p role="alert" className="error">
        {error}
      </p>
      <button className="button secondary" onClick={retry}>
        Reintentar
      </button>
    </div>
  ) : null;
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="card gym-empty">
      <h2>{title}</h2>
      {children}
    </section>
  );
}
export function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  return (
    <div className="modal-backdrop">
      <section
        className="card modal stack gym-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="gym-heading-row">
          <h2>{title}</h2>
          <button
            className="button secondary icon-button"
            aria-label="Cerrar"
            onClick={close}
          >
            <X size={20} />
            <span className="gym-sr-only">Cerrar</span>
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
export function Credentials({
  password,
  email,
  close,
}: {
  password: string;
  email: string;
  close: () => void;
}) {
  const [copied, setCopied] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal title="Cuenta lista" close={close}>
      <p>
        Entregale estos datos a la persona. Al ingresar tendrá que elegir su
        nueva contraseña.
      </p>
      <label className="field">
        Email
        <input readOnly value={email} />
      </label>
      <label className="field">
        Contraseña temporal
        <input readOnly value={password} autoComplete="off" />
      </label>
      <p className="muted">
        Se muestra una sola vez. Si la perdés, podés restablecer el acceso.
      </p>
      {error && <p role="alert">{error}</p>}
      <div className="gym-actions">
        <button
          className="button secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(
                `Email: ${email}\nContraseña temporal: ${password}`,
              );
              setCopied(true);
            } catch {
              setError("Seleccioná los campos para copiarlos manualmente.");
            }
          }}
        >
          {copied ? <Check size={18} /> : <Copy size={18} />}{" "}
          {copied ? "Copiado" : "Copiar datos"}
        </button>
        <button className="button" onClick={close}>
          Listo
        </button>
      </div>
    </Modal>
  );
}
type CreateAccountProps = {
  kind: "gym" | "member";
  close: () => void;
  done: () => void;
};
export function CreateAccount(props: CreateAccountProps) {
  const { session } = useAuth();
  return <AccountCreationForm {...props} ownerId={session!.user.id} />;
}
export function AccountCreationForm({
  kind,
  close,
  done,
  ownerId,
}: CreateAccountProps & { ownerId: string }) {
  const storageKey = "pulso-gym-provision:" + ownerId + ":" + kind;
  const [recovered] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem(storageKey) || "null") as {
        name: string;
        firstName?: string;
        lastName?: string;
        gender?: string;
        email: string;
        operationId: string;
      } | null;
    } catch {
      return null;
    }
  });
  const [name, setName] = useState(recovered?.name || ""),
    [email, setEmail] = useState(recovered?.email || ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [password, setPassword] = useState("");
  const [operationId] = useState(
    () => recovered?.operationId || crypto.randomUUID(),
  );
  const [firstName, setFirstName] = useState(recovered?.firstName || "");
  const [lastName, setLastName] = useState(recovered?.lastName || "");
  const [gender, setGender] = useState(recovered?.gender || "unspecified");
  // Replay older pending requests exactly; their server reservation has no gender.
  const legacyRequest =
    kind === "member" && !!recovered && !recovered.firstName;
  if (password)
    return (
      <Credentials
        email={email}
        password={password}
        close={() => {
          done();
          close();
        }}
      />
    );
  return (
    <Modal
      title={kind === "gym" ? "Dar de alta un gimnasio" : "Agregar entrenado"}
      close={() => {
        if (!busy) close();
      }}
    >
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setError("");
          try {
            const details =
              kind === "member" && !legacyRequest
                ? {
                    name: `${firstName.trim()} ${lastName.trim()}`,
                    email,
                    operationId,
                    gender,
                  }
                : { name, email, operationId };
            if (
              kind === "member" &&
              !legacyRequest &&
              (!firstName.trim() || !lastName.trim())
            ) {
              throw Error("Completá el nombre y el apellido.");
            }
            // Persist the request ID, never the temporary password. A lost
            // response can be recovered safely by replaying the same request.
            sessionStorage.setItem(
              storageKey,
              JSON.stringify({
                ...details,
                ...(!legacyRequest && kind === "member"
                  ? { firstName, lastName }
                  : {}),
              }),
            );
            const result = await accountAction({
              action: kind === "gym" ? "create_gym" : "create_member",
              ...details,
            });
            sessionStorage.removeItem(storageKey);
            if (result.temporaryPassword) setPassword(result.temporaryPassword);
            else {
              done();
              close();
            }
          } catch (e) {
            setError(gymError(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {kind === "member" && !legacyRequest ? (
          <>
            <div className="gym-name-fields">
              <label className="field">
                Nombre
                <input
                  required
                  autoComplete="given-name"
                  maxLength={59}
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  disabled={busy}
                />
              </label>
              <label className="field">
                Apellido
                <input
                  required
                  autoComplete="family-name"
                  maxLength={60}
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  disabled={busy}
                />
              </label>
            </div>
            <label className="field">
              Género
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                disabled={busy}
              >
                <option value="unspecified">Prefiere no indicar</option>
                <option value="female">Femenino</option>
                <option value="male">Masculino</option>
              </select>
            </label>
          </>
        ) : (
          <label className="field">
            {kind === "gym" ? "Nombre del gimnasio" : "Nombre y apellido"}
            <input
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
            />
          </label>
        )}
        <label className="field">
          Email
          <input
            type="email"
            autoComplete="off"
            required
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
          />
        </label>
        <p className="muted">
          Generaremos una contraseña temporal individual. Esta cuenta queda
          asociada {kind === "gym" ? "a este gimnasio" : "a tu gimnasio"}.
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="button" disabled={busy}>
          {busy ? "Creando cuenta…" : "Crear cuenta"}
        </button>
      </form>
    </Modal>
  );
}
export function PasswordForm({
  email,
  required = false,
  done,
}: {
  email: string;
  required?: boolean;
  done: () => void;
}) {
  const [password, setPassword] = useState(""),
    [repeat, setRepeat] = useState(""),
    [captcha, setCaptcha] = useState(""),
    [captchaAttempt, setCaptchaAttempt] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy || ((captchaRequired || captchaSiteKey) && !captcha)) return;
        if (password !== repeat) {
          setError("Las contraseñas no coinciden.");
          return;
        }
        setBusy(true);
        setError("");
        try {
          let uncertain: unknown;
          try {
            await accountAction({ action: "change_password", password });
          } catch (e) {
            // Auth may have committed even if the Edge response was lost.
            uncertain = e;
          }
          const signed = await cloud().auth.signInWithPassword({
            email,
            password,
            options: { captchaToken: captcha || undefined },
          });
          if (signed.error)
            throw Error(
              uncertain
                ? "No pudimos confirmar el cambio. Reintentá cuando vuelva la conexión. Si cerrás esta pantalla, ingresá con la nueva contraseña; si no funciona, usá la anterior."
                : "Contraseña actualizada. Cerrá sesión e ingresá con la nueva contraseña.",
            );
          const access = await cloud().rpc("gym_access");
          if (
            access.error ||
            access.data?.blocked ||
            access.data?.mustChangePassword
          )
            throw (
              uncertain ||
              Error(
                "No pudimos confirmar el acceso. Reintentá el cambio de contraseña.",
              )
            );
          setPassword("");
          setRepeat("");
          done();
        } catch (e) {
          setError(gymError(e));
        } finally {
          setBusy(false);
          setCaptcha("");
          setCaptchaAttempt((n) => n + 1);
        }
      }}
    >
      <h2>{required ? "Elegí tu nueva contraseña" : "Cambiar contraseña"}</h2>
      <p className="muted">
        Usá al menos 12 caracteres con mayúscula, minúscula y número.{" "}
        {required &&
          "La contraseña temporal se usa solamente para el primer ingreso."}
      </p>
      <label className="field">
        Nueva contraseña
        <input
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{12,128}"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
        />
      </label>
      <label className="field">
        Repetí la contraseña
        <input
          type="password"
          autoComplete="new-password"
          required
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
          disabled={busy}
        />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <Captcha key={captchaAttempt} onToken={setCaptcha} />
      <button
        className="button"
        disabled={busy || (!!(captchaRequired || captchaSiteKey) && !captcha)}
      >
        {busy ? "Guardando…" : "Guardar nueva contraseña"}
      </button>
    </form>
  );
}
export async function signOutGym() {
  await cloud().auth.signOut({ scope: "local" });
  location.assign("/");
}
