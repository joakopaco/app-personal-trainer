import { test, expect } from "vitest";
import { auditChanges } from "@pulso/domain/audit-display";
test("correction timeline names the exercise and previous/new values without exposing technical snapshots", () => {
  const state = (weight: number) => ({
    result: {
      session_items: [
        { id: "item", name: "Remo", prescription: { weight: 20 } },
      ],
      session_sets: [{ id: "set", item_id: "item", ordinal: 1, weight }],
    },
  });
  expect(auditChanges(state(20), state(22.5))).toEqual([
    { label: "Remo · serie 1 · peso (kg)", before: 20, after: 22.5 },
  ]);
});
