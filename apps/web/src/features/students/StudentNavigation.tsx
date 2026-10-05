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
      <NavLink end to={"/alumnos/" + studentId}>
        <UserRound size={18} />
        Información y rutinas
      </NavLink>
      <NavLink to={"/alumnos/" + studentId + "/rutina"}>
        <ClipboardList size={18} />
        Rutina actual
      </NavLink>
      <NavLink to={"/alumnos/" + studentId + "/borradores"}>
        <FilePenLine size={18} /> Borradores
      </NavLink>
      <NavLink to={"/progreso/" + studentId}>
        <TrendingUp size={18} />
        Progreso
      </NavLink>
      <NavLink to={"/historial/" + studentId}>
        <History size={18} />
        Historial
      </NavLink>
    </nav>
  );
}
