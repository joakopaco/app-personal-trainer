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
import type { RoutineDocument } from "@pulso/domain/routines";
vi.mock("../../apps/web/src/features/routines/ExercisePalette", () => ({ ExercisePalette: () => null }));

vi.mock("../../apps/web/src/adapters/supabase", () => ({
  cloud: () => ({
    from: () => ({ select: () => Promise.resolve({ data: [] }) }),
  }),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
let latest: RoutineDocument;
let pending: Record<string, string>;
function Editor({ schedule }: { schedule?: number[] }) {
  const [doc, setDoc] = useState(() => {
    const next = routineFixture();
    next.weeks.forEach((week, i) => {
      week[0].name = `Día ${i + 1}`;
      week[0].blocks.forEach((block) => {
        block.macroTarget = "blocks";
      });
    });
    return next;
  });
  latest = doc;
  const raw = useRef<Record<string, string>>({
    [doc.weeks[0][0].blocks[0].exercises[0].id + ":weight"]: "1,",
  });
  pending = raw.current;
  return (
    <RoutineFields
      doc={doc}
      change={setDoc}
      busy={false}
      rawValues={raw}
      rawInvalid={useRef(new Set(Object.keys(raw.current)))}
      scheduledWeekdays={schedule}
    />
  );
}

test("week copy replaces only selected destinations, preserves linkage and pending input, and supports earlier weeks", () => {
  render(<Editor />);
  const source = structuredClone(latest.weeks[0]);
  const untouched = structuredClone(latest.weeks[2]);
  fireEvent.click(screen.getByRole("button", { name: "Copiar semana 1 a…" }));
  const panel = screen.getByRole("dialog", { name: "Copiar semana 1" });
  fireEvent.click(within(panel).getByRole("checkbox", { name: "Semana 3" }));
  fireEvent.click(within(panel).getByRole("checkbox", { name: "Semana 4" }));
  fireEvent.click(
    within(panel).getByRole("button", { name: "Copiar a 1 semana" }),
  );
  expect(latest.weeks[0]).toEqual(source);
  expect(latest.weeks[2]).toEqual(untouched);
  expect(latest.weeks[1][0].name).toBe(source[0].name);
  const original = source[0].blocks[0].exercises[0];
  const copied = latest.weeks[1][0].blocks[0].exercises[0];
  expect(copied.id).not.toBe(original.id);
  expect(copied.lineageId).toBe(original.lineageId);
  expect(pending[copied.id + ":weight"]).toBe("1,");
  fireEvent.click(screen.getByRole("button", { name: "Semana 4" }));
  fireEvent.click(screen.getByRole("button", { name: "Copiar semana 4 a…" }));
  const backwards = screen.getByRole("dialog", { name: "Copiar semana 4" });
  expect(
    within(backwards)
      .getByRole("button", { name: "Elegí una semana" })
      .hasAttribute("disabled"),
  ).toBe(true);
  fireEvent.click(
    within(backwards).getByRole("checkbox", { name: "Semana 1" }),
  );
  fireEvent.click(
    within(backwards).getByRole("button", { name: "Copiar a 1 semana" }),
  );
  expect(latest.weeks[0][0].name).toBe("Día 4");
});

test("day toolbar renames, duplicates, reorders both ways and respects the six-day cap", () => {
  render(<Editor />);
  fireEvent.click(screen.getByRole("button", { name: "Renombrar día" }));
  fireEvent.change(screen.getByLabelText("Nombre del día"), {
    target: { value: "Tren superior" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Guardar nombre" }));
  expect(latest.weeks[0][0].name).toBe("Tren superior");
  fireEvent.click(screen.getByRole("button", { name: "Duplicar día" }));
  expect(latest.weeks[0]).toHaveLength(2);
  expect(latest.weeks[0][1].name).toBe("Tren superior (copia)");
  fireEvent.click(screen.getByRole("button", { name: "Mover día antes" }));
  expect(latest.weeks[0][0].name).toBe("Tren superior (copia)");
  fireEvent.click(screen.getByRole("button", { name: "Mover día después" }));
  expect(latest.weeks[0][1].name).toBe("Tren superior (copia)");
  for (let i = 0; i < 5; i++)
    fireEvent.click(screen.getByRole("button", { name: "+ Día" }));
  expect(latest.weeks[0]).toHaveLength(6);
  expect(
    screen
      .getByRole("button", { name: "Duplicar día" })
      .hasAttribute("disabled"),
  ).toBe(true);
});

test("scheduled days retain their names and order and copy panel closes with Escape", () => {
  render(<Editor schedule={[1, 3, 5]} />);
  expect(screen.queryByRole("button", { name: "Renombrar día" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Duplicar día" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Eliminar día" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Copiar semana 1 a…" }));
  fireEvent.keyDown(screen.getByRole("dialog", { name: "Copiar semana 1" }), {
    key: "Escape",
  });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Copiar semana 1 a…" }),
  );
});

test("canceling copy and rename preserves the draft; deleting requires confirmation and retains one day", () => {
  render(<Editor />);
  const original = structuredClone(latest);
  fireEvent.click(screen.getByRole("button", { name: "Copiar semana 1 a…" }));
  fireEvent.click(
    within(screen.getByRole("dialog", { name: "Copiar semana 1" })).getByRole(
      "button",
      { name: "Cancelar" },
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Renombrar día" }));
  fireEvent.change(screen.getByLabelText("Nombre del día"), {
    target: { value: "No guardar" },
  });
  fireEvent.keyDown(screen.getByLabelText("Nombre del día"), { key: "Escape" });
  expect(latest).toEqual(original);
  expect(
    screen
      .getByRole("button", { name: "Eliminar día" })
      .hasAttribute("disabled"),
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Duplicar día" }));
  const confirmation = vi
    .spyOn(window, "confirm")
    .mockReturnValueOnce(false)
    .mockReturnValueOnce(true);
  fireEvent.click(screen.getByRole("button", { name: "Eliminar día" }));
  expect(latest.weeks[0]).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Eliminar día" }));
  expect(confirmation).toHaveBeenCalledWith(
    "¿Eliminar «Día 1 (copia)» y sus bloques de la semana 1?",
  );
  expect(latest.weeks[0]).toHaveLength(1);
  expect(latest.weeks[0][0].name).toBe("Día 1");
});
