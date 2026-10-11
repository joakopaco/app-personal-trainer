import { expect, test } from "vitest";
import type {
  Student,
  StudentSnapshot,
} from "../../packages/domain/src/contracts";
import {
  calendarEntries,
  countsAsTurn,
  monthDays,
  shiftMonth,
  type CalendarEntry,
} from "../../apps/web/src/features/agenda/calendar";

const student: Student = {
  id: "student",
  workspace_id: "workspace",
  name: "Ana",
  alias: "",
  notes: "",
  archived: false,
  revision: 1,
  created_at: "",
};
const schedule: StudentSnapshot["schedule"] = {
  weekdays: [1, 3],
  time: "08:00",
  day_times: { "3": "10:30" },
};
const entry = (
  date: string,
  status: CalendarEntry["status"],
): CalendarEntry => ({
  id: date,
  date,
  time: "09:00",
  source: "scheduled",
  student,
  status,
});

test("an extra appointment does not cancel the habitual schedule, while actual matching turns are not duplicated", () => {
  const extra = { ...entry("2026-11-02", "cancelled"), source: "extra" };
  const snapshots = [{ student, schedule }];
  const forDay = (visits: CalendarEntry[]) =>
    calendarEntries("2026-11", "2026-10-11", visits, snapshots).filter(
      (v) => v.date === extra.date,
    );
  expect(forDay([extra]).map((v) => v.status)).toEqual([
    "habitual",
    "cancelled",
  ]);
  expect(forDay([{ ...extra, status: "pending" }])).toHaveLength(2);
  expect(
    forDay([{ ...extra, status: "pending", time: "08:00:00" }]),
  ).toHaveLength(1);
  expect(
    forDay([{ ...extra, source: "rescheduled", status: "pending" }]),
  ).toHaveLength(1);
});

test("calendar month boundaries support leap years and December navigation", () => {
  expect(monthDays("2028-02")).toHaveLength(29);
  expect(monthDays("2027-02").at(-1)).toBe("2027-02-28");
  expect(monthDays("2026-12")).toHaveLength(31);
  expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  expect(shiftMonth("2027-01", -1)).toBe("2026-12");
});

test("future habitual timetable uses day-specific times without fabricating visits in past or current months", () => {
  const snapshots = [{ student, schedule }];
  expect(calendarEntries("2026-10", "2026-10-11", [], snapshots)).toEqual([]);
  expect(calendarEntries("2026-09", "2026-10-11", [], snapshots)).toEqual([]);
  const future = calendarEntries("2026-11", "2026-10-11", [], snapshots);
  expect(future).toHaveLength(9);
  expect(future.find((v) => v.date === "2026-11-04")).toMatchObject({
    time: "10:30",
    status: "habitual",
  });
  expect(future.find((v) => v.date === "2026-11-02")).toMatchObject({
    time: "08:00",
  });
});

test("cancelled, moved, absent and existing turns suppress habitual duplicates without counting as attendance", () => {
  const visits = [
    entry("2026-11-02", "cancelled"),
    entry("2026-11-04", "rescheduled"),
    entry("2026-11-09", "absent"),
    entry("2026-11-11", "pending"),
  ];
  const result = calendarEntries("2026-11", "2026-10-11", visits, [
    { student, schedule },
  ]);
  expect(result).toHaveLength(9);
  expect(result.filter(countsAsTurn)).toHaveLength(6);
  expect(visits).toHaveLength(4);
  for (const visit of visits)
    expect(result.filter((v) => v.date === visit.date)).toEqual([visit]);
});

test("archived students have no projected turns but their recorded history stays visible", () => {
  const archived = { ...student, archived: true };
  expect(
    calendarEntries(
      "2026-11",
      "2026-10-11",
      [],
      [{ student: archived, schedule }],
    ),
  ).toEqual([]);
  const history = entry("2026-09-01", "closed");
  expect(
    calendarEntries(
      "2026-09",
      "2026-10-11",
      [history],
      [{ student: archived, schedule }],
    ),
  ).toEqual([history]);
});
