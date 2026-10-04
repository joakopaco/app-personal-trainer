import { useParams } from "react-router-dom";
import { useData } from "../../app/DataProvider";
import { StudentHeader } from "../students/StudentHeader";
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
      <StudentHeader data={row.projection} />
      <Progress
        studentId={id!}
        studentName={student.name}
        gender={student.gender}
      />
    </div>
  );
}
