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
  source: string;
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
        const time = schedule.day_times[String(weekday)] ?? schedule.time;
        if (
          entries.some(
            (v) =>
              v.student.id === student.id &&
              v.date === date &&
              (v.source === "scheduled" ||
                (v.source === "rescheduled" && v.status !== "cancelled") ||
                (v.source === "extra" &&
                  countsAsTurn(v) &&
                  v.time.slice(0, 5) === time.slice(0, 5))),
          )
        )
          continue;
        entries.push({
          id: `habitual:${student.id}:${date}`,
          date,
          time,
          source: "habitual",
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

export function shiftDate(date: string, days: number): string {
  const value = new Date(date + "T12:00:00Z");
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function weekDays(date: string): string[] {
  const offset = (new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7;
  const monday = shiftDate(date, -offset);
  return Array.from({ length: 7 }, (_, i) => shiftDate(monday, i));
}

export function weekEntries(
  date: string,
  today: string,
  visits: CalendarEntry[],
  snapshots: Pick<StudentSnapshot, "student" | "schedule">[],
): CalendarEntry[] {
  const days = weekDays(date);
  return [...new Set(days.map((day) => day.slice(0, 7)))]
    .flatMap((month) => calendarEntries(month, today, visits, snapshots))
    .filter((entry) => entry.date >= days[0] && entry.date <= days[6]);
}
