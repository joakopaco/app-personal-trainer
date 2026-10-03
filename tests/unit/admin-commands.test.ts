import "fake-indexeddb/auto";
import { test, expect } from "vitest";
import { LocalStore } from "@pulso/sync/local-db";
import { sendAdministrative } from "@pulso/sync/admin-commands";
import type { CommandEnvelope } from "@pulso/domain/contracts";
test("administrative retry retains its envelope and a late account response cannot clear it", async () => {
  const scope = {
    userId: crypto.randomUUID(),
    workspaceId: crypto.randomUUID(),
  };
  const db = new LocalStore(scope);
  const command: CommandEnvelope = {
    schemaVersion: 1,
    workspaceId: scope.workspaceId,
    studentId: crypto.randomUUID(),
    operationId: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    expectedRevision: 0,
    kind: "create_student",
    capturedAt: new Date().toISOString(),
    payload: { name: "Ana" },
  };
  let active = true;
  const seen: string[] = [];
  const execute = async (c: CommandEnvelope) => {
    seen.push(c.operationId);
    active = false;
    return {
      status: "rejected" as const,
      operationId: c.operationId,
      code: "INVALID",
      message: "Revisar",
    };
  };
  await expect(
    sendAdministrative(db, command, execute, () => active),
  ).rejects.toThrow("cuenta");
  expect((await db.meta.get("admin:" + command.studentId))?.value).toEqual(
    command,
  );
  active = true;
  await expect(
    sendAdministrative(
      db,
      { ...command, operationId: crypto.randomUUID() },
      async (c) => {
        seen.push(c.operationId);
        return {
          status: "rejected",
          operationId: c.operationId,
          code: "INVALID",
          message: "Revisar",
        };
      },
      () => active,
    ),
  ).rejects.toThrow("Revisar");
  expect(seen).toEqual([command.operationId, command.operationId]);
  expect(await db.meta.get("admin:" + command.studentId)).toBeUndefined();
  await db.delete();
});
