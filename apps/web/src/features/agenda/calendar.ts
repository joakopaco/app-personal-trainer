import type { Student, StudentSnapshot } from "@pulso/domain/contracts";

export function monthDays(month: string): string[] {
  const [year, number] = month.split("-").map(Number);
  const length = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return Array.from(
    { length },
    (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`,
  );
}

export function shiftMonth(month: string, offset: number): string {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number - 1 + offset, 1))
    .toISOString()
    .slice(0, 7);
}

export type CalendarEntry = {
  id: string;
  date: string;
  time: string;
  student: Student;
  status: StudentSnapshot["visits"][number]["status"] | "habitual";
};

export const calendarStatus: Record<CalendarEntry["status"], string> = {
  pending: "Pendiente",
  open: "Entrenando",
  closed: "Finalizado",
  absent: "No asistió",
  rescheduled: "Reprogramado",
  cancelled: "Cancelado",
  habitual: "Horario habitual",
};
export const countsAsTurn = (entry: CalendarEntry) =>
  !["absent", "rescheduled", "cancelled"].includes(entry.status);

// Future months may not have been generated yet. Preview the current schedule
// without writing visits, recreating cancelled turns or inventing past attendance.
export function calendarEntries(
  month: string,
  today: string,
  visits: CalendarEntry[],
  snapshots: Pick<StudentSnapshot, "student" | "schedule">[],
): CalendarEntry[] {
  const entries = visits.filter((v) => v.date.startsWith(month));
  if (month > today.slice(0, 7)) {
    for (const { student, schedule } of snapshots) {
      if (student.archived || !schedule) continue;
      for (const date of monthDays(month)) {
        const weekday = new Date(date + "T12:00:00Z").getUTCDay() || 7;
        if (!schedule.weekdays.includes(weekday)) continue;
        if (entries.some((v) => v.student.id === student.id && v.date === date))
          continue;
        entries.push({
          id: `habitual:${student.id}:${date}`,
          date,
          time: schedule.day_times[String(weekday)] ?? schedule.time,
          student,
          status: "habitual",
        });
      }
    }
  }
  return entries.sort(
    (a, b) =>
      a.time.localeCompare(b.time) ||
      a.student.name.localeCompare(b.student.name),
  );
}
