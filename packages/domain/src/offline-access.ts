export const OFFLINE_WINDOW_MS = 24 * 60 * 60 * 1000;
export function offlineAccess(
  raw: string | null,
  userId: string,
  now = Date.now(),
  serverCode = "",
): { userId: string; workspaceId: string } | null {
  if (["42501", "PGRST301", "PGRST302", "PGRST303"].includes(serverCode))
    return null;
  try {
    const v = JSON.parse(raw ?? "null");
    if (
      v?.userId !== userId ||
      typeof v.workspaceId !== "string" ||
      !Number.isFinite(v.verifiedAt) ||
      now < v.verifiedAt ||
      now - v.verifiedAt >= OFFLINE_WINDOW_MS
    )
      return null;
    return { userId, workspaceId: v.workspaceId };
  } catch {
    return null;
  }
}
