// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useAgendaRange } from "../../apps/web/src/features/agenda/useAgendaVisits";

const mocks = vi.hoisted(() => ({
  range: vi.fn(),
  gte: vi.fn(),
  lte: vi.fn(),
  rows: [] as unknown[],
}));
vi.mock("@pulso/domain/dates", () => ({ todayKey: () => "2026-10-11" }));
vi.mock("../../apps/web/src/app/DataProvider", () => ({
  useData: () => ({ rows: mocks.rows }),
}));
vi.mock("../../apps/web/src/adapters/supabase", () => ({
  cloud: () => ({ from: () => ({ select: () => ({ gte: mocks.gte }) }) }),
}));
const studentId = "f52cfdbe-e0f7-45cb-9121-7bdc647c8701";
const visit = (id: string, date: string) => ({
  id,
  date,
  student_id: studentId,
  time: "09:30",
  status: "pending",
  source: "manual",
  rescheduled_from: null,
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.gte.mockReturnValue({ lte: mocks.lte });
  mocks.lte.mockReturnValue({ order: () => ({ range: mocks.range }) });
  mocks.rows = [
    {
      studentId,
      confirmed: { revision: 1 },
      projection: {
        student: { id: studentId, name: "Ana" },
        visits: [visit(crypto.randomUUID(), "2026-10-11")],
      },
    },
  ];
});
afterEach(cleanup);

test("nearby month uses local projections without querying once per day", () => {
  const { result } = renderHook(() =>
    useAgendaRange("2026-10-01", "2026-10-31"),
  );
  expect(result.current.visits).toHaveLength(1);
  expect(result.current.loading).toBe(false);
  expect(mocks.range).not.toHaveBeenCalled();
});

test("distant month fetches every page and keeps unrelated cached visits", async () => {
  mocks.range
    .mockResolvedValueOnce({
      data: Array.from({ length: 200 }, () =>
        visit(crypto.randomUUID(), "2027-01-10"),
      ),
      error: null,
    })
    .mockResolvedValueOnce({
      data: [visit(crypto.randomUUID(), "2027-01-11")],
      error: null,
    });
  const { result } = renderHook(() =>
    useAgendaRange("2027-01-01", "2027-01-31"),
  );
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.visits).toHaveLength(201);
  expect(result.current.allVisits).toHaveLength(202);
  expect(mocks.gte).toHaveBeenCalledWith("date", "2027-01-01");
  expect(mocks.lte).toHaveBeenCalledWith("date", "2027-01-31");
  expect(mocks.range).toHaveBeenLastCalledWith(200, 399);
});

test("a failed month exposes retry instead of silently reporting an empty agenda", async () => {
  mocks.range
    .mockResolvedValueOnce({ data: null, error: new Error("offline") })
    .mockResolvedValueOnce({
      data: [visit(crypto.randomUUID(), "2027-01-11")],
      error: null,
    });
  const { result } = renderHook(() =>
    useAgendaRange("2027-01-01", "2027-01-31"),
  );
  await waitFor(() =>
    expect(result.current.error).toContain("Revisá la conexión"),
  );
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.visits).toHaveLength(1));
  expect(result.current.error).toBe("");
});

test("late response from a previous month cannot replace the selected month", async () => {
  let finish!: (value: unknown) => void;
  mocks.range
    .mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    )
    .mockResolvedValueOnce({
      data: [visit(crypto.randomUUID(), "2027-02-11")],
      error: null,
    });
  const { result, rerender } = renderHook(
    ({ month }) => useAgendaRange(month + "-01", month + "-28"),
    { initialProps: { month: "2027-01" } },
  );
  rerender({ month: "2027-02" });
  await waitFor(() =>
    expect(result.current.visits[0]?.date).toBe("2027-02-11"),
  );
  await act(async () =>
    finish({ data: [visit(crypto.randomUUID(), "2027-01-11")], error: null }),
  );
  expect(result.current.visits[0].date).toBe("2027-02-11");
});
