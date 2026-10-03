import { test, expect } from "@playwright/test";
import { prepared } from "../fixtures/prepared";
import {
  accountClient,
  adminClient,
  command,
  execute,
  dropFixture,
} from "../fixtures/cloud";

test("concurrent monthly renewal and session starts produce one period and one open session", async () => {
  const a = await prepared(),
    b = await accountClient();
  try {
    const session = a.snapshot.sessions[0],
      month = a.snapshot.period.month;
    const oldMonth = new Date(
      Number(month.slice(0, 4)),
      Number(month.slice(5, 7)) - 2,
      15,
      12,
    )
      .toISOString()
      .slice(0, 7);
    expect(
      (
        await adminClient()
          .from("routine_periods")
          .update({ month: oldMonth })
          .eq("id", session.period_id)
      ).error,
    ).toBeNull();
    const deferred = await execute(
      a.client,
      command(
        a.workspaceId,
        a.studentId,
        "ensure_period",
        { requestedMonth: month },
        a.snapshot.revision,
      ),
    );
    expect(deferred.status).toBe("applied");
    expect(deferred.patch.period.month).toBe(oldMonth);
    const closed = await execute(
      a.client,
      command(
        a.workspaceId,
        a.studentId,
        "finish_session",
        {
          sessionId: session.id,
          quickConfirmItemIds: session.items.map((i: { id: string }) => i.id),
          allowEmpty: false,
        },
        deferred.revision,
      ),
    );
    expect(closed.status).toBe("applied");
    const renew = () =>
      command(
        a.workspaceId,
        a.studentId,
        "ensure_period",
        { requestedMonth: month },
        closed.revision,
      );
    const renewals = await Promise.all([
      execute(a.client, renew()),
      execute(b.client, renew()),
    ]);
    expect(renewals.map((r) => r.status).sort()).toEqual([
      "applied",
      "conflict",
    ]);
    const current = renewals.find((r) => r.status === "applied");
    expect(current.patch.period.continued_from).toBe(session.period_id);
    const periods = await a.client
      .from("routine_periods")
      .select("id")
      .eq("student_id", a.studentId)
      .eq("month", month);
    expect(periods.data).toHaveLength(1);
    const start = () =>
      command(
        a.workspaceId,
        a.studentId,
        "start_session",
        {
          sessionId: crypto.randomUUID(),
          periodId: current.patch.period.id,
          routineRevisionId: current.patch.routine.id,
          dayId: current.patch.routine.document.weeks[0][0].id,
          week: 1,
          date: month + "-03",
          time: "18:00",
          timezone: "America/Argentina/Buenos_Aires",
        },
        current.revision,
      );
    const starts = await Promise.all([
      execute(a.client, start()),
      execute(b.client, start()),
    ]);
    expect(starts.map((r) => r.status).sort()).toEqual(["applied", "conflict"]);
    const open = await a.client
      .from("sessions")
      .select("id")
      .eq("student_id", a.studentId)
      .eq("status", "open");
    expect(open.data).toHaveLength(1);
  } finally {
    await dropFixture(a.studentId);
  }
});
