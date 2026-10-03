import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  command,
  execute,
  createStudent,
  dropFixture,
} from "../fixtures/cloud";
import { routineFixture } from "../fixtures/routine";
test("observed sets survive prescription changes, future routine updates and close replays once", async () => {
  const a = await createStudent();
  let rev = a.revision;
  const run = async (kind: string, payload: unknown) => {
    const c = command(a.workspaceId, a.studentId, kind, payload, rev);
    const r = await execute(a.client, c);
    if (r.status === "applied") rev = r.revision;
    return { r, c };
  };
  try {
    const doc = routineFixture(),
      draftId = randomUUID();
    const month = new Date().toISOString().slice(0, 7);
    await run("save_draft", {
      draftId,
      expectedDraftRevision: 0,
      baseRoutineRevisionId: null,
      document: doc,
    });
    const { r: published } = await run("publish_routine", {
      draftId,
      expectedDraftRevision: 1,
      baseRoutineRevisionId: null,
      targetMonth: month,
    });
    const sessionId = randomUUID();
    const startPayload = {
      sessionId,
      periodId: published.patch.period.id,
      routineRevisionId: published.patch.routine.id,
      dayId: doc.weeks[0][0].id,
      week: 1,
      date: month + "-03",
      time: "18:00",
      timezone: "America/Argentina/Buenos_Aires",
    };
    const { r: start } = await run("start_session", startPayload);
    expect(start.status).toBe("applied");
    const item = start.patch.sessions[0].items[0],
      setId = item.sets[0].id;
    const { r: observed } = await run("record_set", {
      sessionId,
      itemId: item.id,
      setId,
      ordinal: 1,
      state: "done",
      weight: 20,
      reps: 10,
      durationSec: null,
    });
    expect(observed.status).toBe("applied");
    const { r: adjusted } = await run("adjust_prescription", {
      sessionId,
      itemId: item.id,
      field: "weight",
      value: 25,
      scope: "session_and_future",
    });
    expect(adjusted.status).toBe("applied");
    expect(adjusted.patch.sessions[0].items[0].sets[0].weight).toBe(20);
    expect(adjusted.patch.sessions[0].items[0].sets[1].weight).toBe(25);
    expect(
      adjusted.patch.routine.document.weeks[3][0].blocks[0].exercises[0]
        .prescription.weight,
    ).toBe(25);
    const { r: second } = await run("start_session", {
      ...startPayload,
      sessionId: randomUUID(),
    });
    expect(second.status).toBe("rejected");
    const { r: closed, c: close } = await run("finish_session", {
      sessionId,
      quickConfirmItemIds: [item.id],
      allowEmpty: false,
    });
    expect(closed.status).toBe("applied");
    expect(closed.patch.sessions).toHaveLength(0);
    const repeat = await execute(a.client, close);
    expect(repeat.status).toBe("duplicate");
    const sets = await a.client
      .from("session_sets")
      .select("*")
      .eq("session_id", sessionId)
      .order("ordinal");
    expect(sets.data?.map((s) => [s.weight, s.source])).toEqual([
      [20, "observed"],
      [25, "quick_confirmed"],
    ]);
    const { r: correct } = await run("correct_result", {
      sessionId,
      itemId: item.id,
      setId,
      field: "weight",
      value: 22.5,
      reason: "Corrección de anotación",
    });
    expect(correct.status).toBe("applied");
    const audit = await a.client
      .from("audit_events")
      .select("before_data,after_data")
      .eq("student_id", a.studentId)
      .eq("kind", "correct_result")
      .single();
    expect(
      audit.data?.before_data.result.session_sets.find(
        (s: { id: string }) => s.id === setId,
      ).weight,
    ).toBe(20);
    expect(
      audit.data?.after_data.result.session_sets.find(
        (s: { id: string }) => s.id === setId,
      ).weight,
    ).toBe(22.5);
    const original = await a.client
      .from("routine_revisions")
      .select("document")
      .eq("id", published.patch.routine.id)
      .single();
    expect(
      original.data?.document.weeks[0][0].blocks[0].exercises[0].prescription
        .weight,
    ).toBe(20);
  } finally {
    await dropFixture(a.studentId);
  }
});
