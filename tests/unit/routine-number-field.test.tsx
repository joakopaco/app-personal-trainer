// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RoutineNumberField } from "../../apps/web/src/components/RoutineNumberField";
import { RoutineSummary } from "../../apps/web/src/features/routines/RoutineSummary";
import { routineFixture } from "../fixtures/routine";

afterEach(cleanup);

test("rest editing sends seconds while retaining raw comma and invalid draft text", () => {
  const changes: (number | null)[] = [],
    raw: string[] = [];
  const props = {
    label: "Descanso (min)",
    field: "microRest" as const,
    value: 90,
    onChange: (value: number | null) => changes.push(value),
    onRaw: (value: string) => raw.push(value),
  };
  const view = render(<RoutineNumberField {...props} />);
  const input = screen.getByLabelText("Descanso (min)") as HTMLInputElement;
  expect(input.value).toBe("1.5");
  expect(input.inputMode).toBe("decimal");
  fireEvent.change(input, { target: { value: "0,5" } });
  expect(changes).toEqual([30]);
  expect(raw).toEqual(["0,5"]);
  expect(input.value).toBe("0,5");
  fireEvent.change(input, { target: { value: "1," } });
  expect(changes).toEqual([30]);
  expect(input.getAttribute("aria-invalid")).toBe("true");
  view.unmount();
  render(<RoutineNumberField {...props} value={30} rawValue={raw.at(-1)} />);
  const restored = screen.getByLabelText("Descanso (min)") as HTMLInputElement;
  expect(restored.value).toBe("1,");
  expect(restored.getAttribute("aria-invalid")).toBe("true");
  fireEvent.change(restored, { target: { value: "" } });
  expect(changes).toEqual([30, null]);
});

test("saved routines show exercise prescriptions and rest minutes for the selected week", () => {
  const doc = routineFixture();
  doc.weeks[1][0].blocks[0].exercises[0].name = "Remo";
  render(<RoutineSummary document={doc} />);
  expect(screen.getByText("Sentadilla")).toBeTruthy();
  expect(
    screen.getByText(/Descanso 1 min 30 s al terminar el bloque/),
  ).toBeTruthy();
  expect(screen.getByText("1 min")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Semana 2" }));
  expect(screen.getByText("Remo")).toBeTruthy();
  expect(screen.queryByText("Sentadilla")).toBeNull();
});
