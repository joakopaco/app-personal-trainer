// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { StudentSnapshot } from "@pulso/domain/contracts";
import { routineFixture } from "../fixtures/routine";

const api = vi.hoisted(() => ({
  useData: vi.fn(),
  cloud: vi.fn(),
  fetchStudent: vi.fn(),
}));
vi.mock("../../apps/web/src/app/DataProvider", () => ({
  useData: api.useData,
}));
vi.mock("../../apps/web/src/adapters/supabase", () => ({ cloud: api.cloud }));
vi.mock("../../apps/web/src/adapters/supabase-gateway", () => ({
  gateway: () => ({ fetchStudent: api.fetchStudent }),
}));
import { RoutineBuilder } from "../../apps/web/src/features/routines/RoutineBuilder";
import { StudentDrafts } from "../../apps/web/src/features/routines/StudentRoutines";
import { TemplateEditor } from "../../apps/web/src/features/routines/TemplateEditor";

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

function setup(
  hasRoutine = true,
  options: {
    local?: boolean;
    offline?: boolean;
    list?: boolean;
    template?: boolean;
  } = {},
) {
  const snapshot: StudentSnapshot = {
    student: {
      id: crypto.randomUUID(),
      workspace_id: crypto.randomUUID(),
      name: "Ana",
      alias: "",
      notes: "",
      archived: false,
      revision: 1,
      created_at: "2026-10-04T12:00:00Z",
    },
    revision: 1,
    period: null,
    routine: hasRoutine
      ? { id: crypto.randomUUID(), document: routineFixture() }
      : null,
    sessions: [],
    visits: [],
  };
  const local = new Map<string, { key: string; value: unknown }>();
  if (options.local) {
    const key =
      (options.template ? "template-draft:" : "draft:") + snapshot.student.id;
    local.set(key, {
      key,
      value: options.template
        ? {
            id: snapshot.student.id,
            document: routineFixture(),
            revision: 0,
            rawValues: {},
          }
        : {
            doc: routineFixture(),
            draftId: crypto.randomUUID(),
            draftRevision: 0,
            base: snapshot.routine?.id ?? null,
            studentRevision: 1,
            rawValues: {},
          },
    });
  }
  const onlineCommand = vi.fn().mockResolvedValue({ ...snapshot, revision: 2 });
  api.fetchStudent.mockResolvedValue(snapshot);
  api.useData.mockReturnValue({
    rows: [
      {
        studentId: snapshot.student.id,
        projection: snapshot,
        confirmed: snapshot,
      },
    ],
    db: {
      scope: { workspaceId: snapshot.student.workspace_id },
      transaction: async (
        _mode: string,
        _table: unknown,
        work: () => Promise<unknown>,
      ) => work(),
      meta: {
        get: async (key: string) => local.get(key),
        put: vi.fn(async (entry: { key: string; value: unknown }) => {
          local.set(entry.key, structuredClone(entry));
        }),
        delete: async (key: string) => {
          local.delete(key);
        },
      },
    },
    onlineCommand,
  });
  api.cloud.mockImplementation(() => ({
    from: (table: string) => {
      const response = {
        data:
          table === "routine_revisions"
            ? { document: snapshot.routine?.document }
            : [],
        error: null,
      };
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: async () => (options.offline ? new Promise(() => {}) : response),
        maybeSingle: async () =>
          options.offline ? new Promise(() => {}) : { data: null, error: null },
        single: async () => response,
        then: (resolve: (value: typeof response) => unknown) =>
          (options.offline
            ? new Promise<typeof response>(() => {})
            : Promise.resolve(response)
          ).then(resolve),
      };
      return chain;
    },
  }));
  render(
    <MemoryRouter initialEntries={["/rutinas/" + snapshot.student.id]}>
      <Routes>
        <Route
          path="/rutinas/:id"
          element={
            options.list ? (
              <StudentDrafts />
            ) : options.template ? (
              <TemplateEditor />
            ) : (
              <RoutineBuilder />
            )
          }
        />
      </Routes>
    </MemoryRouter>,
  );
  return {
    snapshot,
    onlineCommand,
    local,
    db: api.useData.mock.results.at(-1)!.value.db,
  };
}

test("local student drafts open without waiting for an offline cloud query", async () => {
  setup(true, { local: true, offline: true });
  expect(await screen.findByLabelText("Nombre de la rutina")).toBeTruthy();
});

test("local draft discovery renders while the cloud never responds", async () => {
  setup(true, { local: true, offline: true, list: true });
  expect(
    await screen.findByRole("link", { name: "Continuar borrador" }),
  ).toBeTruthy();
});

test("local template drafts open while the cloud never responds", async () => {
  setup(true, { local: true, offline: true, template: true });
  expect(await screen.findByLabelText("Nombre de la rutina")).toBeTruthy();
});

test("a failed local write is not reported saved and can be retried", async () => {
  const { db, local, snapshot } = setup();
  await screen.findByLabelText("Nombre de la rutina");
  db.meta.put.mockRejectedValueOnce(new Error("quota"));
  fireEvent.change(screen.getByLabelText("Nombre de la rutina"), {
    target: { value: "Recuperable" },
  });
  expect(
    await screen.findByText("Cambios sin guardar en este dispositivo"),
  ).toBeTruthy();
  expect(
    screen.queryByText("Borrador guardado en este dispositivo"),
  ).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "Reintentar guardado local" }),
  );
  await waitFor(() =>
    expect(local.get("draft:" + snapshot.student.id)?.value).toMatchObject({
      doc: { name: "Recuperable" },
    }),
  );
  expect(
    await screen.findByText("Borrador guardado en este dispositivo"),
  ).toBeTruthy();
});

test("an ambiguous save freezes editing and retries the exact pending payload", async () => {
  const { onlineCommand, local, snapshot } = setup();
  await screen.findByLabelText("Nombre de la rutina");
  fireEvent.change(screen.getByLabelText("Nombre de la rutina"), {
    target: { value: "Pendiente" },
  });
  onlineCommand.mockImplementationOnce(
    async (_id: string, kind: string, payload: unknown) => {
      const key = "admin:" + snapshot.student.id;
      local.set(key, { key, value: { kind, payload } });
      throw new Error("Lost acknowledgement");
    },
  );
  fireEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));
  const retry = await screen.findByRole("button", {
    name: "Reintentar guardado",
  });
  expect(
    screen.getByLabelText("Nombre de la rutina").closest("fieldset")?.disabled,
  ).toBe(true);
  fireEvent.click(retry);
  await screen.findByText(
    "Borrador guardado. Todavía no cambia la rutina activa.",
  );
  expect(onlineCommand.mock.calls[1][2]).toEqual(
    onlineCommand.mock.calls[0][2],
  );
});

test("a first routine starts with a deliberate choice and stores its working draft", async () => {
  const { snapshot, local } = setup(false);
  fireEvent.click(await screen.findByRole("button", { name: "Crear rutina" }));
  expect(await screen.findByLabelText("Nombre de la rutina")).toBeTruthy();
  expect(screen.queryByLabelText("Punto de partida")).toBeNull();
  expect(
    screen.queryByRole("button", {
      name: /Comparar con|Imprimir|Guardar como/,
    }),
  ).toBeNull();
  expect(
    screen.getByRole("button", { name: "Descartar borrador" }),
  ).toBeTruthy();
  await waitFor(() =>
    expect(local.has("draft:" + snapshot.student.id)).toBe(true),
  );
});

test("a stale save opens comparison automatically and preserves the selected local changes", async () => {
  const { snapshot, onlineCommand, local } = setup();
  await screen.findByLabelText("Nombre de la rutina");
  fireEvent.change(screen.getByLabelText("Nombre de la rutina"), {
    target: { value: "Mi borrador" },
  });
  const remote = structuredClone(snapshot);
  remote.revision = 3;
  remote.routine!.id = crypto.randomUUID();
  remote.routine!.document.name = "Cambio remoto";
  api.fetchStudent.mockResolvedValue(remote);
  onlineCommand.mockRejectedValueOnce(
    new Error("Los datos cambiaron en otro dispositivo."),
  );
  fireEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));
  expect(
    await screen.findByRole("dialog", { name: "Comparar borrador" }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Conservar borrador" }));
  fireEvent.click(
    screen.getByRole("button", {
      name: "Crear borrador revisado",
    }),
  );
  expect(
    (screen.getByLabelText("Nombre de la rutina") as HTMLInputElement).value,
  ).toBe("Mi borrador");
  await waitFor(() =>
    expect(local.get("draft:" + snapshot.student.id)?.value).toMatchObject({
      base: remote.routine!.id,
      studentRevision: 3,
      doc: { name: "Mi borrador" },
    }),
  );
});
