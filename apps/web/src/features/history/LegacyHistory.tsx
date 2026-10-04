import { useEffect, useState } from "react";
import { cloud } from "../../adapters/supabase";
import { download } from "../../components/download";
type Legacy = {
  original_person: {
    name: string;
    records: {
      date: string;
      name: string;
      weight: number;
      sets: number;
      reps: number;
    }[];
    archives: unknown[];
    history: unknown[];
  };
  original_sessions: { status: string }[];
  original_visits: unknown[];
};
export function LegacyHistory({ studentId }: { studentId: string }) {
  const [value, setValue] = useState<Legacy | null>(null);
  useEffect(() => {
    let active = true;
    void cloud()
      .from("legacy_records")
      .select("original_person,original_sessions,original_visits")
      .eq("student_id", studentId)
      .maybeSingle()
      .then(({ data }) => {
        if (active) setValue(data);
      });
    return () => {
      active = false;
    };
  }, [studentId]);
  if (!value) return null;
  return (
    <section className="card blocks">
      <h2>Historia importada de la demo</h2>
      <p className="notice">
        Estos son registros agregados anteriores. No representan series
        observadas individualmente. Las sesiones legadas abiertas quedan
        conservadas para revisión.
      </p>
      <p>
        {value.original_person.archives.length} rutinas archivadas ·{" "}
        {value.original_person.history.length} eventos anteriores ·{" "}
        {value.original_sessions.filter((s) => s.status === "open").length}{" "}
        sesiones legadas abiertas.
      </p>
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Ejercicio</th>
              <th>Carga</th>
              <th>Series × reps</th>
            </tr>
          </thead>
          <tbody>
            {value.original_person.records.map((r, i) => (
              <tr key={i}>
                <td>{r.date}</td>
                <td>{r.name}</td>
                <td>{r.weight} kg</td>
                <td>
                  {r.sets} × {r.reps}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        className="button secondary"
        onClick={() => download("pulso-historia-legada.json", value)}
      >
        Descargar historia original
      </button>
    </section>
  );
}
