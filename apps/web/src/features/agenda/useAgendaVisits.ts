import { useEffect, useState } from "react";
import { visitSchema } from "@pulso/domain/contracts";
import { todayKey } from "@pulso/domain/dates";
import { useData } from "../../app/DataProvider";
import { cloud } from "../../adapters/supabase";
import type { AgendaVisit } from "./RescheduleVisit";

// Snapshots contain the last 35 and next 62 days. Read other dates explicitly
// so moving a visit further ahead never makes it disappear from the agenda.
export function useAgendaVisits(date: string) {
  return useAgendaRange(date, date);
}

export function useAgendaRange(start: string, end: string) {
  const { rows } = useData();
  const offset = (date: string) =>
    Math.round(
      (Date.parse(date + "T12:00:00Z") -
        Date.parse(todayKey() + "T12:00:00Z")) /
        86400000,
    );
  const remote = offset(start) < -35 || offset(end) > 62;
  const revisionKey = rows
    .map((r) => r.studentId + ":" + r.confirmed.revision)
    .join("|");
  const key = start + ":" + end + ":" + revisionKey;
  const [result, setResult] = useState<{
    key: string;
    visits: AgendaVisit[];
    error: string;
  }>();
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!remote) return;
    let active = true;
    setResult(undefined);
    void (async () => {
      try {
        const visits: AgendaVisit[] = [];
        for (let from = 0; ; from += 200) {
          const { data, error } = await cloud()
            .from("visits")
            .select("*")
            .gte("date", start)
            .lte("date", end)
            .order("id")
            .range(from, from + 199);
          if (error) throw error;
          visits.push(...data.map((visit) => visitSchema.parse(visit)));
          if (data.length < 200) break;
        }
        if (active) setResult({ key, visits, error: "" });
      } catch {
        if (active)
          setResult({
            key,
            visits: [],
            error:
              "No se pudo cargar esta fecha. Revisá la conexión y reintentá.",
          });
      }
    })();
    return () => {
      active = false;
    };
  }, [key, remote, reload, start, end]);
  const cached = rows.flatMap((r) => r.projection.visits);
  const allVisits =
    remote && result?.key === key
      ? [
          ...cached.filter((v) => v.date < start || v.date > end),
          ...result.visits,
        ]
      : cached;
  const visits = allVisits
    .filter((v) => v.date >= start && v.date <= end)
    .flatMap((v) => {
      const student = rows.find((r) => r.studentId === v.student_id)?.projection
        .student;
      return student ? [{ ...v, student }] : [];
    })
    .sort(
      (a, b) =>
        a.time.localeCompare(b.time) ||
        a.student.name.localeCompare(b.student.name),
    );
  return {
    visits,
    allVisits,
    loading: remote && result?.key !== key,
    error: remote && result?.key === key ? result.error : "",
    retry: () => setReload((n) => n + 1),
  };
}
