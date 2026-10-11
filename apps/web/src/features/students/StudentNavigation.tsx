import { NavLink } from "react-router-dom";
import {
  UserRound,
  ClipboardList,
  TrendingUp,
  History,
  FilePenLine,
} from "lucide-react";
import "./students.css";

export function StudentNavigation({ studentId }: { studentId: string }) {
  return (
    <nav className="student-navigation" aria-label="Secciones del alumno">
      <NavLink
        end
        to={"/alumnos/" + studentId}
        aria-label="Ficha: información y rutinas"
      >
        <UserRound size={18} aria-hidden="true" />
        <span>Ficha</span>
      </NavLink>
      <NavLink
        to={"/alumnos/" + studentId + "/rutina"}
        aria-label="Rutina actual"
      >
        <ClipboardList size={18} aria-hidden="true" />
        <span>Rutina</span>
      </NavLink>
      <NavLink to={"/alumnos/" + studentId + "/borradores"}>
        <FilePenLine size={18} aria-hidden="true" /> <span>Borradores</span>
      </NavLink>
      <NavLink to={"/progreso/" + studentId}>
        <TrendingUp size={18} aria-hidden="true" />
        <span>Progreso</span>
      </NavLink>
      <NavLink to={"/historial/" + studentId}>
        <History size={18} aria-hidden="true" />
        <span>Historial</span>
      </NavLink>
    </nav>
  );
}
