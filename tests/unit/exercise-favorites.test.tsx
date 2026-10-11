// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { LocalStore } from "@pulso/sync/local-db";
import type { LibraryCommand } from "../../apps/web/src/adapters/library";
import { catalog } from "@pulso/domain/catalog";

const api = vi.hoisted(() => ({
  db: null as LocalStore | null,
  select: vi.fn(),
  rpc: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock("../../apps/web/src/app/DataProvider", () => ({
  useData: () => ({ db: api.db }),
}));
vi.mock("../../apps/web/src/adapters/supabase", () => ({
  cloud: () => ({
    from: (table: string) => ({
      select: () => {
        const result = api.select(table);
        return { then: result.then.bind(result), eq: () => result };
      },
    }),
    rpc: api.rpc,
    auth: { getSession: api.getSession },
  }),
}));
import { ExerciseLibrary } from "../../apps/web/src/features/catalog/ExerciseLibrary";

const exercise = catalog.find(
  (entry) => entry.name === "Sentadilla con barra",
)!;
const star = () =>
  screen.getByRole("button", {
    name: "Favorito " + exercise.name,
  }) as HTMLButtonElement;
let persisted: Set<string>;

beforeEach(async () => {
  vi.resetAllMocks();
  persisted = new Set();
  api.db = new LocalStore({
    userId: crypto.randomUUID(),
    workspaceId: crypto.randomUUID(),
  });
  await api.db.open();
  api.getSession.mockResolvedValue({
    data: { session: { user: { id: api.db.scope.userId } } },
    error: null,
  });
  api.select.mockImplementation(async (table: string) => ({
    data:
      table === "exercise_favorites"
        ? [...persisted].map((exercise_id) => ({ exercise_id }))
        : [],
    error: null,
  }));
  api.rpc.mockImplementation(
    async (_name: string, { command }: { command: LibraryCommand }) => {
      if (command.payload.enabled)
        persisted.add(command.payload.exerciseId as string);
      else persisted.delete(command.payload.exerciseId as string);
      return { data: command.payload, error: null };
    },
  );
});
afterEach(async () => {
  cleanup();
  await api.db!.delete();
});
async function openLibrary() {
  const view = render(<ExerciseLibrary />);
  fireEvent.change(screen.getByLabelText("Buscar ejercicio"), {
    target: { value: exercise.name },
  });
  await waitFor(() =>
    expect(api.select).toHaveBeenCalledWith("exercise_favorites"),
  );
  await waitFor(() => expect(star().disabled).toBe(false));
  return view;
}

test("a confirmed favorite updates its star even when subsequent reads fail", async () => {
  await openLibrary();
  api.select.mockResolvedValue({
    data: null,
    error: { message: "Connection lost" },
  });
  fireEvent.click(star());
  await waitFor(() => expect(star().getAttribute("aria-pressed")).toBe("true"));
  expect(persisted.has(exercise.id)).toBe(true);
  expect(await api.db!.meta.get("library-pending")).toBeUndefined();
  fireEvent.click(star());
  await waitFor(() =>
    expect(star().getAttribute("aria-pressed")).toBe("false"),
  );
  expect(persisted.has(exercise.id)).toBe(false);
});

test("failed favorite loading is visible and retry restores the actual saved state before toggling", async () => {
  persisted.add(exercise.id);
  const read = api.select.getMockImplementation()!;
  api.select.mockImplementation(async (table: string) =>
    table === "exercise_favorites"
      ? { data: null, error: { message: "Connection lost" } }
      : read(table),
  );
  render(<ExerciseLibrary />);
  fireEvent.change(screen.getByLabelText("Buscar ejercicio"), {
    target: { value: exercise.name },
  });
  await screen.findByText(/No se pudieron cargar tus favoritos/);
  expect(star().disabled).toBe(true);
  api.select.mockImplementation(read);
  fireEvent.click(screen.getByRole("button", { name: "Reintentar carga" }));
  await waitFor(() => expect(star().getAttribute("aria-pressed")).toBe("true"));
  expect(star().disabled).toBe(false);
});

test("rapid favorite clicks stay blocked until one confirmed operation completes", async () => {
  await openLibrary();
  let confirm!: () => void;
  const gate = new Promise<void>((resolve) => {
    confirm = resolve;
  });
  const save = api.rpc.getMockImplementation()!;
  api.rpc.mockImplementation(async (...args) => {
    await gate;
    return save(...args);
  });
  fireEvent.click(star());
  fireEvent.click(star());
  expect(star().disabled).toBe(true);
  await waitFor(() => expect(api.rpc).toHaveBeenCalledTimes(1));
  confirm();
  await waitFor(() => expect(star().getAttribute("aria-pressed")).toBe("true"));
  expect(star().disabled).toBe(false);
  expect(api.rpc).toHaveBeenCalledTimes(1);
});

test("an uncertain favorite survives remount and retry reuses the original operation", async () => {
  const view = await openLibrary();
  const save = api.rpc.getMockImplementation()!;
  api.rpc.mockResolvedValueOnce({
    data: null,
    error: { message: "Failed to fetch", code: "" },
  });
  fireEvent.click(star());
  await screen.findByRole("button", {
    name: "Reintentar guardado",
  });
  const pending = (await api.db!.meta.get("library-pending"))!
    .value as LibraryCommand;
  expect(star().getAttribute("aria-pressed")).toBe("false");
  view.unmount();
  render(<ExerciseLibrary />);
  fireEvent.change(screen.getByLabelText("Buscar ejercicio"), {
    target: { value: exercise.name },
  });
  const retry = await screen.findByRole("button", {
    name: "Reintentar guardado",
  });
  api.rpc.mockImplementation(save);
  fireEvent.click(retry);
  await waitFor(() => expect(star().getAttribute("aria-pressed")).toBe("true"));
  expect(api.rpc.mock.calls.at(-1)?.[1]).toEqual({ command: pending });
  expect(await api.db!.meta.get("library-pending")).toBeUndefined();
});

test("retry waits for the opening snapshot so stale reads cannot undo a confirmed favorite", async () => {
  await api.db!.meta.put({
    key: "library-pending",
    value: {
      workspaceId: api.db!.scope.workspaceId,
      operationId: crypto.randomUUID(),
      kind: "favorite",
      payload: { exerciseId: exercise.id, enabled: true },
    },
  });
  let finishRead!: (value: unknown) => void;
  const openingRead = new Promise((resolve) => {
    finishRead = resolve;
  });
  const read = api.select.getMockImplementation()!;
  api.select.mockImplementation((table: string) =>
    table === "exercise_favorites" ? openingRead : read(table),
  );
  render(<ExerciseLibrary />);
  fireEvent.change(screen.getByLabelText("Buscar ejercicio"), {
    target: { value: exercise.name },
  });
  const retry = (await screen.findByRole("button", {
    name: "Reintentar guardado",
  })) as HTMLButtonElement;
  expect(retry.disabled).toBe(true);
  finishRead({ data: [], error: null });
  await waitFor(() => expect(retry.disabled).toBe(false));
  fireEvent.click(retry);
  await waitFor(() => expect(star().getAttribute("aria-pressed")).toBe("true"));
});

test("saved favorites can be filtered and disappear from that list when removed", async () => {
  persisted.add(exercise.id);
  await openLibrary();
  fireEvent.change(screen.getByLabelText("Buscar ejercicio"), {
    target: { value: "" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Solo favoritos" }));
  expect(screen.getAllByRole("article")).toHaveLength(1);
  fireEvent.click(star());
  await waitFor(() => expect(screen.queryAllByRole("article")).toHaveLength(0));
  expect(persisted.has(exercise.id)).toBe(false);
});
