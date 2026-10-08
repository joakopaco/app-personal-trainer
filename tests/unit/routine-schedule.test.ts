import { expect, test } from "vitest";
import { routineForSchedule } from "@pulso/domain/routine-schedule";
import { routineFixture } from "../fixtures/routine";
test("creates the student's actual ISO weekdays in all four weeks", () => {
  const doc = routineForSchedule(undefined, [5, 1, 3, 1]);
  for (const week of doc.weeks)
    expect(week.map((d) => d.name)).toEqual(["Lunes", "Miércoles", "Viernes"]);
  expect(new Set(doc.weeks.flat().map((d) => d.id)).size).toBe(12);
});
test("copy fills scheduled days without mutating its source", () => {
  const source = routineFixture(),
    doc = routineForSchedule(source, [2, 4]);
  expect(doc.weeks[0][0].name).toBe("Martes");
  expect(doc.weeks[0][0].blocks[0].exercises[0].name).toBe("Sentadilla");
  expect(doc.weeks[0][1].blocks).toEqual([]);
  expect(source.weeks[0][0].name).toBe("Día 1");
});
test("does not silently drop exercises from a larger source", () => {
  const source = routineForSchedule(undefined, [], 3);
  expect(() => routineForSchedule(source, [1, 3])).toThrow(/más días/);
});
