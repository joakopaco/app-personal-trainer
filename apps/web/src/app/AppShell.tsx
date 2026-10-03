import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { CalendarDays, Users, ClipboardList, Settings, Activity } from 'lucide-react';
const links=[['/hoy','Hoy',CalendarDays],['/alumnos','Alumnos',Users],['/rutinas','Rutinas',ClipboardList],['/ajustes','Ajustes',Settings]] as const;
export function AppShell({children}: {children:ReactNode}) {
  return <div className="app-shell">
    <a className="skip" href="#contenido">Ir al contenido</a>
    <aside className="sidebar"><a className="brand" href="/hoy"><Activity aria-hidden="true"/><span>pulso<span className="brand-dot">.</span></span></a><p className="brand-caption">TU ESPACIO DE ENTRENAMIENTO</p>
      <nav aria-label="Principal">{links.map(([to,label,Icon])=><NavLink key={to} to={to}><Icon size={20} aria-hidden="true"/><span>{label}</span></NavLink>)}</nav>
      <div className="sidebar-foot">Prepará. Acompañá. Progresá.</div>
    </aside>
    <main id="contenido" tabIndex={-1}>{children}</main>
  </div>;
}
