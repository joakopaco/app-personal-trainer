import { test, expect } from "vitest";
import { mergeRoutine } from "@pulso/domain/routine-diff";
import { routineFixture } from "../fixtures/routine";
test("merges disjoint prescription fields but requires a choice for the same field", () => {
  const base = routineFixture(),
    local = structuredClone(base),
    remote = structuredClone(base);
  local.weeks[0][0].blocks[0].exercises[0].prescription.weight = 44;
  remote.weeks[0][0].blocks[0].exercises[0].prescription.reps = 12;
  const clean = mergeRoutine(base, local, remote, {});
  expect(clean.conflicts).toEqual([]);
  expect(
    clean.document.weeks[0][0].blocks[0].exercises[0].prescription,
  ).toMatchObject({ weight: 44, reps: 12 });
  remote.weeks[0][0].blocks[0].exercises[0].prescription.weight = 42;
  const conflict = mergeRoutine(base, local, remote, {});
  expect(conflict.conflicts).toHaveLength(1);
  const resolved = mergeRoutine(base, local, remote, {
    [conflict.conflicts[0].path]: "local",
  });
  expect(
    resolved.document.weeks[0][0].blocks[0].exercises[0].prescription.weight,
  ).toBe(44);
});
