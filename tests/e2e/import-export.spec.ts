import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { accountClient, adminClient } from "../fixtures/cloud";
import { previewImport } from "@pulso/domain/legacy-v6";
const require = createRequire(import.meta.url);
const { fixture } = require("../helpers/training-fixture.cjs");
test("legacy import commits once, preserves original source and never fabricates observed sets", async () => {
  const a = await accountClient();
  const data = fixture();
  data.db.people[0].id = crypto.randomUUID();
  const sourceText = JSON.stringify({ format: "pulso-backup", data });
  const preview = await previewImport(sourceText);
  let job: string | undefined;
  let ids: string[] = [];
  try {
    const first = await a.client.rpc("import_legacy_v6", {
      workspace_id: a.workspaceId,
      source_text: sourceText,
      prepared: preview.students,
    });
    expect(first.error).toBeNull();
    job = first.data.jobId;
    ids = first.data.mapping.map((m: { studentId: string }) => m.studentId);
    expect(first.data.students).toBe(1);
    const again = await a.client.rpc("import_legacy_v6", {
      workspace_id: a.workspaceId,
      source_text: sourceText,
      prepared: preview.students,
    });
    expect(again.data.duplicate).toBe(true);
    const original = await a.client
      .from("legacy_records")
      .select("original_person")
      .eq("student_id", ids[0])
      .single();
    expect(original.data?.original_person).toEqual(data.db.people[0]);
    const sets = await a.client
      .from("session_sets")
      .select("id")
      .in("student_id", ids);
    expect(sets.data).toEqual([]);
  } finally {
    for (const id of ids)
      await adminClient().from("students").delete().eq("id", id);
    if (job) await adminClient().from("import_jobs").delete().eq("id", job);
  }
});
test("a malformed second legacy student rejects the whole import and cross-account export is empty", async () => {
  const a = await accountClient(),
    b = await accountClient(1),
    data = fixture();
  data.db.people[0].id = crypto.randomUUID();
  const preview = await previewImport(
    JSON.stringify({ format: "pulso-backup", data }),
  );
  const bad = structuredClone(data.db.people[0]);
  bad.id = crypto.randomUUID();
  bad.records = [
    {
      date: "2026-02-30",
      name: "Remo",
      group: "Espalda",
      weight: 20,
      sets: 3,
      reps: 8,
    },
  ];
  data.db.people.push(bad);
  const source = JSON.stringify({ format: "pulso-backup", data });
  const before = await a.client
    .from("students")
    .select("id", { count: "exact" });
  const r = await a.client.rpc("import_legacy_v6", {
    workspace_id: a.workspaceId,
    source_text: source,
    prepared: [
      ...preview.students,
      { ...preview.students[0], sourceId: bad.id },
    ],
  });
  expect(r.error).toBeTruthy();
  const after = await a.client
    .from("students")
    .select("id", { count: "exact" });
  expect(after.count).toBe(before.count);
  const foreign = await b.client.rpc("export_workspace", {
    workspace_id: a.workspaceId,
  });
  expect(foreign.data).toBeNull();
  const own = await a.client.rpc("export_workspace", {
    workspace_id: a.workspaceId,
  });
  expect(own.error).toBeNull();
  expect(own.data.workspaceId).toBe(a.workspaceId);
  expect(own.data).not.toHaveProperty("auth");
});
