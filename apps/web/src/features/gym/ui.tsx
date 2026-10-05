import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, X, Copy, Check } from "lucide-react";
import { accountAction, gymError } from "./api";
import { cloud } from "../../adapters/supabase";
import { useAuth } from "../auth/AuthProvider";

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
    <p role="status">Cargando tu espacio…</p>
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
export function CreateAccount({
  kind,
  close,
  done,
}: {
  kind: "gym" | "member";
  close: () => void;
  done: () => void;
}) {
  const { session } = useAuth();
  const storageKey = "pulso-gym-provision:" + session!.user.id + ":" + kind;
  const [recovered] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem(storageKey) || "null") as {
        name: string;
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
            // Persist the request ID, never the temporary password. A lost
            // response can be recovered safely by replaying the same request.
            sessionStorage.setItem(
              storageKey,
              JSON.stringify({ name, email, operationId }),
            );
            const result = await accountAction({
              action: kind === "gym" ? "create_gym" : "create_member",
              operationId,
              name,
              email,
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
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        if (password !== repeat) {
          setError("Las contraseñas no coinciden.");
          return;
        }
        setBusy(true);
        setError("");
        try {
          await accountAction({ action: "change_password", password });
          const signed = await cloud().auth.signInWithPassword({
            email,
            password,
          });
          if (signed.error)
            throw Error(
              "Contraseña actualizada. Cerrá sesión e ingresá con la nueva contraseña.",
            );
          setPassword("");
          setRepeat("");
          done();
        } catch (e) {
          setError(gymError(e));
        } finally {
          setBusy(false);
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
      <button className="button" disabled={busy}>
        {busy ? "Guardando…" : "Guardar nueva contraseña"}
      </button>
    </form>
  );
}
export async function signOutGym() {
  await cloud().auth.signOut({ scope: "local" });
  location.assign("/");
}
