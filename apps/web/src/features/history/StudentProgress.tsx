import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useData } from "../../app/DataProvider";
import { StudentNavigation } from "../students/StudentNavigation";
import { Progress } from "./Progress";
import "./history.css";

export function StudentProgress() {
  const { id } = useParams();
  const { rows } = useData();
  const row = rows.find((r) => r.studentId === id);
  if (!row) return <p role="status">Cargando alumno…</p>;
  const student = row.projection.student;
  return (
    <div className="student-page">
      <Link className="student-back" to={"/alumnos/" + id}>
        <ArrowLeft size={18} />
        Volver a {student.name}
      </Link>
      <header className="page-heading">
        <div>
          <p className="eyebrow">CADA AVANCE CUENTA</p>
          <h1>Progreso</h1>
          <p className="muted">
            {student.name} · Su evolución, ejercicio por ejercicio.
          </p>
        </div>
      </header>
      <StudentNavigation studentId={id!} />
      <Progress
        studentId={id!}
        studentName={student.name}
        gender={student.gender}
      />
    </div>
  );
}
