export function volume(
  rows: {
    weight: number | null;
    reps: number | null;
    type: string;
    state: string;
    warmup: boolean;
  }[],
): number {
  return (
    Math.round(
      rows.reduce(
        (sum, s) =>
          sum +
          (s.type === "load_reps" && s.state === "done" && !s.warmup
            ? (s.weight ?? 0) * (s.reps ?? 0)
            : 0),
        0,
      ) * 100,
    ) / 100
  );
}
export function csvCell(value: string) {
  return (
    '"' +
    (/^[\s]*[=+@-]/.test(value) ? "'" + value : value).replaceAll('"', '""') +
    '"'
  );
}
