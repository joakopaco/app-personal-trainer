import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  CloudCheck,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  UserRound,
  WifiOff,
} from "lucide-react";
import { useData } from "../../app/DataProvider";
import { useAuth } from "../auth/AuthProvider";
import { SignOutButton } from "../auth/SignOutButton";
import { cloud, updateVerifiedPassword } from "../../adapters/supabase";
import {
  passwordHint,
  passwordPattern,
  validPassword,
} from "../../adapters/password";
import "./settings.css";

function StorageStatus() {
  const data = useData();
  const [online, setOnline] = useState(() => navigator.onLine);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const updateConnection = () => setOnline(navigator.onLine);
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    return () => {
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
    };
  }, []);
  const needsReview = [
    ...new Set(
      data.pending
        .filter(
          (pending) =>
            pending.state === "conflict" || pending.state === "rejected",
        )
        .map((pending) => pending.studentId),
    ),
  ];
  const sending = data.pending.some((pending) => pending.state === "sending");
  const status = needsReview.length
    ? "Hay cambios que necesitan revisión"
    : sending
      ? "Enviando cambios de entrenamiento"
      : data.pending.length
        ? `${data.pending.length} ${data.pending.length === 1 ? "cambio por enviar" : "cambios por enviar"}`
        : "Sin envíos de entrenamiento pendientes";

  return (
    <section
      className="card settings-card"
      aria-labelledby="settings-storage-title"
    >
      <div className="settings-card-heading">
        <span className="settings-icon">
          <CloudCheck size={21} aria-hidden="true" />
        </span>
        <div>
          <h2 id="settings-storage-title">Guardado y conexión</h2>
          <p>El estado de tus entrenamientos en este dispositivo.</p>
        </div>
      </div>
      <div className="settings-storage-status" aria-live="polite">
        <div className="settings-status-line">
          <span
            className={`settings-status-dot${needsReview.length || data.error || !online ? " needs-attention" : ""}`}
            aria-hidden="true"
          />
          <strong>{status}</strong>
        </div>
        <p>
          {needsReview.length
            ? "Abrí el entrenamiento para revisar los cambios antes de continuar con el guardado."
            : data.pending.length
              ? "Los cambios registrados en este dispositivo se envían automáticamente cuando hay conexión."
              : "Los borradores se conservan en sus pantallas hasta que los confirmes."}
        </p>
        {needsReview.map((id) => (
          <Link
            className="settings-review-link"
            key={id}
            to={"/entrenar/" + id}
          >
            Revisar entrenamiento de{" "}
            {data.rows.find((row) => row.studentId === id)?.projection.student
              .name || "alumno"}
          </Link>
        ))}
      </div>
      <dl className="settings-details">
        <div>
          <dt>Conexión del dispositivo</dt>
          <dd>{online ? "Red disponible" : "Sin conexión a internet"}</dd>
        </div>
        <div>
          <dt>Alumnos en este dispositivo</dt>
          <dd>{data.rows.length}</dd>
        </div>
      </dl>
      {(data.error || error) && (
        <p className="settings-status-error" role="alert">
          {error || data.error}
        </p>
      )}
      <div className="page-actions">
        <button
          className="button secondary"
          disabled={!online || refreshing}
          onClick={async () => {
            if (refreshing) return;
            setRefreshing(true);
            setError("");
            try {
              await data.sync(true);
              await data.refresh();
            } catch {
              setError(
                "No se pudo actualizar el estado. Revisá la conexión e intentá de nuevo.",
              );
            } finally {
              setRefreshing(false);
            }
          }}
        >
          <RefreshCw size={17} aria-hidden="true" />
          {refreshing ? "Actualizando…" : "Actualizar estado"}
        </button>
      </div>
    </section>
  );
}

export function Settings() {
  const data = useData(),
    auth = useAuth();
  const [name, setName] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  useEffect(() => {
    let active = true;
    void cloud()
      .from("profiles")
      .select("display_name")
      .eq("id", data.db.scope.userId)
      .single()
      .then(({ data: profile, error }) => {
        if (!active) return;
        if (error)
          setMessage(
            "No se pudo cargar el perfil. Revisá la conexión y volvé a ingresar a Ajustes.",
          );
        else {
          setName(profile.display_name);
          setLoaded(true);
        }
      });
    return () => {
      active = false;
    };
  }, [data.db.scope.userId]);

  return (
    <div className="settings-page">
      <header className="settings-header">
        <p className="eyebrow">TU CUENTA</p>
        <h1>Ajustes</h1>
        <p className="muted">
          Tu perfil, tu acceso y la información para entrenar con tranquilidad.
        </p>
      </header>
      {message && (
        <p className="notice settings-feedback" role="status">
          {message}
        </p>
      )}
      <div className="settings-grid">
        <div className="settings-column">
          <section
            className="card settings-card"
            aria-labelledby="settings-profile-title"
          >
            <div className="settings-card-heading">
              <span className="settings-icon">
                <UserRound size={21} aria-hidden="true" />
              </span>
              <div>
                <div className="settings-title-row">
                  <h2 id="settings-profile-title">Mi perfil</h2>
                  <span className="badge">Entrenador</span>
                </div>
                <p>Los datos de tu cuenta en Pulso.</p>
              </div>
            </div>
            <form
              className="stack"
              onSubmit={async (e) => {
                e.preventDefault();
                if (busy || !name.trim()) return;
                setBusy(true);
                setMessage("");
                try {
                  const result = await cloud().rpc("update_my_profile", {
                    p_display_name: name.trim(),
                  });
                  if (result.error) throw result.error;
                  setName(result.data.display_name);
                  setMessage("Perfil guardado.");
                } catch {
                  setMessage(
                    "No pudimos confirmar el guardado del perfil. Revisá la conexión e intentá de nuevo.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label className="field">
                Nombre
                <input
                  autoComplete="name"
                  required
                  maxLength={100}
                  disabled={!loaded || busy}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className="field">
                Email
                <input
                  type="email"
                  readOnly
                  value={auth.session?.user.email ?? ""}
                  aria-describedby="email-info"
                />
              </label>
              <small className="muted" id="email-info">
                Usás este email para ingresar a Pulso. Por ahora no se puede
                modificar.
              </small>
              <div className="page-actions">
                <button
                  className="button"
                  disabled={!loaded || busy || !name.trim()}
                >
                  Guardar datos
                </button>
              </div>
            </form>
          </section>
          <section
            className="card settings-card"
            aria-labelledby="settings-security-title"
          >
            <div className="settings-card-heading">
              <span className="settings-icon">
                <ShieldCheck size={21} aria-hidden="true" />
              </span>
              <div>
                <h2 id="settings-security-title">Seguridad</h2>
                <p>Administrá tu contraseña y el acceso a tu cuenta.</p>
              </div>
            </div>
            <div className="settings-security-action">
              <div>
                <h3>Contraseña</h3>
                <p>
                  Para cambiarla, necesitás tu contraseña actual y conexión a
                  internet.
                </p>
              </div>
              <button
                className="button secondary"
                aria-expanded={editing}
                aria-controls={editing ? "settings-password-form" : undefined}
                disabled={busy}
                onClick={() => {
                  setEditing(!editing);
                  setCurrentPassword("");
                  setPassword("");
                  setRepeat("");
                  setMessage("");
                }}
              >
                {editing ? "Cancelar" : "Cambiar contraseña"}
              </button>
            </div>
            {editing && (
              <form
                id="settings-password-form"
                className="stack"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (busy) return;
                  if (!validPassword(password)) {
                    setMessage(passwordHint);
                    return;
                  }
                  if (password !== repeat) {
                    setMessage("Las contraseñas no coinciden.");
                    return;
                  }
                  setBusy(true);
                  setMessage("");
                  try {
                    if (!auth.session) throw Error("Sin sesión");
                    await updateVerifiedPassword(
                      auth.session,
                      password,
                      currentPassword,
                    );
                    setCurrentPassword("");
                    setPassword("");
                    setRepeat("");
                    setEditing(false);
                    setMessage(
                      "Contraseña actualizada. Usá la nueva contraseña en tu próximo ingreso.",
                    );
                  } catch (e) {
                    const code = (e as { code?: string }).code;
                    setMessage(
                      code === "current_password_mismatch" ||
                        code === "current_password_required"
                        ? "La contraseña actual no es correcta."
                        : code === "same_password"
                          ? "Elegí una contraseña diferente de la actual."
                          : "No se pudo cambiar la contraseña. Revisá tu conexión, la contraseña actual y los requisitos e intentá de nuevo.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <label className="field">
                  Contraseña actual
                  <input
                    type="password"
                    autoComplete="current-password"
                    required
                    disabled={busy}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                </label>
                <label className="field">
                  Nueva contraseña
                  <input
                    type="password"
                    autoComplete="new-password"
                    required
                    disabled={busy}
                    minLength={8}
                    pattern={passwordPattern}
                    aria-describedby="profile-password-hint"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
                <small id="profile-password-hint" className="muted">
                  {passwordHint}
                </small>
                <label className="field">
                  Repetí la nueva contraseña
                  <input
                    type="password"
                    autoComplete="new-password"
                    required
                    disabled={busy}
                    value={repeat}
                    onChange={(e) => setRepeat(e.target.value)}
                  />
                </label>
                <div className="page-actions">
                  <button className="button" disabled={busy}>
                    {busy ? "Guardando…" : "Guardar contraseña"}
                  </button>
                </div>
              </form>
            )}
            <div className="settings-session">
              <h3>Tu sesión en este dispositivo</h3>
              <p>
                Al cerrar sesión, tus borradores y cambios pendientes se
                conservan para cuando vuelvas a ingresar con esta cuenta.
              </p>
              <SignOutButton className="settings-signout" />
            </div>
          </section>
        </div>
        <div className="settings-column">
          <StorageStatus />
          <section
            className="card settings-card"
            aria-labelledby="settings-device-title"
          >
            <div className="settings-card-heading">
              <span className="settings-icon">
                <Smartphone size={21} aria-hidden="true" />
              </span>
              <div>
                <h2 id="settings-device-title">Pulso a mano</h2>
                <p>Prepará tu dispositivo antes de llegar al gimnasio.</p>
              </div>
            </div>
            <div className="settings-tip">
              <WifiOff size={19} aria-hidden="true" />
              <div>
                <h3>Entrená sin conexión</h3>
                <p>
                  Abrí Pulso con internet para descargar tus alumnos. Después
                  podés registrar los entrenamientos disponibles en este
                  dispositivo y enviarlos al reconectarte.
                </p>
                <small>
                  El acceso sin conexión dura hasta 24 horas desde la última
                  verificación de tu cuenta.
                </small>
              </div>
            </div>
            <div className="settings-tip">
              <Smartphone size={19} aria-hidden="true" />
              <div>
                <h3>Agregá un acceso directo</h3>
                <p>
                  Si tu navegador ofrece «Instalar aplicación» o «Agregar a
                  pantalla de inicio», usá esa opción para abrir Pulso desde tu
                  dispositivo.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
