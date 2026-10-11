// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { GymSession } from "../../apps/web/src/features/gym/api";
import {
  initialTrainingResults,
  recoverTrainingDraft,
  trainingSetError,
} from "../../apps/web/src/features/gym/training-state";
const mocks = vi.hoisted(() => ({ command: vi.fn(), latest: vi.fn() }));
vi.mock("../../apps/web/src/features/gym/GymContext", () => ({
  useGym: () => ({ access: { userId: "member", name: "Ana" } }),
}));
vi.mock("../../apps/web/src/features/gym/api", async (original) => ({
  ...(await original<object>()),
  command: mocks.command,
  useResource: () => ({
    value: null,
    error: "",
    loading: false,
    reload: vi.fn(),
  }),
}));
vi.mock("../../apps/web/src/adapters/supabase", () => ({
  cloud: () => ({
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        single: mocks.latest,
      };
      return query;
    },
  }),
}));
import { GymTrainingSession } from "../../apps/web/src/features/gym/MemberTraining";
const key = "pulso-gym-session:member:session";
const fixture = (): GymSession => ({
  id: "session",
  member_id: "member",
  routine_name: "Fuerza",
  routine_revision_id: "routine",
  week: 0,
  revision: 0,
  status: "open",
  started_at: "2026-10-10",
  finished_at: null,
  results: [],
  day: {
    id: "day",
    name: "Día 1",
    blocks: [
      {
        id: "block",
        name: "Principal",
        type: "main",
        macroRest: 120,
        macroTarget: "blocks",
        exercises: [
          {
            id: "position",
            lineageId: "lineage",
            exerciseId: "squat",
            name: "Sentadilla",
            group: "Piernas",
            type: "load_reps",
            warmup: false,
            prescription: {
              weight: 20,
              reps: 10,
              sets: 2,
              durationSec: null,
              microRest: 90,
              progression: [
                { weight: 20, reps: 12 },
                { weight: 25, reps: 8 },
              ],
            },
          },
        ],
      },
    ],
  },
});
const show = (session = fixture()) =>
  render(
    <MemoryRouter>
      <GymTrainingSession initial={session} />
    </MemoryRouter>,
  );
beforeEach(() => {
  localStorage.clear();
  mocks.command.mockReset();
  mocks.latest.mockReset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test("recovers a lost save response even when server jsonb changes property order", () => {
  const session = fixture(),
    results = initialTrainingResults(session);
  results[0].sets[0].confirmed = true;
  const pending = {
    operationId: crypto.randomUUID(),
    kind: "save_session",
    payload: { id: session.id, expectedRevision: 0, results },
  };
  session.results = results.map((r) => ({
    sets: r.sets.map((s) => ({
      confirmed: s.confirmed,
      durationSec: s.durationSec,
      reps: s.reps,
      weight: s.weight,
    })),
    skipped: r.skipped,
    positionId: r.positionId,
  }));
  session.revision = 1;
  const recovered = recoverTrainingDraft(
    JSON.stringify({ results, revision: 0, pending }),
    session,
  );
  expect(recovered.conflict).toBe(false);
  expect(recovered.dirty).toBe(false);
  expect(recovered.pending).toBeNull();
});
test("stale drafts preserve visible local results and original revision for review", () => {
  const session = fixture(),
    results = initialTrainingResults(session);
  results[0].sets[0].weight = 44;
  session.revision = 3;
  const recovered = recoverTrainingDraft(
    JSON.stringify({ results, revision: 0, pending: null }),
    session,
  );
  expect(recovered.conflict).toBe(true);
  expect(recovered.results[0].sets[0].weight).toBe(44);
  expect(recovered.revision).toBe(0);
});
test("malformed or unrelated pending requests cannot overwrite or dispatch from recovery", () => {
  const session = fixture(),
    results = initialTrainingResults(session);
  expect(recoverTrainingDraft('{"results":[]}', session).conflict).toBe(true);
  expect(
    recoverTrainingDraft(
      JSON.stringify({
        results,
        revision: 0,
        pending: {
          operationId: crypto.randomUUID(),
          kind: "finish_session",
          payload: { id: "another-session", expectedRevision: 0, results },
        },
      }),
      session,
    ).conflict,
  ).toBe(true);
});
test("confirmation validates values while unfinished drafts remain recoverable", () => {
  const set = { weight: null, reps: 10, durationSec: null, confirmed: false };
  expect(trainingSetError(set, "load_reps")).toBeNull();
  expect(trainingSetError(set, "load_reps", true)).toContain("peso");
  expect(trainingSetError({ ...set, weight: 2.345 }, "load_reps")).toContain(
    "decimales",
  );
  expect(trainingSetError({ ...set, reps: 1.2 }, "reps")).toContain(
    "repeticiones",
  );
});
test("progression rows lock after confirmation and require explicit correction", async () => {
  const user = userEvent.setup();
  show();
  const first = screen.getByLabelText(
    "Peso serie 1 de Sentadilla",
  ) as HTMLInputElement;
  expect(first.value).toBe("20");
  expect(
    (screen.getByLabelText("Peso serie 2 de Sentadilla") as HTMLInputElement)
      .value,
  ).toBe("25");
  await user.click(screen.getByLabelText("Confirmar serie 1 de Sentadilla"));
  expect(first.disabled).toBe(true);
  await user.click(
    screen.getByRole("button", { name: "Corregir serie 1 de Sentadilla" }),
  );
  expect(first.disabled).toBe(false);
  fireEvent.change(first, { target: { value: "30" } });
  expect(JSON.parse(localStorage.getItem(key)!).results[0].sets[0].weight).toBe(
    30,
  );
  expect(mocks.command).not.toHaveBeenCalled();
});
test("local cleanup errors do not retry an already successful remote save", async () => {
  mocks.command.mockResolvedValue({ id: "session", revision: 1 });
  const user = userEvent.setup();
  show();
  await user.click(screen.getByLabelText("Confirmar serie 1 de Sentadilla"));
  vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
    throw Error("blocked");
  });
  await user.click(
    screen.getByRole("button", { name: "Guardar entrenamiento" }),
  );
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Guardar entrenamiento",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true),
  );
  expect(screen.getByText("Guardado")).toBeTruthy();
  expect(screen.getByText(/El entrenamiento está guardado/)).toBeTruthy();
  expect(mocks.command).toHaveBeenCalledTimes(1);
});
test("lost responses retry the identical operation and lock editing until acknowledged", async () => {
  mocks.command
    .mockRejectedValueOnce(Error("Failed to fetch"))
    .mockResolvedValueOnce({ id: "session", revision: 1 });
  const user = userEvent.setup();
  show();
  await user.click(screen.getByLabelText("Confirmar serie 1 de Sentadilla"));
  await user.click(
    screen.getByRole("button", { name: "Guardar entrenamiento" }),
  );
  await screen.findByText(/Pulsá Guardar entrenamiento para reintentar/);
  expect(
    (
      screen.getByLabelText("Peso serie 2 de Sentadilla") as HTMLInputElement
    ).closest("fieldset")!.disabled,
  ).toBe(true);
  await user.click(
    screen.getByRole("button", { name: "Guardar entrenamiento" }),
  );
  await waitFor(() => expect(mocks.command).toHaveBeenCalledTimes(2));
  expect(mocks.command.mock.calls[1]).toEqual(mocks.command.mock.calls[0]);
});
test("reload restores unconfirmed edits and skipped exercises without confirming them", () => {
  const session = fixture(),
    results = initialTrainingResults(session);
  results[0].skipped = true;
  results[0].sets[1].weight = 37.5;
  localStorage.setItem(
    key,
    JSON.stringify({ results, revision: 0, pending: null }),
  );
  show(session);
  expect(
    (screen.getByLabelText("Peso serie 2 de Sentadilla") as HTMLInputElement)
      .value,
  ).toBe("37.5");
  expect(
    (screen.getByLabelText("No se realizó") as HTMLInputElement).checked,
  ).toBe(true);
  expect(
    (
      screen.getByLabelText(
        "Confirmar serie 2 de Sentadilla",
      ) as HTMLInputElement
    ).checked,
  ).toBe(false);
});
test("exercise and block rests start their own prescribed duration", async () => {
  const user = userEvent.setup();
  show();
  await user.click(
    screen.getByRole("button", {
      name: "Iniciar descanso entre series de Sentadilla",
    }),
  );
  await waitFor(() =>
    expect(screen.getByRole("timer").textContent).toBe("1:30"),
  );
  await user.click(
    screen.getByRole("button", {
      name: "Iniciar descanso del bloque Principal",
    }),
  );
  await waitFor(() =>
    expect(screen.getByRole("timer").textContent).toBe("2:00"),
  );
});
test("a cross-tab draft change preserves current values and requires reconciliation", async () => {
  show();
  fireEvent.change(screen.getByLabelText("Peso serie 1 de Sentadilla"), {
    target: { value: "41" },
  });
  fireEvent(
    window,
    new StorageEvent("storage", {
      key,
      storageArea: localStorage,
      newValue: "different",
    }),
  );
  expect(screen.getByText("Revisar versiones")).toBeTruthy();
  expect(
    (screen.getByLabelText("Peso serie 1 de Sentadilla") as HTMLInputElement)
      .value,
  ).toBe("41");
  expect(
    (
      screen.getByRole("button", {
        name: "Guardar entrenamiento",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
});

test("a pending finish retries finalization rather than silently turning into a save", async () => {
  mocks.command
    .mockRejectedValueOnce(Error("Failed to fetch"))
    .mockResolvedValueOnce({ id: "session", revision: 1 });
  const user = userEvent.setup();
  show();
  await user.click(
    screen.getByRole("button", { name: "Finalizar entrenamiento" }),
  );
  await user.click(
    screen.getByRole("button", { name: "Confirmar finalización" }),
  );
  await screen.findByText("Sin conexión. Reintentá cuando vuelva la conexión.");
  await user.click(screen.getByRole("button", { name: "Seguir entrenando" }));
  await user.click(
    screen.getByRole("button", { name: "Guardar entrenamiento" }),
  );
  await waitFor(() => expect(mocks.command).toHaveBeenCalledTimes(2));
  expect(mocks.command.mock.calls[0][0]).toBe("finish_session");
  expect(mocks.command.mock.calls[1]).toEqual(mocks.command.mock.calls[0]);
});
test("failed local writes retain editable values and allow explicit remote saving", async () => {
  mocks.command.mockResolvedValue({ id: "session", revision: 1 });
  show();
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw Error("quota");
  });
  fireEvent.change(screen.getByLabelText("Peso serie 1 de Sentadilla"), {
    target: { value: "38" },
  });
  expect(
    screen.getByText(/No se pudo conservar en este dispositivo/),
  ).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "Guardar entrenamiento" }),
  );
  await waitFor(() => expect(screen.getByText("Guardado")).toBeTruthy());
  expect(mocks.command.mock.calls[0][1].results[0].sets[0].weight).toBe(38);
});
test("an in-flight save never removes a newer draft written by another tab", async () => {
  let complete!: (v: unknown) => void;
  mocks.command.mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  const user = userEvent.setup();
  show();
  fireEvent.change(screen.getByLabelText("Peso serie 1 de Sentadilla"), {
    target: { value: "38" },
  });
  await user.click(
    screen.getByRole("button", { name: "Guardar entrenamiento" }),
  );
  const other = JSON.stringify({
    results: initialTrainingResults(fixture()),
    revision: 0,
    pending: null,
  });
  localStorage.setItem(key, other);
  complete({ id: "session", revision: 1 });
  await waitFor(() =>
    expect(screen.getByText("Revisar versiones")).toBeTruthy(),
  );
  expect(localStorage.getItem(key)).toBe(other);
});
