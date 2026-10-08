import { parseNumber, type NumericField } from "@pulso/domain/numbers";

export const isRestField = (field: NumericField) =>
  field === "microRest" || field === "macroRest";

export function formatRestMinutes(seconds: number | null): string {
  return seconds === null ? "" : String(seconds / 60);
}

/** Read-only presentation; draft minute parsing/serialization stays unchanged. */
export function formatRestDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return "—";
  const minutes = Math.floor(seconds / 60),
    remainder = seconds % 60;
  if (!minutes) return `${remainder} s`;
  return `${minutes} min${remainder ? ` ${remainder} s` : ""}`;
}

export function parseRestMinutes(raw: string): ReturnType<typeof parseNumber> {
  if (raw === "") return { ok: true, value: null };
  const normalized = raw.replace(",", ".");
  if (!/^(0|[1-9]\d*)(\.\d+)?$/.test(normalized) || normalized.length > 40)
    return { ok: false };
  const [whole, fraction = ""] = normalized.split(".");
  const scale = 10n ** BigInt(fraction.length);
  const numerator = BigInt(whole + fraction) * 60n;
  if (numerator > 3600n * scale) return { ok: false };
  if (numerator % scale === 0n)
    return { ok: true, value: Number(numerator / scale) };
  // A legacy integer second may have a repeating decimal in minutes.
  // Accept its exact JS display representation; never round a new duration.
  const nearest = Math.round(Number(normalized) * 60);
  return normalized === formatRestMinutes(nearest)
    ? { ok: true, value: nearest }
    : { ok: false };
}

export function parseDisplayedNumber(field: NumericField, raw: string) {
  return isRestField(field) ? parseRestMinutes(raw) : parseNumber(field, raw);
}

export function displayNumber(field: NumericField, value: number | null) {
  return isRestField(field)
    ? formatRestMinutes(value)
    : value === null
      ? ""
      : String(value);
}

// Version raw input locally so old second-based drafts are never reinterpreted.
export const storeRestRaw = (raw: string) => "min:" + raw;
export function restoreRestRaw(raw: string): string {
  if (raw.startsWith("min:")) return raw.slice(4);
  const legacy = parseNumber("microRest", raw);
  if (legacy.ok) return formatRestMinutes(legacy.value);
  return /^\d+[.,]\d*$/.test(raw) ? raw + " s" : raw;
}
