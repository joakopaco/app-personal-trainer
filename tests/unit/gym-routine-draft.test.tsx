// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { routineFixture } from "../fixtures/routine";
import {
  GymRoutineDraftStorage,
  parseGymRoutineDraft,
  sameGymRoutineBase,
} from "../../apps/web/src/features/gym/routine-draft";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), command: vi.fn() }));
vi.mock("../../apps/web/src/adapters/supabase", () => ({
  cloud: () => ({ rpc: mocks.rpc }),
}));
vi.mock("../../apps/web/src/features/gym/GymContext", () => ({
  useGym: () => ({ access: { mode: "admin", userId: "admin", gymId: "gym" } }),
}));
vi.mock("../../apps/web/src/features/gym/api", async (original) => ({
  ...(await original<object>()),
  command: mocks.command,
}));
import { GymRoutineEditor } from "../../apps/web/src/features/gym/GymRoutines";

const id = "routine",
  key = "pulso-gym-editor:admin:routine:";
let document = routineFixture();
function setup(revision = 2) {
  mocks.rpc.mockResolvedValue({
    data: {
      id,
      revision,
      document,
      draft: document,
      has_draft: true,
      published_revision_id: "published",
      member_id: null,
    },
    error: null,
  });
  return render(
    <MemoryRouter initialEntries={["/gimnasio/rutinas/routine"]}>
      <Routes>
        <Route path="/gimnasio/rutinas/:id" element={<GymRoutineEditor />} />
        <Route path="/gimnasio/rutinas" element={<p>Volviste al catálogo</p>} />
      </Routes>
    </MemoryRouter>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  document = routineFixture();
});
afterEach(cleanup);

test("invalid numeric text and an unfinished name survive reload without changing their saved numbers", async () => {
  const view = setup();
  const weight = await screen.findByRole("textbox", { name: "Peso kg" });
  fireEvent.change(weight, { target: { value: "1," } });
  await waitFor(() =>
    expect(JSON.parse(localStorage.getItem(key)!).rawValues).toEqual({
      [document.weeks[0][0].blocks[0].exercises[0].id + ":weight"]: "1,",
    }),
  );
  const encoded = JSON.parse(localStorage.getItem(key)!);
  encoded.document.name = "";
  localStorage.setItem(key, JSON.stringify(encoded));
  view.unmount();
  setup();
  expect(
    (
      (await screen.findByRole("textbox", {
        name: "Peso kg",
      })) as HTMLInputElement
    ).value,
  ).toBe("1,");
  expect(
    screen
      .getByRole("textbox", { name: "Peso kg" })
      .getAttribute("aria-invalid"),
  ).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));
  expect(mocks.command).not.toHaveBeenCalled();
  expect(parseGymRoutineDraft(localStorage.getItem(key)!).document.name).toBe(
    "",
  );
  expect(
    parseGymRoutineDraft(localStorage.getItem(key)!).document.weeks[0][0]
      .blocks[0].exercises[0].prescription.weight,
  ).toBe(20);
});

test("stale local drafts require an explicit choice before rebasing on the newest revision", async () => {
  const local = structuredClone(document);
  local.name = "Mis cambios";
  const encoded = JSON.stringify({
    base: JSON.stringify(document),
    baseRevision: 1,
    document: local,
  });
  localStorage.setItem(key, encoded);
  setup(4);
  await screen.findByRole("heading", {
    name: "Tenés dos versiones de esta rutina",
  });
  expect(localStorage.getItem(key)).toBe(encoded);
  expect(
    (
      screen.getByRole("button", {
        name: "Guardar borrador",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Revisar mis cambios" }));
  await waitFor(() =>
    expect(
      screen.queryByRole("heading", {
        name: "Tenés dos versiones de esta rutina",
      }),
    ).toBeNull(),
  );
  mocks.command.mockResolvedValue({ id, revision: 5 });
  fireEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));
  await waitFor(() =>
    expect(mocks.command).toHaveBeenCalledWith(
      "save_routine",
      {
        id,
        expectedRevision: 4,
        document: local,
      },
      expect.any(String),
    ),
  );
  await screen.findByText("Borrador guardado. Publicalo cuando esté listo.");
});

test("publication with a lost response retries the identical command after reload", async () => {
  mocks.command.mockRejectedValueOnce(new Error("Failed to fetch"));
  const view = setup();
  await screen.findByRole("textbox", { name: "Peso kg" });
  fireEvent.click(screen.getByRole("button", { name: "Publicar rutina" }));
  await screen.findByRole("button", { name: "Reintentar publicación" });
  const first = mocks.command.mock.calls[0];
  expect(JSON.parse(localStorage.getItem(key)!).pending.operationId).toBe(
    first[2],
  );
  view.unmount();
  setup(3);
  mocks.command.mockResolvedValue({ id, revision: 3 });
  fireEvent.click(
    await screen.findByRole("button", { name: "Reintentar publicación" }),
  );
  await screen.findByText("Volviste al catálogo");
  expect(mocks.command.mock.calls[1]).toEqual(first);
  expect(localStorage.getItem(key)).toBeNull();
});

test("discard with a lost response remains retryable with its original operation ID", async () => {
  mocks.command.mockRejectedValueOnce(new Error("Failed to fetch"));
  setup();
  await screen.findByRole("textbox", { name: "Peso kg" });
  fireEvent.click(screen.getByRole("button", { name: "Descartar borrador" }));
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "Descartar borrador",
    }),
  );
  await screen.findByRole("button", { name: "Reintentar descarte" });
  const first = mocks.command.mock.calls[0];
  mocks.command.mockResolvedValue({ id, revision: 3 });
  fireEvent.click(screen.getByRole("button", { name: "Reintentar descarte" }));
  await screen.findByText("Volviste al catálogo");
  expect(mocks.command.mock.calls[1]).toEqual(first);
});

test("publication points to the exact incomplete week and day", async () => {
  document.weeks[2][0].blocks = [];
  setup();
  await screen.findByRole("textbox", { name: "Peso kg" });
  fireEvent.click(screen.getByRole("button", { name: "Publicar rutina" }));
  expect(screen.getByRole("alert").textContent).toBe(
    "Semana 3 · Día 1: agregá al menos un ejercicio",
  );
  expect(mocks.command).not.toHaveBeenCalled();
});

test("versioned local writes reject stale tabs, including after a draft is consumed", async () => {
  const first = new GymRoutineDraftStorage(key),
    second = new GymRoutineDraftStorage(key);
  await first.read();
  await second.read();
  const snapshot = { base: "", document, rawValues: {}, pending: null };
  await first.write(snapshot);
  await expect(second.write(snapshot)).rejects.toThrow("otra pestaña");
  await second.read();
  await first.remove();
  await expect(second.write(snapshot)).rejects.toThrow("otra pestaña");
  expect(localStorage.getItem(key)).toBeNull();
});

test("queued local writes capture the raw snapshot before references change", async () => {
  const storage = new GymRoutineDraftStorage(key);
  await storage.read();
  const snapshot = {
    base: "",
    document,
    rawValues: { weight: "1," },
    pending: null,
  };
  const write = storage.write(snapshot);
  snapshot.rawValues.weight = "30";
  await write;
  expect(JSON.parse(localStorage.getItem(key)!).rawValues.weight).toBe("1,");
});

test("a lost save response freezes editing and retries the original document and revision", async () => {
  mocks.command.mockRejectedValueOnce(new Error("Failed to fetch"));
  const view = setup();
  fireEvent.change(await screen.findByRole("textbox", { name: "Peso kg" }), {
    target: { value: "30" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));
  await screen.findByRole("button", { name: "Reintentar guardado" });
  const first = mocks.command.mock.calls[0];
  expect(
    first[1].document.weeks[0][0].blocks[0].exercises[0].prescription.weight,
  ).toBe(30);
  view.unmount();
  setup(3);
  mocks.command.mockResolvedValue({ id, revision: 3 });
  fireEvent.click(
    await screen.findByRole("button", { name: "Reintentar guardado" }),
  );
  await screen.findByText("Borrador guardado. Publicalo cuando esté listo.");
  expect(mocks.command.mock.calls[1]).toEqual(first);
});

test("revision conflicts preserve local changes and open the version recovery choice", async () => {
  mocks.command.mockRejectedValueOnce({ code: "40001" });
  setup();
  fireEvent.change(await screen.findByRole("textbox", { name: "Peso kg" }), {
    target: { value: "30" },
  });
  mocks.rpc.mockResolvedValue({
    data: { id, revision: 7, document, draft: document },
    error: null,
  });
  fireEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));
  await screen.findByRole("heading", {
    name: "Tenés dos versiones de esta rutina",
  });
  const saved = parseGymRoutineDraft(localStorage.getItem(key)!);
  expect(saved.pending).toBeNull();
  expect(
    saved.document.weeks[0][0].blocks[0].exercises[0].prescription.weight,
  ).toBe(30);
});

test("seven-day legacy routines remain editable but cannot be published until reorganized", async () => {
  document.weeks[0] = Array.from({ length: 7 }, (_, index) => ({
    id: crypto.randomUUID(),
    name: "Día " + (index + 1),
    blocks: [],
  }));
  setup();
  await screen.findByText("Borrador guardado");
  fireEvent.click(screen.getByRole("button", { name: "Publicar rutina" }));
  expect(screen.getByRole("alert").textContent).toContain(
    "Semana 1: organizá los ejercicios en un máximo de 6 días",
  );
  expect(mocks.command).not.toHaveBeenCalled();
  expect(document.weeks[0]).toHaveLength(7);
});

test("malformed local recovery remains exportable until choosing the server version", async () => {
  localStorage.setItem(key, "not-json");
  setup();
  await screen.findByRole("heading", {
    name: "Conservamos una preparación que no pudimos abrir",
  });
  expect(localStorage.getItem(key)).toBe("not-json");
  expect(
    screen.getByRole("button", { name: "Exportar copia local" }),
  ).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "Usar versión del servidor" }),
  );
  await waitFor(() => expect(localStorage.getItem(key)).toBeNull());
});

test("a storage failure sends no command and can be retried without losing raw input", async () => {
  setup();
  const weight = await screen.findByRole("textbox", { name: "Peso kg" });
  const write = vi
    .spyOn(Storage.prototype, "setItem")
    .mockImplementation(() => {
      throw new Error("quota");
    });
  fireEvent.change(weight, { target: { value: "1," } });
  await screen.findByRole("button", { name: "Reintentar guardado local" });
  expect(mocks.command).not.toHaveBeenCalled();
  expect(
    screen.queryByText("Preparación guardada en este dispositivo"),
  ).toBeNull();
  write.mockRestore();
  fireEvent.click(
    screen.getByRole("button", { name: "Reintentar guardado local" }),
  );
  await waitFor(() =>
    expect(JSON.parse(localStorage.getItem(key)!).rawValues).toEqual({
      [document.weeks[0][0].blocks[0].exercises[0].id + ":weight"]: "1,",
    }),
  );
});

test("a pending discard can be recovered even after its deleted routine can no longer load", async () => {
  const pending = {
    operationId: crypto.randomUUID(),
    kind: "discard_routine",
    payload: { id, expectedRevision: 2 },
  };
  localStorage.setItem(
    key,
    JSON.stringify({ base: JSON.stringify(document), document, pending }),
  );
  setup();
  mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501" } });
  mocks.command.mockResolvedValue({ id, revision: 3 });
  fireEvent.click(
    await screen.findByRole("button", { name: "Reintentar descarte" }),
  );
  await screen.findByText("Volviste al catálogo");
  expect(mocks.command).toHaveBeenCalledWith(
    pending.kind,
    pending.payload,
    pending.operationId,
  );
});

test("server routine remains visible when local storage cannot be read", async () => {
  const read = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("storage disabled");
  });
  setup();
  try {
    expect(
      (
        (await screen.findByRole("textbox", {
          name: "Peso kg",
        })) as HTMLInputElement
      ).value,
    ).toBe("20");
    expect(
      screen.getByRole("button", { name: "Exportar mis cambios" }),
    ).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain(
      "No se pudo guardar",
    );
  } finally {
    read.mockRestore();
  }
});

test("jsonb object key reordering does not create a false draft conflict", () => {
  const reordered = JSON.parse(JSON.stringify(document), (_key, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).reverse())
      : value,
  );
  expect(JSON.stringify(reordered)).not.toBe(JSON.stringify(document));
  expect(sameGymRoutineBase(JSON.stringify(reordered), document)).toBe(true);
  reordered.name = "Changed";
  expect(sameGymRoutineBase(JSON.stringify(reordered), document)).toBe(false);
});

test("an unavailable localStorage getter rejects operations without crashing construction or the editor", async () => {
  const getter = vi
    .spyOn(globalThis, "localStorage", "get")
    .mockImplementation(() => {
      throw new DOMException("Storage access is blocked", "SecurityError");
    });
  try {
    const storage = new GymRoutineDraftStorage(key);
    expect(getter).not.toHaveBeenCalled();
    await expect(storage.read()).rejects.toMatchObject({
      name: "SecurityError",
    });
    await expect(
      storage.write({ base: "", document, rawValues: {}, pending: null }),
    ).rejects.toMatchObject({ name: "SecurityError" });
    await expect(storage.remove()).rejects.toMatchObject({
      name: "SecurityError",
    });
    setup();
    expect(
      (
        (await screen.findByRole("textbox", {
          name: "Peso kg",
        })) as HTMLInputElement
      ).value,
    ).toBe("20");
    expect(
      screen.getByRole("button", { name: "Exportar mis cambios" }),
    ).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain(
      "No se pudo guardar",
    );
  } finally {
    getter.mockRestore();
  }
});
