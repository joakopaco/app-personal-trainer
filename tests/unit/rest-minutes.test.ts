import { describe, expect, it } from "vitest";
import {
  formatRestMinutes,
  formatRestDuration,
  parseRestMinutes,
  restoreRestRaw,
  storeRestRaw,
} from "../../apps/web/src/components/rest-minutes";

describe("rest minutes at the UI boundary", () => {
  it("presents whole and mixed minute durations without decimal minutes", () => {
    for (const [seconds, label] of [
      [0, "0 s"],
      [30, "30 s"],
      [60, "1 min"],
      [61, "1 min 1 s"],
      [75, "1 min 15 s"],
      [90, "1 min 30 s"],
      [180, "3 min"],
      [300, "5 min"],
      [3600, "60 min"],
    ] as const)
      expect(formatRestDuration(seconds)).toBe(label);
    expect(formatRestDuration(null)).toBe("—");
  });
  it("converts comma and decimal minutes to integer seconds", () => {
    expect(parseRestMinutes("0,5")).toEqual({ ok: true, value: 30 });
    expect(parseRestMinutes("1.25")).toEqual({ ok: true, value: 75 });
    expect(parseRestMinutes("0.55")).toEqual({ ok: true, value: 33 });
    expect(parseRestMinutes("0")).toEqual({ ok: true, value: 0 });
    expect(parseRestMinutes("60")).toEqual({ ok: true, value: 3600 });
    expect(parseRestMinutes("")).toEqual({ ok: true, value: null });
  });
  it("rejects invalid inputs and fractional seconds instead of rounding", () => {
    for (const raw of [
      "abc",
      "-1",
      "1,",
      "1.001",
      "60.5",
      "1e2",
      " ",
      "0.000000000001",
    ]) {
      expect(parseRestMinutes(raw), raw).toEqual({ ok: false });
    }
  });
  it("round trips every supported legacy duration without losing seconds", () => {
    for (let seconds = 0; seconds <= 3600; seconds++) {
      expect(parseRestMinutes(formatRestMinutes(seconds))).toEqual({
        ok: true,
        value: seconds,
      });
    }
    expect(formatRestMinutes(null)).toBe("");
    expect(formatRestMinutes(90)).toBe("1.5");
  });
  it("preserves minute drafts verbatim and recognizes older second drafts", () => {
    for (const raw of ["0,5", "1,", "abc", ""]) {
      expect(restoreRestRaw(storeRestRaw(raw))).toBe(raw);
    }
    expect(restoreRestRaw("90")).toBe("1.5");
    expect(restoreRestRaw("abc")).toBe("abc");
    expect(parseRestMinutes(restoreRestRaw("0.5"))).toEqual({ ok: false });
  });
});
