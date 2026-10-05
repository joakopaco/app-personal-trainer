import { useEffect, useState } from "react";
import { useData } from "../../app/DataProvider";
import { useAuth } from "../auth/AuthProvider";
import { SignOutButton } from "../auth/SignOutButton";
import { PlatformAdminLink } from "../gym/PlatformAdmin";
import { cloud, updateVerifiedPassword } from "../../adapters/supabase";
import {
  passwordHint,
  passwordPattern,
  validPassword,
} from "../../adapters/password";
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
    <>
      <p className="eyebrow">TU CUENTA</p>
      <h1>Ajustes</h1>
      <PlatformAdminLink />
      <div className="profile-settings stack">
        {message && (
          <p className="notice" role="status">
            {message}
          </p>
        )}
        <section className="card stack">
          <div className="row spread">
            <h2>Mi perfil</h2>
            <span className="badge">Entrenador</span>
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
              El cambio de email estará disponible cuando habilitemos la
              verificación por correo.
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
        <section className="card stack">
          <div className="row spread">
            <h2>Contraseña</h2>
            <button
              className="button secondary"
              aria-expanded={editing}
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
        </section>
        <SignOutButton className="settings-signout" />
      </div>
    </>
  );
}
