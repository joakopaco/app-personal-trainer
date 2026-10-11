import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  CloudCheck,
  LogOut,
  ShieldCheck,
  Smartphone,
  UserRound,
} from "lucide-react";
import { useGym } from "./GymContext";
import { command, gymError } from "./api";
import { Modal, PageHeading, PasswordForm, signOutGym } from "./ui";
import "../settings/settings.css";

export function GymSettings() {
  const { access, refresh } = useGym();
  const admin = access.mode === "admin";
  const [name, setName] = useState(access.gymName);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [password, setPassword] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState<{
    count: number;
    unavailable: boolean;
  }>({ count: 0, unavailable: false });
  useEffect(() => {
    const update = () => {
      setOnline(navigator.onLine);
      try {
        const prefixes = ["pulso-gym-session:", "pulso-gym-editor:"].map(
          (p) => p + access.userId + ":",
        );
        setPending({
          count: Object.keys(localStorage).filter(
            (k) =>
              !k.endsWith(":version") && prefixes.some((p) => k.startsWith(p)),
          ).length,
          unavailable: false,
        });
      } catch {
        setPending({ count: 0, unavailable: true });
      }
    };
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.removeEventListener("storage", update);
    };
  }, [access.userId]);
  return (
    <div className="settings-page">
      <PageHeading
        eyebrow={access.gymName}
        title={admin ? "Ajustes" : "Mi cuenta"}
        description="Tu perfil, tu acceso y la información para entrenar con tranquilidad."
      />
      {message && (
        <p className="notice settings-feedback" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="error settings-feedback" role="alert">
          {error}
        </p>
      )}
      <div className="settings-grid">
        <div className="settings-column">
          <section className="card settings-card">
            <div className="settings-card-heading">
              <span className="settings-icon">
                <UserRound size={21} />
              </span>
              <div>
                <div className="settings-title-row">
                  <h2>Mi perfil</h2>
                  <span className="badge">
                    {admin ? "Gimnasio" : "Entrenado"}
                  </span>
                </div>
                <p>{access.name}</p>
              </div>
            </div>
            <label className="field">
              Email
              <input value={access.email} readOnly />
            </label>
            {admin ? (
              <form
                className="stack"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (busy) return;
                  setBusy(true);
                  setError("");
                  setMessage("");
                  try {
                    await command("update_gym", { name: name.trim() });
                    await refresh();
                    setMessage("Nombre guardado.");
                  } catch (e) {
                    setError(gymError(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <label className="field">
                  Nombre del gimnasio
                  <input
                    required
                    maxLength={120}
                    value={name}
                    disabled={busy}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <div className="gym-actions">
                  <button
                    className="button"
                    disabled={
                      busy || !name.trim() || name.trim() === access.gymName
                    }
                  >
                    {busy ? "Guardando…" : "Guardar nombre"}
                  </button>
                </div>
              </form>
            ) : (
              <>
                <dl className="settings-details">
                  <div>
                    <dt>Gimnasio</dt>
                    <dd>{access.gymName}</dd>
                  </div>
                  <div>
                    <dt>Género</dt>
                    <dd>
                      {access.gender === "female"
                        ? "Femenino"
                        : access.gender === "male"
                          ? "Masculino"
                          : "Sin indicar"}
                    </dd>
                  </div>
                </dl>
                <p>Para actualizar tu ficha, consultá con tu gimnasio.</p>
              </>
            )}
          </section>
          <section className="card settings-card">
            <div className="settings-card-heading">
              <span className="settings-icon">
                <ShieldCheck size={21} />
              </span>
              <div>
                <h2>Seguridad y acceso</h2>
                <p>Tu contraseña es personal.</p>
              </div>
            </div>
            <div className="settings-security-action">
              <button
                className="button secondary"
                onClick={() => setPassword(true)}
              >
                Cambiar contraseña
              </button>
            </div>
            <div className="settings-session">
              <h3>Sesión en este dispositivo</h3>
              <p>
                Al cerrar sesión, tus rutinas y registros guardados se conservan
                en tu cuenta.
              </p>
              <div className="settings-signout">
                <button className="button secondary" onClick={signOutGym}>
                  <LogOut size={18} />
                  Cerrar sesión
                </button>
              </div>
            </div>
          </section>
        </div>
        <div className="settings-column">
          <section className="card settings-card">
            <div className="settings-card-heading">
              <span className="settings-icon">
                <CloudCheck size={21} />
              </span>
              <div>
                <h2>Guardado y conexión</h2>
                <p>Tus cambios en este dispositivo.</p>
              </div>
            </div>
            <div className="settings-storage-status">
              <div className="settings-status-line">
                <span
                  className={`settings-status-dot${!online || pending.count || pending.unavailable ? " needs-attention" : ""}`}
                />
                <strong>
                  {pending.unavailable
                    ? "Almacenamiento local no disponible"
                    : pending.count
                      ? `${pending.count} ${pending.count === 1 ? "edición local para revisar" : "ediciones locales para revisar"}`
                      : "Sin ediciones locales pendientes"}
                </strong>
              </div>
              <p>
                {pending.unavailable
                  ? "Guardá los cambios antes de salir de cada pantalla."
                  : "Los borradores y las series se conservan en este dispositivo. Confirmá el guardado desde la rutina o el entrenamiento cuando tengas conexión."}
              </p>
            </div>
            <dl className="settings-details">
              <div>
                <dt>Conexión del dispositivo</dt>
                <dd>{online ? "Red disponible" : "Sin conexión a internet"}</dd>
              </div>
              <div>
                <dt>Cuenta</dt>
                <dd>{admin ? "Administración del gimnasio" : "Entrenado"}</dd>
              </div>
            </dl>
            <div className="gym-actions">
              <Link
                className="button secondary"
                to={admin ? "/gimnasio/rutinas" : "/mi-entrenamiento"}
              >
                {admin ? "Ver rutinas" : "Ver mi entrenamiento"}
              </Link>
            </div>
          </section>
          <section className="card settings-card">
            <div className="settings-card-heading">
              <span className="settings-icon">
                <Smartphone size={21} />
              </span>
              <div>
                <h2>Pulso en tu dispositivo</h2>
                <p>Acceso rápido para cada entrenamiento.</p>
              </div>
            </div>
            <div className="settings-tip">
              <Smartphone size={19} />
              <div>
                <h3>Agregar a inicio</h3>
                <p>
                  En iPhone, usá Compartir → Agregar a inicio. En Android, abrí
                  el menú del navegador y elegí Instalar o Agregar a inicio.
                </p>
              </div>
            </div>
            <div className="settings-tip">
              <CloudCheck size={19} />
              <div>
                <h3>Antes de salir</h3>
                <p>
                  {admin
                    ? "Guardá cada borrador. Publicar hace que la nueva versión esté disponible; los entrenamientos anteriores conservan su rutina."
                    : "Confirmá cada serie y guardá el entrenamiento. Al finalizar, los resultados aparecen en Progreso."}
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
      {password && (
        <Modal title="Seguridad de tu cuenta" close={() => setPassword(false)}>
          <PasswordForm
            email={access.email}
            done={() => {
              void refresh();
              setPassword(false);
              setMessage("Contraseña actualizada.");
            }}
          />
        </Modal>
      )}
    </div>
  );
}
