// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { useRef, useState } from "react";
import { RoutineFields } from "../../apps/web/src/features/routines/RoutineFields";
import { routineFixture } from "../fixtures/routine";
vi.mock("../../apps/web/src/adapters/supabase", () => ({
  cloud: () => ({
    from: () => ({ select: () => Promise.resolve({ data: [] }) }),
  }),
}));
afterEach(cleanup);
test("turning progression off preserves explicitly cleared first-series targets", () => {
  render(<Editor />);
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Progresión por serie" }),
  );
  fireEvent.change(screen.getByLabelText("Peso kg · serie 1"), {
    target: { value: "" },
  });
  fireEvent.change(screen.getByLabelText("Repeticiones · serie 1"), {
    target: { value: "" },
  });
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Progresión por serie" }),
  );
  expect((screen.getByLabelText("Peso kg") as HTMLInputElement).value).toBe("");
  expect(
    (screen.getByLabelText("Repeticiones") as HTMLSelectElement).value,
  ).toBe("");
  expect(
    within(screen.getByLabelText("Repeticiones"))
      .getAllByRole("option")
      .map((o) => o.getAttribute("value")),
  ).toEqual(["", "4", "6", "8", "10", "12"]);
});
function Editor({ schedule }: { schedule?: number[] }) {
  const [doc, change] = useState(routineFixture);
  return (
    <RoutineFields
      doc={doc}
      change={change}
      busy={false}
      rawValues={useRef({})}
      rawInvalid={useRef(new Set<string>())}
      scheduledWeekdays={schedule}
    />
  );
}
test("template add and duplicate cannot exceed six days", () => {
  render(<Editor />);
  const add = screen.getByRole("button", { name: "+ Día" });
  for (let n = 0; n < 7; n++) fireEvent.click(add);
  expect(add.hasAttribute("disabled")).toBe(true);
  expect(
    within(screen.getByLabelText("Días")).getAllByRole("button"),
  ).toHaveLength(7);
  expect(
    screen
      .getByRole("button", { name: "Duplicar día" })
      .hasAttribute("disabled"),
  ).toBe(true);
});
test("scheduled students cannot add arbitrary days", () => {
  render(<Editor schedule={[1, 3, 5]} />);
  expect(screen.queryByRole("button", { name: "+ Día" })).toBeNull();
});
test("presets and per-set progression are accessible and macro target is block only", () => {
  render(<Editor />);
  expect(screen.queryByLabelText("Aplicar macro")).toBeNull();
  expect(
    within(screen.getByLabelText("Series"))
      .getAllByRole("option")
      .map((o) => o.getAttribute("value")),
  ).toEqual(["", "1", "2", "3", "4"]);
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Progresión por serie" }),
  );
  expect(screen.getByLabelText("Peso kg · serie 2")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Series"), { target: { value: "4" } });
  expect(screen.getByLabelText("Repeticiones · serie 4")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Series"), { target: { value: "1" } });
  expect(screen.queryByLabelText("Repeticiones · serie 2")).toBeNull();
});

test("legacy invalid numeric annotations can be corrected with the new preset controls", () => {
  const doc = routineFixture(),
    b = doc.weeks[0][0].blocks[0],
    e = b.exercises[0];
  const rawValues = {
    current: {
      [e.id + ":sets"]: "abc",
      [e.id + ":reps"]: "abc",
      [e.id + ":microRest"]: "1,",
      [b.id + ":macroRest"]: "1,",
    },
  };
  const rawInvalid = { current: new Set(Object.keys(rawValues.current)) };
  render(
    <RoutineFields
      doc={doc}
      change={() => {}}
      busy={false}
      rawValues={rawValues}
      rawInvalid={rawInvalid}
    />,
  );
  for (const [label, value] of [
    ["Series", "3"],
    ["Repeticiones", "10"],
    ["Descanso", "60"],
    ["Descanso del bloque", "180"],
  ])
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  expect(rawValues.current).toEqual({});
  expect(rawInvalid.current.size).toBe(0);
});

test("changing the series count does not clear an invalid weight and progression preserves it", () => {
  render(<Editor />);
  fireEvent.change(screen.getByLabelText("Peso kg"), {
    target: { value: "abc" },
  });
  fireEvent.change(screen.getByLabelText("Series"), { target: { value: "4" } });
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Progresión por serie" }),
  );
  expect(
    (screen.getByLabelText("Peso kg · serie 1") as HTMLInputElement).value,
  ).toBe("abc");
  expect(
    screen.getByLabelText("Peso kg · serie 1").getAttribute("aria-invalid"),
  ).toBe("true");
});
