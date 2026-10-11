import { describe, expect, it } from "vitest";
import {
  sessionDate,
  progressCsv,
} from "../../apps/web/src/features/gym/progress-model";

describe("gym progress calendar dates", () => {
  it("keeps late-night sessions in their local day across month/year boundaries", () => {
    expect(
      sessionDate("2027-01-01T01:30:00Z", "America/Argentina/Buenos_Aires"),
    ).toBe("2026-12-31");
    expect(
      sessionDate("2026-03-01T02:00:00Z", "America/Argentina/Buenos_Aires"),
    ).toBe("2026-02-28");
    expect(
      sessionDate("2026-10-11T03:01:00Z", "America/Argentina/Buenos_Aires"),
    ).toBe("2026-10-11");
  });
  it("exports values with spreadsheet-safe names and preserves zero load", () => {
    const csv = progressCsv("=1+1", [
      {
        key: "x",
        exerciseId: "x",
        name: "Press; banco",
        group: "Pecho",
        type: "load_reps",
        unit: "kg",
        points: [
          {
            sessionId: "s",
            date: "2026-10-11",
            value: 0,
            reps: 12,
            sets: 1,
            volume: 0,
            source: "member",
          },
        ],
      },
    ]);
    expect(csv).toContain("'=1+1");
    expect(csv).toContain('"Press; banco"');
    expect(csv).toContain(';"0";"kg";"12";"1";"0"');
  });
});
