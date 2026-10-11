// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { validateRoutine } from "@pulso/domain/routines";
import { routineFixture } from "../fixtures/routine";
import { RoutineSummary } from "../../apps/web/src/features/routines/RoutineSummary";

afterEach(cleanup);

test("one complete exercise per day is sufficient to activate a routine", () => {
  const doc = routineFixture();
  expect(
    doc.weeks.every((week) => week[0].blocks[0].exercises.length === 1),
  ).toBe(true);
  expect(validateRoutine(doc, true)).toEqual([]);
});

test("activation points to the exact empty week and numbered day", () => {
  const doc = routineFixture();
  doc.weeks[2][0].name = "Martes";
  doc.weeks[2][0].blocks = [];
  expect(validateRoutine(doc, true)).toEqual([
    "Semana 3 · Día 1: agregá al menos un ejercicio",
  ]);
  expect(validateRoutine(doc, false)).toEqual([]);
});

test("saved routine names never replace numbered day navigation", () => {
  const doc = routineFixture();
  doc.weeks[0][0].name = "Martes";
  render(<RoutineSummary document={doc} />);
  expect(screen.getByRole("button", { name: "Día 1" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Día 1" })).toBeTruthy();
  expect(screen.queryByText("Martes")).toBeNull();
});
