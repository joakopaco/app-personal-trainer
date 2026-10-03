import { test, expect } from "vitest";
import { createRequire } from "node:module";
import { previewImport } from "@pulso/domain/legacy-v6";
const require = createRequire(import.meta.url);
const { fixture } = require("../helpers/training-fixture.cjs");
test("legacy preview preserves original records and deterministically maps repeated weekly IDs", async () => {
  const data = fixture();
  data.db.people[0].records = [
    {
      date: "2026-09-10",
      name: "Remo",
      group: "Espalda",
      weight: 20,
      sets: 3,
      reps: 8,
    },
  ];
  const text = JSON.stringify({ format: "pulso-backup", data });
  const first = await previewImport(text);
  expect(first.students).toHaveLength(1);
  expect(first.recordCount).toBe(1);
  expect(first.students[0].routine!.weeks[0][0].id).not.toBe(
    first.students[0].routine!.weeks[1][0].id,
  );
  expect(
    first.students[0].routine!.weeks[0][0].blocks[0].exercises[0].lineageId,
  ).toBe(
    first.students[0].routine!.weeks[1][0].blocks[0].exercises[0].lineageId,
  );
  expect((await previewImport(text)).hash).toBe(first.hash);
});
test("future schema and broken references fail before import", async () => {
  const data = fixture();
  data.version = 99;
  await expect(
    previewImport(JSON.stringify({ format: "pulso-backup", data })),
  ).rejects.toThrow();
  data.version = 6;
  data.db.sessions = [{ id: "bad", personId: "missing" }];
  await expect(
    previewImport(JSON.stringify({ format: "pulso-backup", data })),
  ).rejects.toThrow();
});
