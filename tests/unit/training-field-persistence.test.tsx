// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { SessionItem, TrainingSession } from "@pulso/domain/contracts";

const api = vi.hoisted(() => ({ useData: vi.fn(), download: vi.fn() }));
vi.mock("../../apps/web/src/components/download", () => ({
  download: api.download,
}));
vi.mock("../../apps/web/src/app/DataProvider", () => ({
  useData: api.useData,
}));
vi.mock("../../apps/web/src/adapters/supabase", () => ({ cloud: vi.fn() }));
import {
  LiveInput,
  SetEditor,
} from "../../apps/web/src/features/live/TrainingScreen";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
beforeEach(() => vi.clearAllMocks());
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const set = {
  id: "set-1",
  ordinal: 1,
  state: "pending",
  source: "pending",
  weight: 20,
  reps: 10,
  duration_sec: null,
} as SessionItem["sets"][number];
const item = {
  id: "item-1",
  sets: [set],
  prescription: {
    weight: 20,
    reps: 10,
    sets: 1,
    durationSec: null,
    microRest: 60,
  },
} as SessionItem;
const session = { id: "session-1" } as TrainingSession;
function setup(
  kind: "set" | "live",
  get = vi.fn().mockResolvedValue(undefined),
) {
  const capture = vi.fn().mockResolvedValue(undefined);
  const status = vi.fn(),
    error = vi.fn();
  api.useData.mockReturnValue({
    db: { rawInputs: { get }, captureRaw: capture, read: vi.fn() },
    sync: vi.fn(),
  });
  render(
    kind === "set" ? (
      <SetEditor
        set={set}
        type="load_reps"
        disabled={false}
        studentId="student-1"
        sessionId={session.id}
        itemId={item.id}
        onFieldState={status}
      />
    ) : (
      <LiveInput
        field="microRest"
        label="Descanso"
        value={60}
        item={item}
        session={session}
        scope="session_only"
        studentId="student-1"
        disabled={false}
        onFieldState={status}
        onError={error}
      />
    ),
  );
  return {
    capture,
    status,
    error,
    get,
    control: screen.getByLabelText(
      kind === "set" ? "Peso serie 1" : "Descanso",
    ) as HTMLInputElement | HTMLSelectElement,
  };
}

test.each(["set", "live"] as const)(
  "%s keeps navigation unsafe until the last queued write completes",
  async (kind) => {
    const { capture, status, control } = setup(kind);
    await waitFor(() => expect(control.disabled).toBe(false));
    const first = deferred(),
      second = deferred();
    capture
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    fireEvent.change(control, {
      target: { value: kind === "set" ? "25" : "3" },
    });
    fireEvent.change(control, {
      target: { value: kind === "set" ? "30" : "5" },
    });
    await waitFor(() => expect(capture).toHaveBeenCalledTimes(1));
    await act(async () => first.resolve());
    expect(capture).toHaveBeenCalledTimes(2);
    expect(status.mock.calls.map((args) => args[1])).toEqual([
      "writing",
      "writing",
    ]);
    await act(async () => second.resolve());
    expect(status.mock.calls.at(-1)?.[1]).toBeNull();
  },
);

test.each(["set", "live"] as const)(
  "%s ignores an obsolete failure and reports the latest failed write",
  async (kind) => {
    const { capture, status, control } = setup(kind);
    await waitFor(() => expect(control.disabled).toBe(false));
    const first = deferred(),
      second = deferred();
    capture
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    fireEvent.change(control, {
      target: { value: kind === "set" ? "25" : "3" },
    });
    fireEvent.change(control, {
      target: { value: kind === "set" ? "30" : "5" },
    });
    await waitFor(() => expect(capture).toHaveBeenCalledTimes(1));
    await act(async () => first.reject(Error("older write failed")));
    expect(status.mock.calls.map((args) => args[1])).toEqual([
      "writing",
      "writing",
    ]);
    await act(async () => second.reject(Error("latest write failed")));
    expect(status.mock.calls.at(-1)?.[1]).toBe("failed");
  },
);

test.each(["set", "live"] as const)(
  "%s waits for draft hydration before accepting input",
  async (kind) => {
    const stored = deferred<unknown>();
    const { control, capture } = setup(
      kind,
      vi.fn().mockReturnValue(stored.promise),
    );
    expect(control.disabled).toBe(true);
    fireEvent.change(control, {
      target: { value: kind === "set" ? "99" : "5" },
    });
    expect(capture).not.toHaveBeenCalled();
    await act(async () =>
      stored.resolve(
        kind === "set"
          ? {
              raw: JSON.stringify({ weight: "35", reps: "8", duration: "" }),
              baseValue: set,
            }
          : { raw: "min:3" },
      ),
    );
    expect(control.disabled).toBe(false);
    expect(control.value).toBe(kind === "set" ? "35" : "3");
  },
);

test.each(["set", "live"] as const)(
  "%s can retry a failed hydration without overwriting the saved draft",
  async (kind) => {
    const get = vi
      .fn()
      .mockRejectedValueOnce(Error("read failed"))
      .mockResolvedValueOnce(
        kind === "set"
          ? {
              raw: JSON.stringify({ weight: "35", reps: "8", duration: "" }),
              baseValue: set,
            }
          : { raw: "min:3" },
      );
    const { control, capture } = setup(kind, get);
    const retry = await screen.findByRole("button", {
      name:
        kind === "set"
          ? "Reintentar carga de serie 1"
          : "Reintentar carga de descanso",
    });
    expect(control.disabled).toBe(true);
    fireEvent.click(retry);
    await waitFor(() => expect(control.disabled).toBe(false));
    expect(control.value).toBe(kind === "set" ? "35" : "3");
    expect(capture).not.toHaveBeenCalled();
  },
);

test("a durable recorded set releases volatile state even if background synchronization fails", async () => {
  const { control, status } = setup("set");
  const data = api.useData();
  data.db.read = vi.fn().mockResolvedValue({ confirmed: { revision: 1 } });
  data.db.stage = vi.fn().mockResolvedValue(undefined);
  data.makeCommand = vi.fn().mockReturnValue({ kind: "record_set" });
  const sync = deferred();
  data.sync = vi.fn().mockReturnValue(sync.promise);
  await waitFor(() => expect(control.disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Registrar serie 1" }));
  await waitFor(() => expect(data.db.stage).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(data.sync).toHaveBeenCalledTimes(1));
  expect(status.mock.calls.map((args) => args[1])).toEqual(["writing", null]);
  await act(async () => sync.reject(Error("outbox lease failed")));
  expect(status.mock.calls.map((args) => args[1])).toEqual(["writing", null]);
  expect(screen.queryByRole("alert")).toBeNull();
});

test("discard disables editing until its storage transaction finishes", async () => {
  const saved = {
    raw: JSON.stringify({ weight: "35", reps: "8", duration: "" }),
    baseValue: set,
  };
  const { control, capture } = setup("set", vi.fn().mockResolvedValue(saved));
  const data = api.useData(),
    pending = deferred();
  data.db.discardRaw = vi.fn().mockReturnValue(pending.promise);
  await waitFor(() => expect(control.disabled).toBe(false));
  fireEvent.click(
    screen.getByRole("button", { name: "Descartar edición de serie 1" }),
  );
  await waitFor(() => expect(data.db.discardRaw).toHaveBeenCalledWith(saved));
  expect(control.disabled).toBe(true);
  expect(
    screen
      .getByRole("button", { name: "Registrar serie 1" })
      .hasAttribute("disabled"),
  ).toBe(true);
  await act(async () => pending.resolve());
  expect(control.disabled).toBe(false);
  expect(control.value).toBe("20");
  expect(capture).not.toHaveBeenCalled();
});

test.each(["{broken-json", "null", '{"weight":20}'])(
  "an unreadable set draft (%s) has a safe export/discard recovery path",
  async (raw) => {
    const saved = { id: "draft", raw, baseValue: set };
    const get = vi.fn().mockResolvedValue(saved);
    const { control, capture } = setup("set", get);
    const data = api.useData();
    data.db.discardRaw = vi.fn().mockImplementation(async () => {
      get.mockResolvedValue(undefined);
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const recover = await screen.findByRole("button", {
      name: "Exportar y descartar anotación de serie 1",
    });
    expect(control.disabled).toBe(true);
    fireEvent.click(recover);
    await waitFor(() => expect(control.disabled).toBe(false));
    expect(api.download).toHaveBeenCalledWith(
      "pulso-anotacion-pendiente.json",
      saved,
    );
    expect(data.db.discardRaw).toHaveBeenCalledWith(saved);
    expect(control.value).toBe("20");
    expect(capture).not.toHaveBeenCalled();
  },
);
