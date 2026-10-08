import { expect, test } from "vitest";
import { routineFixture } from "../fixtures/routine";
import { routineSchema, validateRoutine } from "@pulso/domain/routines";
import { projectCommand } from "@pulso/domain/session-projection";
import type { StudentSnapshot, CommandEnvelope } from "@pulso/domain/contracts";

test("per-set targets survive schema parsing and incomplete targets cannot publish", () => {
  const doc = routineFixture();
  const rx = doc.weeks[0][0].blocks[0].exercises[0].prescription;
  Object.assign(rx, {
    progression: [
      { weight: 20, reps: 10 },
      { weight: 30, reps: 6 },
    ],
  });
  expect(
    routineSchema.parse(doc).weeks[0][0].blocks[0].exercises[0].prescription,
  ).toHaveProperty("progression", [
    { weight: 20, reps: 10 },
    { weight: 30, reps: 6 },
  ]);
  Object.assign(rx, {
    progression: [
      { weight: 20, reps: 10 },
      { weight: null, reps: null },
    ],
  });
  expect(validateRoutine(doc)).toEqual([]);
  expect(validateRoutine(doc, true).length).toBeGreaterThan(0);
});

test("progression must match series count and cannot be applied to timed exercises", () => {
  const doc = routineFixture(),
    exercise = doc.weeks[0][0].blocks[0].exercises[0];
  Object.assign(exercise.prescription, {
    progression: [{ weight: 20, reps: 10 }],
  });
  expect(validateRoutine(doc).length).toBeGreaterThan(0);
  exercise.type = "time";
  Object.assign(exercise.prescription, {
    progression: [
      { weight: 20, reps: 10 },
      { weight: 30, reps: 6 },
    ],
  });
  expect(validateRoutine(doc).length).toBeGreaterThan(0);
});

test("offline session seeds each series from its own target and rest adjustment preserves progression", () => {
  const doc = routineFixture();
  Object.assign(doc.weeks[0][0].blocks[0].exercises[0].prescription, {
    progression: [
      { weight: 20, reps: 10 },
      { weight: 30, reps: 6 },
    ],
  });
  const snapshot = {
    routine: { id: crypto.randomUUID(), document: doc },
    sessions: [],
  } as unknown as StudentSnapshot;
  const c = {
    kind: "start_session",
    studentId: crypto.randomUUID(),
    capturedAt: new Date().toISOString(),
    payload: {
      sessionId: crypto.randomUUID(),
      week: 1,
      dayId: doc.weeks[0][0].id,
    },
  } as unknown as CommandEnvelope;
  const started = projectCommand(snapshot, c),
    item = started.sessions[0].items[0];
  expect(item.sets.map((s) => [s.weight, s.reps])).toEqual([
    [20, 10],
    [30, 6],
  ]);
  const adjusted = projectCommand(started, {
    ...c,
    kind: "adjust_prescription",
    payload: {
      sessionId: started.sessions[0].id,
      itemId: item.id,
      field: "microRest",
      value: 180,
      scope: "session_only",
    },
  });
  expect(
    adjusted.sessions[0].items[0].sets.map((s) => [s.weight, s.reps]),
  ).toEqual([
    [20, 10],
    [30, 6],
  ]);
});

test("explicit bodyweight null targets never fall back to a legacy scalar weight", () => {
  const doc = routineFixture(),
    exercise = doc.weeks[0][0].blocks[0].exercises[0];
  exercise.type = "reps";
  Object.assign(exercise.prescription, {
    weight: 20,
    progression: [
      { weight: null, reps: 10 },
      { weight: null, reps: 6 },
    ],
  });
  const snapshot = {
    routine: { id: crypto.randomUUID(), document: doc },
    sessions: [],
  } as unknown as StudentSnapshot;
  const command = {
    kind: "start_session",
    studentId: crypto.randomUUID(),
    capturedAt: new Date().toISOString(),
    payload: {
      sessionId: crypto.randomUUID(),
      week: 1,
      dayId: doc.weeks[0][0].id,
    },
  } as unknown as CommandEnvelope;
  const started = projectCommand(snapshot, command),
    item = started.sessions[0].items[0];
  expect(item.sets.map((set) => set.weight)).toEqual([null, null]);
  const adjusted = projectCommand(started, {
    ...command,
    kind: "adjust_prescription",
    payload: {
      sessionId: started.sessions[0].id,
      itemId: item.id,
      field: "microRest",
      value: 60,
      scope: "session_only",
    },
  });
  expect(adjusted.sessions[0].items[0].sets.map((set) => set.weight)).toEqual([
    null,
    null,
  ]);
});

test("a fifth progression series is rejected locally without changing existing state", () => {
  const doc = routineFixture(),
    exercise = doc.weeks[0][0].blocks[0].exercises[0];
  Object.assign(exercise.prescription, {
    progression: [
      { weight: 20, reps: 10 },
      { weight: 30, reps: 6 },
    ],
  });
  const snapshot = {
    routine: { id: crypto.randomUUID(), document: doc },
    sessions: [],
  } as unknown as StudentSnapshot;
  const command = {
    kind: "start_session",
    studentId: crypto.randomUUID(),
    capturedAt: new Date().toISOString(),
    payload: {
      sessionId: crypto.randomUUID(),
      week: 1,
      dayId: doc.weeks[0][0].id,
    },
  } as unknown as CommandEnvelope;
  const started = projectCommand(snapshot, command),
    item = started.sessions[0].items[0];
  for (const value of [0, 5, null, 2.5])
    expect(() =>
      projectCommand(started, {
        ...command,
        kind: "adjust_prescription",
        payload: {
          sessionId: started.sessions[0].id,
          itemId: item.id,
          field: "sets",
          value,
          scope: "session_and_future",
        },
      }),
    ).toThrow("1 y 4");
  expect(started.sessions[0].items[0].sets).toHaveLength(2);
});

test("load progression cannot publish an explicit missing weight using the scalar fallback", () => {
  const doc = routineFixture(),
    exercise = doc.weeks[0][0].blocks[0].exercises[0];
  Object.assign(exercise.prescription, {
    weight: 20,
    progression: [
      { weight: null, reps: 10 },
      { weight: 30, reps: 6 },
    ],
  });
  expect(
    validateRoutine(doc, true).some((error) => error.includes("peso")),
  ).toBe(true);
});
