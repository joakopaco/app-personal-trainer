export function serializeDraftRecovery(studentId: string, snapshot: unknown) {
  return JSON.stringify(
    {
      format: "pulso-draft-recovery",
      version: 1,
      studentId,
      exportedAt: new Date().toISOString(),
      snapshot,
    },
    null,
    2,
  );
}

export function downloadDraftRecovery(studentId: string, snapshot: unknown) {
  const url = URL.createObjectURL(
    new Blob([serializeDraftRecovery(studentId, snapshot)], {
      type: "application/json",
    }),
  );
  const link = window.document.createElement("a");
  link.href = url;
  link.download = `pulso-borrador-${studentId}.json`;
  window.document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
