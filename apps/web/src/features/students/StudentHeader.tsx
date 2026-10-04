import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import type { StudentSnapshot } from "@pulso/domain/contracts";
import { StudentNavigation } from "./StudentNavigation";
import { genders } from "./StudentForm";
import "./students.css";

export function StudentHeader({ data }: { data: StudentSnapshot }) {
  const { student, schedule } = data;
  const days = schedule?.weekdays.length ?? 0;
  return (
    <>
      <Link className="student-back" to="/alumnos">
        <ArrowLeft size={18} />
        Volver a alumnos
      </Link>
      <header className="page-heading student-heading">
        <div>
          <p className="eyebrow">FICHA DEL ALUMNO</p>
          <h1>{student.name}</h1>
          <div className="row muted">
            <span>
              {!student.gender || student.gender === "no_especificado"
                ? "Género sin indicar"
                : genders[student.gender]}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {days
                ? `${days} ${days === 1 ? "día" : "días"} por semana`
                : "Sin horario fijo"}
            </span>
            {student.archived && <span className="badge">Archivado</span>}
          </div>
        </div>
      </header>
      <StudentNavigation studentId={student.id} />
    </>
  );
}
