// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { StudentForm } from "../../apps/web/src/features/students/StudentForm";
import type { StudentSnapshot } from "@pulso/domain/contracts";
afterEach(cleanup);
test("profile save uses opening revision even when a remote snapshot arrives while editing", async () => {
  const initial: StudentSnapshot = {
    student: {
      id: crypto.randomUUID(),
      workspace_id: crypto.randomUUID(),
      name: "Ana Pérez",
      first_name: "Ana",
      last_name: "Pérez",
      gender: "femenino",
      alias: "",
      notes: "Original",
      archived: false,
      revision: 7,
      created_at: new Date().toISOString(),
    },
    revision: 7,
    period: null,
    routine: null,
    sessions: [],
    visits: [],
    schedule: null,
  };
  const save = vi.fn(async () => {}),
    cancel = vi.fn();
  const view = render(
    <StudentForm initial={initial} onSave={save} onCancel={cancel} />,
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Notas privadas" }), {
    target: { value: "Mi edición" },
  });
  view.rerender(
    <StudentForm
      initial={{
        ...initial,
        revision: 8,
        student: { ...initial.student, notes: "Cambio remoto", revision: 8 },
      }}
      onSave={save}
      onCancel={cancel}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Guardar ficha" }));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ notes: "Mi edición" }),
      7,
    ),
  );
});
