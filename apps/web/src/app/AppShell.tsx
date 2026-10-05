import { useEffect, type ReactNode } from "react";
import { DialogFocus } from "../components/DialogFocus";
import { NavLink, useLocation } from "react-router-dom";
import { Brand } from "../components/Brand";
import {
  Dumbbell,
  CalendarDays,
  Users,
  ClipboardList,
  Settings,
} from "lucide-react";
const links = [
  ["/hoy", "Hoy", CalendarDays],
  ["/alumnos", "Alumnos", Users],
  ["/rutinas", "Rutinas", ClipboardList],
  ["/biblioteca", "Ejercicios", Dumbbell],
  ["/ajustes", "Ajustes", Settings],
] as const;
export function AppShell({
  children,
  accountActions,
}: {
  children: ReactNode;
  accountActions?: ReactNode;
}) {
  const { pathname } = useLocation();
  useEffect(() => {
    // Run after the outgoing session saves its position. Live training restores
    // its own saved position on the next animation frame.
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname]);
  return (
    <div className="app-shell">
      <DialogFocus />
      <a className="skip" href="#contenido">
        Ir al contenido
      </a>
      <aside className="sidebar">
        <a className="brand" href="/hoy">
          <Brand />
        </a>
        <p className="brand-caption">TU ESPACIO DE ENTRENAMIENTO</p>
        <nav aria-label="Principal">
          {links.map(([to, label, Icon]) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                isActive ||
                (to === "/alumnos" &&
                  /^\/(progreso|historial)\//.test(pathname))
                  ? "active"
                  : undefined
              }
            >
              <Icon size={20} aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          {accountActions}
          <span>Prepará. Acompañá. Progresá.</span>
        </div>
      </aside>
      <main id="contenido" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
