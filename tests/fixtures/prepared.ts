import { createStudent, execute, command } from "./cloud";
import { routineFixture } from "./routine";
export async function prepared(doc = routineFixture()) {
  const a = await createStudent();
  const draftId = crypto.randomUUID(),
    month = new Date().toISOString().slice(0, 7);
  const save = await execute(
    a.client,
    command(
      a.workspaceId,
      a.studentId,
      "save_draft",
      {
        draftId,
        expectedDraftRevision: 0,
        baseRoutineRevisionId: null,
        document: doc,
      },
      a.revision,
    ),
  );
  const pub = await execute(
    a.client,
    command(
      a.workspaceId,
      a.studentId,
      "publish_routine",
      {
        draftId,
        expectedDraftRevision: 1,
        baseRoutineRevisionId: null,
        targetMonth: month,
      },
      save.revision,
    ),
  );
  const start = await execute(
    a.client,
    command(
      a.workspaceId,
      a.studentId,
      "start_session",
      {
        sessionId: crypto.randomUUID(),
        periodId: pub.patch.period.id,
        routineRevisionId: pub.patch.routine.id,
        dayId: doc.weeks[0][0].id,
        week: 1,
        date: month + "-03",
        time: "18:00",
        timezone: "America/Argentina/Buenos_Aires",
      },
      pub.revision,
    ),
  );
  return { ...a, snapshot: start.patch };
}
