import { describe, expect, it } from "vitest";
import {
  formatRestMinutes,
  parseRestMinutes,
  restoreRestRaw,
  storeRestRaw,
} from "../../apps/web/src/components/rest-minutes";

describe("rest minutes at the UI boundary", () => {
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
