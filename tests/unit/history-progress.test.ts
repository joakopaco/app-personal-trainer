import { describe, expect, it } from "vitest";
import {
  buildProgress,
  canonicalMuscleGroup,
  loadAllPages,
  type ResultSession,
  type ResultItem,
  type ResultSet,
} from "../../apps/web/src/features/history/history-progress-model";

const set = (values: Partial<ResultSet> = {}): ResultSet => ({
  id: crypto.randomUUID(),
  ordinal: 1,
  state: "done",
  source: "observed",
  weight: 20,
  reps: 10,
  duration_sec: null,
  ...values,
});
const item = (values: Partial<ResultItem> = {}): ResultItem => ({
  id: crypto.randomUUID(),
  name: "Sentadilla",
  type: "load_reps",
  warmup: false,
  skipped: false,
  exercise_id: "sentadilla",
  group: "Cuádriceps",
  session_sets: [set()],
  ...values,
});
const session = (date: string, items = [item()]): ResultSession => ({
  id: crypto.randomUUID(),
  date,
  ended_at: date + "T12:00:00Z",
  session_items: items,
});

describe("history progress", () => {
  it("keeps chronological real values, includes zero load and excludes warmups, omissions and incomplete sets", () => {
    const result = buildProgress([
      session("2026-10-03", [
        item({
          session_sets: [
            set({ weight: 25, reps: 8 }),
            set({ weight: 25, reps: 10 }),
            set({ weight: 900, state: "skipped" }),
            set({ weight: 900, reps: null }),
          ],
        }),
        item({ warmup: true, session_sets: [set({ weight: 999 })] }),
        item({ skipped: true, session_sets: [set({ weight: 999 })] }),
      ]),
      session("2026-10-01", [item({ session_sets: [set({ weight: 0 })] })]),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].points.map((point) => point.value)).toEqual([0, 25]);
    expect(result[0].points[1]).toMatchObject({
      reps: 10,
      sets: 2,
      volume: 450,
    });
  });
  it("never merges different tracking units even when exercise IDs match", () => {
    const result = buildProgress([
      session("2026-10-03", [
        item(),
        item({ type: "reps", session_sets: [set({ weight: null, reps: 18 })] }),
        item({
          type: "time",
          session_sets: [set({ weight: null, reps: null, duration_sec: 60 })],
        }),
      ]),
    ]);
    expect(
      result.map((exercise) => [exercise.unit, exercise.points[0].value]),
    ).toEqual([
      ["kg", 20],
      ["reps", 18],
      ["s", 60],
    ]);
  });
  it("retains separate same-day sessions and combines repeated positions within a session", () => {
    const result = buildProgress([
      session("2026-10-03", [
        item(),
        item({ session_sets: [set({ weight: 30 })] }),
      ]),
      session("2026-10-03"),
    ]);
    expect(result[0].points).toHaveLength(2);
    expect(
      result[0].points.some((point) => point.value === 30 && point.sets === 2),
    ).toBe(true);
  });
  it("normalizes historic muscle names without losing custom muscles", () => {
    expect(canonicalMuscleGroup("  gemelos ")).toBe("Pantorrillas");
    expect(canonicalMuscleGroup("cuadriceps")).toBe("Cuádriceps");
    expect(canonicalMuscleGroup("Grupo propio")).toBe("Grupo propio");
  });
  it("does not invent points for empty or pending sessions", () => {
    expect(
      buildProgress([
        session("2026-10-03", [
          item({ session_sets: [set({ state: "pending" })] }),
        ]),
      ]),
    ).toEqual([]);
  });
});

describe("complete history pagination", () => {
  it("loads past the first page and includes the first and latest records", async () => {
    const records = Array.from({ length: 425 }, (_, index) => index);
    const calls: number[] = [];
    const result = await loadAllPages(async (start, end) => {
      calls.push(start);
      return { data: records.slice(start, end + 1), error: null };
    });
    expect(calls).toEqual([0, 200, 400]);
    expect(result).toEqual({ rows: records, truncated: false });
  });
  it("distinguishes exactly at the cap from truncated and does not silently swallow page errors", async () => {
    const fetch = (length: number) => async (start: number, end: number) => ({
      data: Array.from({ length }, (_, index) => index).slice(start, end + 1),
      error: null,
    });
    expect((await loadAllPages(fetch(400), 200, 400)).truncated).toBe(false);
    expect(await loadAllPages(fetch(401), 200, 400)).toMatchObject({
      truncated: true,
      rows: expect.any(Array),
    });
    await expect(
      loadAllPages(async (start) => ({
        data: start ? null : Array(200).fill(1),
        error: start ? new Error("offline") : null,
      })),
    ).rejects.toThrow("offline");
  });
});
