// Operational counters only. Never include names, notes, values, JWTs or payloads.
export function queueHealth(
  operations: readonly {
    state: string;
    attempts: number;
    command: { capturedAt: string };
  }[],
  now = Date.now(),
) {
  return {
    pending: operations.length,
    conflicts: operations.filter((o) => o.state === "conflict").length,
    rejected: operations.filter((o) => o.state === "rejected").length,
    needsRetry: operations.filter((o) => o.attempts >= 5).length,
    oldestSeconds: operations.length
      ? Math.max(
          0,
          ...operations.map((o) =>
            Math.floor((now - Date.parse(o.command.capturedAt)) / 1000),
          ),
        )
      : 0,
  };
}
