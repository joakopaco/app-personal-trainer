import "fake-indexeddb/auto";
import { expect, test, vi } from "vitest";
import { LocalStore } from "@pulso/sync/local-db";
import { DraftStorage } from "../../apps/web/src/features/routines/draft-storage";
import {
  createTemplateDraft,
  templateDraftKey,
  type TemplateDraft,
} from "../../apps/web/src/features/routines/template-drafts";
import { routineFixture } from "../fixtures/routine";
import { serializeDraftRecovery } from "../../apps/web/src/features/routines/draft-recovery";

async function fixture() {
  const db = new LocalStore({
    userId: crypto.randomUUID(),
    workspaceId: crypto.randomUUID(),
  });
  await db.open();
  return db;
}

test("queued writes capture raw input immediately and recover after storage failure", async () => {
  const db = await fixture();
  try {
    const storage = new DraftStorage(db, "draft:one");
    await storage.read();
    const value = { rawValues: { weight: "1," } };
    const write = storage.write(value);
    value.rawValues.weight = "25";
    await write;
    expect((await db.meta.get("draft:one"))?.value).toEqual({
      rawValues: { weight: "1," },
    });
    const put = vi
      .spyOn(db.meta, "put")
      .mockRejectedValueOnce(new Error("quota"));
    await expect(storage.write({ name: "unsaved" })).rejects.toThrow("quota");
    put.mockRestore();
    await storage.write({ name: "retry" });
    expect((await db.meta.get("draft:one"))?.value).toEqual({ name: "retry" });
  } finally {
    await db.delete();
  }
});

test("two tabs cannot silently overwrite a newer draft or resurrect a consumed draft", async () => {
  const db = await fixture();
  try {
    const first = new DraftStorage(db, "draft:one"),
      second = new DraftStorage(db, "draft:one");
    await first.read();
    await second.read();
    await first.write({ name: "first" });
    await expect(second.write({ name: "second" })).rejects.toThrow(
      "otra pestaña",
    );
    await second.read();
    await first.remove();
    await expect(second.write({ name: "resurrected" })).rejects.toThrow(
      "otra pestaña",
    );
    expect(await db.meta.get("draft:one")).toBeUndefined();
  } finally {
    await db.delete();
  }
});

test("a conflict recovery copy retains invalid per-set raw input under cloned exercise IDs", async () => {
  const db = await fixture();
  try {
    const doc = routineFixture();
    const oldId = doc.weeks[0][0].blocks[0].exercises[0].id;
    const id = await createTemplateDraft(db, doc, {
      [oldId + ":progression:0:weight"]: "1,",
    });
    const saved = (await db.meta.get(templateDraftKey(id)))
      ?.value as TemplateDraft;
    const newId = saved.document.weeks[0][0].blocks[0].exercises[0].id;
    expect(newId).not.toBe(oldId);
    expect(saved.rawValues[newId + ":progression:0:weight"]).toBe("1,");
  } finally {
    await db.delete();
  }
});

test("template copies reject a seventh day without truncating the source", async () => {
  const db = await fixture();
  try {
    const doc = routineFixture();
    doc.weeks[0] = Array.from({ length: 7 }, () =>
      structuredClone(doc.weeks[0][0]),
    );
    await expect(createTemplateDraft(db, doc)).rejects.toThrow("hasta 6 días");
    expect(doc.weeks[0]).toHaveLength(7);
    expect(await db.meta.count()).toBe(0);
  } finally {
    await db.delete();
  }
});

test("recovery export preserves all seven student days and invalid raw values", () => {
  const doc = routineFixture();
  doc.weeks[0] = Array.from({ length: 7 }, (_, index) => ({
    ...structuredClone(doc.weeks[0][0]),
    id: crypto.randomUUID(),
    name: "Día " + index,
  }));
  const snapshot = {
    doc,
    rawValues: {
      "exercise:series-2:weight": "1,",
      "exercise:durationSec": "abc",
    },
    draftRevision: 4,
    base: "active-revision",
  };
  const recovered = JSON.parse(serializeDraftRecovery("student", snapshot));
  expect(recovered.snapshot).toEqual(snapshot);
  expect(recovered.snapshot.doc.weeks[0]).toHaveLength(7);
  expect(recovered.studentId).toBe("student");
});
