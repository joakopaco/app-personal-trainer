import { LoadingState } from "../../components/LoadingState";
import { useEffect, useState } from "react";
import {
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import {
  Building2,
  Users,
  ClipboardList,
  Settings,
  Dumbbell,
  TrendingUp,
  User,
} from "lucide-react";
import { Brand } from "../../components/Brand";
import { DialogFocus } from "../../components/DialogFocus";
import { cloud } from "../../adapters/supabase";
import { gymError, rows, type GymAccess } from "./api";
import { PasswordForm, signOutGym } from "./ui";
import { GymDashboard, GymMembers, GymMemberProfile } from "./GymAdmin";
import { GymRoutines, GymRoutineEditor } from "./GymRoutines";
import { MemberHome, MemberTraining } from "./MemberTraining";
import { GymProgress } from "./GymProgress";
import { GymSettings } from "./GymSettings";
import { GymContext as Context } from "./GymContext";
import "./gym.css";

export function GymPortal() {
  const [access, setAccess] = useState<GymAccess | null>(null),
    [error, setError] = useState("");
  const { pathname } = useLocation();
  async function refresh() {
    try {
      const next = await rows<GymAccess>(cloud().rpc("gym_access"));
      setAccess(next);
      setError("");
    } catch (e) {
      setError(gymError(e));
    }
  }
  useEffect(() => {
    let live = true;
    const check = async () => {
      try {
        const next = await rows<GymAccess>(cloud().rpc("gym_access"));
        if (live) {
          setAccess(next);
          setError("");
        }
      } catch (e) {
        if (live) setError(gymError(e));
      }
    };
    void check();
    const timer = setInterval(check, 60000);
    window.addEventListener("online", check);
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener("online", check);
    };
  }, []);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname]);
  if ((!access && error) || access?.blocked || access?.mode === "pending")
    return (
      <main className="gym-gate">
        <Brand />
        <section className="card stack">
          <h1>{error ? "Revisá tu conexión" : "Acceso pausado"}</h1>
          <p role="alert">
            {error ||
              "Consultá con quien administra tu cuenta para continuar. Tus rutinas e historial se conservan."}
          </p>
          <button className="button" onClick={refresh}>
            Reintentar
          </button>
          <button className="button secondary" onClick={signOutGym}>
            Cerrar sesión
          </button>
        </section>
      </main>
    );
  if (!access)
    return <LoadingState label="Preparando tu gimnasio…" fullScreen />;
  if (access.mustChangePassword)
    return (
      <main className="gym-gate">
        <Brand />
        <section className="card stack">
          <p className="eyebrow">BIENVENIDO A {access.gymName}</p>
          <PasswordForm email={access.email} required done={refresh} />
          <button className="button secondary" onClick={signOutGym}>
            Cerrar sesión
          </button>
        </section>
      </main>
    );
  const admin = access.mode === "admin",
    base = admin ? "/gimnasio" : "/mi-entrenamiento";
  const links = admin
    ? ([
        [base, "Resumen", Building2],
        [base + "/entrenados", "Entrenados", Users],
        [base + "/rutinas", "Rutinas", ClipboardList],
        [base + "/ajustes", "Ajustes", Settings],
      ] as const)
    : ([
        [base, "Entrenar", Dumbbell],
        [base + "/rutinas", "Rutinas", ClipboardList],
        [base + "/progreso", "Progreso", TrendingUp],
        [base + "/cuenta", "Mi cuenta", User],
      ] as const);
  return (
    <Context.Provider value={{ access, refresh }}>
      <div className="app-shell gym-shell">
        <DialogFocus />
        <a className="skip" href="#contenido">
          Ir al contenido
        </a>
        <aside className="sidebar">
          <NavLink className="brand" to={base}>
            <Brand />
          </NavLink>
          <p className="brand-caption">{access.gymName}</p>
          <nav aria-label="Principal">
            {links.map(([to, label, Icon], i) => (
              <NavLink
                key={to}
                to={to}
                end={i === 0}
                className={({ isActive }) => (isActive ? "active" : undefined)}
              >
                <Icon size={20} />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="sidebar-foot">
            {admin
              ? "El gimnasio, conectado."
              : "Tu entrenamiento. Tu progreso."}
          </div>
        </aside>
        <main id="contenido" className="gym-page" tabIndex={-1}>
          {error && (
            <div className="notice gym-connection" role="status">
              <span>No pudimos actualizar tu acceso. {error}</span>
              <button className="button secondary" onClick={refresh}>
                Reintentar conexión
              </button>
            </div>
          )}
          <Routes>
            {admin ? (
              <>
                <Route path="/gimnasio" element={<GymDashboard />} />
                <Route path="/gimnasio/entrenados" element={<GymMembers />} />
                <Route
                  path="/gimnasio/entrenados/:id"
                  element={<GymMemberProfile />}
                />
                <Route
                  path="/gimnasio/entrenados/:id/progreso"
                  element={<GymProgress />}
                />
                <Route path="/gimnasio/rutinas" element={<GymRoutines />} />
                <Route
                  path="/gimnasio/rutinas/:id"
                  element={<GymRoutineEditor />}
                />
                <Route path="/gimnasio/ajustes" element={<GymSettings />} />
              </>
            ) : (
              <>
                <Route path="/mi-entrenamiento" element={<MemberHome />} />
                <Route
                  path="/mi-entrenamiento/rutinas"
                  element={<GymRoutines />}
                />
                <Route
                  path="/mi-entrenamiento/rutinas/:id"
                  element={<GymRoutineEditor />}
                />
                <Route
                  path="/mi-entrenamiento/sesion/:id"
                  element={<MemberTraining />}
                />
                <Route
                  path="/mi-entrenamiento/progreso"
                  element={<GymProgress />}
                />
                <Route
                  path="/mi-entrenamiento/cuenta"
                  element={<GymSettings />}
                />
              </>
            )}
            <Route path="*" element={<Navigate to={base} replace />} />
          </Routes>
        </main>
      </div>
    </Context.Provider>
  );
}
