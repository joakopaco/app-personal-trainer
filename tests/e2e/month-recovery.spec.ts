import { test, expect } from "@playwright/test";
import { prepared } from "../fixtures/prepared";
import { v5 } from "uuid";
import { adminClient, command, execute, dropFixture } from "../fixtures/cloud";
test("reviewed old-month edits close original history without changing the current routine", async () => {
  const a = await prepared();
  const session = a.snapshot.sessions[0];
  const oldMonth = new Date(
    new Date().getFullYear(),
    new Date().getMonth() - 1,
    1,
    12,
  )
    .toISOString()
    .slice(0, 7);
  try {
    await adminClient()
      .from("routine_periods")
      .update({ month: oldMonth })
      .eq("id", session.period_id);
    await adminClient()
      .from("sessions")
      .update({ date: oldMonth + "-15" })
      .eq("id", session.id);
    const before = await a.client
      .from("routine_revisions")
      .select("document")
      .eq("id", session.routine_revision_id)
      .single();
    const edit = command(
      a.workspaceId,
      a.studentId,
      "adjust_prescription",
      {
        sessionId: session.id,
        itemId: session.items[0].id,
        field: "weight",
        value: 44,
        scope: "session_and_future",
      },
      a.snapshot.revision,
    );
    expect((await execute(a.client, edit)).status).toBe("rejected");
    const reconcile = command(
      a.workspaceId,
      a.studentId,
      "reconcile_offline_session",
      {
        sessionId: session.id,
        reason: "Recuperación revisada del mes anterior",
        operations: [edit],
        quickConfirmItemIds: session.items.map((i: { id: string }) => i.id),
      },
      a.snapshot.revision,
    );
    const result = await execute(a.client, reconcile);
    expect(result.status).toBe("applied");
    expect((await execute(a.client, reconcile)).status).toBe("duplicate");
    const sets = await a.client
      .from("session_sets")
      .select("weight,source")
      .eq("session_id", session.id);
    expect(sets.data?.map((s) => s.weight)).toEqual([44, 44]);
    const original = await a.client
      .from("routine_revisions")
      .select("document")
      .eq("id", session.routine_revision_id)
      .single();
    expect(original.data).toEqual(before.data);
    const closed = await a.client
      .from("sessions")
      .select("status,period_id")
      .eq("id", session.id)
      .single();
    expect(closed.data).toEqual({
      status: "closed",
      period_id: session.period_id,
    });
    const continued = await execute(
      a.client,
      command(
        a.workspaceId,
        a.studentId,
        "ensure_period",
        { requestedMonth: new Date().toISOString().slice(0, 7) },
        result.revision,
      ),
    );
    expect(continued.status).toBe("applied");
    expect(continued.patch.period.month).not.toBe(oldMonth);
    expect(
      continued.patch.routine.document.weeks[0][0].blocks[0].exercises[0]
        .prescription.weight,
    ).toBe(20);
  } finally {
    await dropFixture(a.studentId);
  }
});
test("an offline start from an older revision becomes closed history beside a renewed month", async () => {
  const a = await prepared();
  const se = a.snapshot.sessions[0];
  const oldMonth = new Date(
    new Date().getFullYear(),
    new Date().getMonth() - 2,
    1,
    12,
  )
    .toISOString()
    .slice(0, 7);
  try {
    const closed = await execute(
      a.client,
      command(
        a.workspaceId,
        a.studentId,
        "finish_session",
        {
          sessionId: se.id,
          quickConfirmItemIds: se.items.map((i: { id: string }) => i.id),
          allowEmpty: false,
        },
        a.snapshot.revision,
      ),
    );
    expect(closed.status).toBe("applied");
    await adminClient()
      .from("routine_periods")
      .update({ month: oldMonth })
      .eq("id", se.period_id);
    const newer = structuredClone(a.snapshot.routine.document);
    newer.name = "Última revisión anterior";
    newer.weeks[0][0].blocks[0].exercises[0].prescription.weight = 30;
    const inserted = await adminClient()
      .from("routine_revisions")
      .insert({
        workspace_id: a.workspaceId,
        student_id: a.studentId,
        period_id: se.period_id,
        document: newer,
      })
      .select("id")
      .single();
    expect(inserted.error).toBeNull();
    await adminClient()
      .from("routine_periods")
      .update({ current_revision_id: inserted.data!.id })
      .eq("id", se.period_id);
    const currentMonth = new Date().toISOString().slice(0, 7);
    const continued = await execute(
      a.client,
      command(
        a.workspaceId,
        a.studentId,
        "ensure_period",
        { requestedMonth: currentMonth },
        closed.revision,
      ),
    );
    expect(continued.status).toBe("applied");
    const sid = crypto.randomUUID(),
      itemId = v5(se.items[0].position_id, sid);
    const start = command(
      a.workspaceId,
      a.studentId,
      "start_session",
      {
        sessionId: sid,
        periodId: se.period_id,
        routineRevisionId: se.routine_revision_id,
        dayId: se.day_id,
        week: 1,
        date: oldMonth + "-15",
        time: "18:00",
        timezone: "America/Argentina/Buenos_Aires",
      },
      a.snapshot.revision,
    );
    const edit = command(
      a.workspaceId,
      a.studentId,
      "adjust_prescription",
      {
        sessionId: sid,
        itemId,
        field: "weight",
        value: 22.5,
        scope: "session_and_future",
      },
      a.snapshot.revision,
    );
    const recovered = await execute(
      a.client,
      command(
        a.workspaceId,
        a.studentId,
        "reconcile_offline_session",
        {
          sessionId: sid,
          reason: "Recuperación de dispositivo revisada",
          operations: [start, edit],
          quickConfirmItemIds: [itemId],
        },
        continued.revision,
      ),
    );
    expect(recovered.status).toBe("applied");
    expect(recovered.patch.sessions).toHaveLength(0);
    expect(recovered.patch.routine.id).toBe(continued.patch.routine.id);
    expect(
      recovered.patch.routine.document.weeks[0][0].blocks[0].exercises[0]
        .prescription.weight,
    ).toBe(30);
    const result = await a.client
      .from("sessions")
      .select("status,routine_revision_id")
      .eq("id", sid)
      .single();
    expect(result.data).toEqual({
      status: "closed",
      routine_revision_id: se.routine_revision_id,
    });
  } finally {
    await dropFixture(a.studentId);
  }
});
