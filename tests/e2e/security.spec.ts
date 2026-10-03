import { test, expect } from "@playwright/test";
import {
  accountClient,
  command,
  execute,
  createStudent,
  dropFixture,
} from "../fixtures/cloud";
test("two real JWTs cannot read or mutate each other; replay is idempotent", async () => {
  const a = await createStudent();
  const b = await accountClient(1);
  try {
    const own = await a.client
      .from("students")
      .select("*")
      .eq("id", a.studentId);
    expect(own.data).toHaveLength(1);
    const other = await b.client
      .from("students")
      .select("*", { count: "exact" })
      .eq("id", a.studentId);
    expect(other.data).toEqual([]);
    expect(other.count).toBe(0);
    const spoof = await execute(
      b.client,
      command(
        a.workspaceId,
        a.studentId,
        "update_student",
        { name: "Robado" },
        a.revision,
      ),
    );
    expect(spoof.code).toBe("FORBIDDEN");
    const crossId = await execute(
      b.client,
      command(
        b.workspaceId,
        a.studentId,
        "update_student",
        { name: "Robado" },
        a.revision,
      ),
    );
    expect(crossId.code).toBe("FORBIDDEN");
    const direct = await a.client
      .from("students")
      .update({ name: "Sin auditoría" })
      .eq("id", a.studentId);
    expect(direct.error).not.toBeNull();
    const cmd = command(
      a.workspaceId,
      a.studentId,
      "update_student",
      { name: "Lucía" },
      a.revision,
    );
    const first = await execute(a.client, cmd);
    expect(first.status).toBe("applied");
    const repeat = await execute(a.client, cmd);
    expect(repeat.status).toBe("duplicate");
    expect(repeat.revision).toBe(first.revision);
    const reused = await execute(a.client, {
      ...cmd,
      payload: { name: "Otro" },
    });
    expect(reused.code).toBe("ID_REUSED");
    const stale = await execute(
      a.client,
      command(
        a.workspaceId,
        a.studentId,
        "update_student",
        { name: "Viejo" },
        a.revision,
      ),
    );
    expect(stale.status).toBe("conflict");
    const audit = await a.client
      .from("audit_events")
      .select("id")
      .eq("operation_id", cmd.operationId);
    expect(audit.data).toHaveLength(1);
    const foreignAudit = await b.client
      .from("audit_events")
      .select("*")
      .eq("student_id", a.studentId);
    expect(foreignAudit.data).toEqual([]);
  } finally {
    await dropFixture(a.studentId);
  }
});
