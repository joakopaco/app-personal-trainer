import { describe, it, expect } from "vitest";
import { routineTimeline } from "../../apps/web/src/features/history/routine-history-model";
import { routineFixture } from "../fixtures/routine";
describe("routine timeline", () => {
  it("groups live changes and monthly renewals, preserving the latest prescription and actual date boundaries", () => {
    const first = routineFixture();
    first.name = "Adaptación";
    const adjustment = structuredClone(first);
    adjustment.weeks[0][0].blocks[0].exercises[0].prescription.weight = 30;
    const next = routineFixture();
    next.name = "Fuerza";
    const timeline = routineTimeline(
      [
        { id: "a", created_at: "2026-08-05T12:00:00Z", document: first },
        { id: "b", created_at: "2026-08-15T12:00:00Z", document: adjustment },
        { id: "c", created_at: "2026-09-01T12:00:00Z", document: adjustment },
        { id: "d", created_at: "2026-09-12T12:00:00Z", document: next },
      ],
      "d",
    );
    expect(timeline).toHaveLength(2);
    expect(timeline[0]).toMatchObject({
      start: "2026-08-05T12:00:00Z",
      end: "2026-09-12T12:00:00Z",
      current: false,
    });
    expect(
      timeline[0].document.weeks[0][0].blocks[0].exercises[0].prescription
        .weight,
    ).toBe(30);
    expect(timeline[1]).toMatchObject({ current: true, end: null });
    expect(timeline[0].versions.map((version) => version.id)).toEqual([
      "a",
      "b",
    ]);
    expect(timeline[0].versions[0].document).toEqual(first);
    expect(timeline[0].versions[1].document).toEqual(adjustment);
    expect(timeline[0].id).toBe("c"); // Reusing a routine starts from its latest revision.
  });
  it("keeps newly assigned routines with the same name separate and rejects invalid history", () => {
    const first = routineFixture(),
      second = routineFixture();
    expect(
      routineTimeline(
        [
          { id: "a", created_at: "2026-09-01", document: first },
          { id: "b", created_at: "2026-10-01", document: second },
        ],
        "b",
      ),
    ).toHaveLength(2);
    expect(() =>
      routineTimeline([{ id: "a", created_at: "2026-09-01", document: {} }]),
    ).toThrow();
  });
  it("keeps explicitly linked session versions in one routine even when its name changed", () => {
    const first = routineFixture();
    const changed = structuredClone(first);
    changed.name = "Nombre actualizado";
    changed.weeks[0][0].blocks[0].exercises[0].prescription.weight = 50;
    const timeline = routineTimeline(
      [
        { id: "a", created_at: "2026-10-01T10:00:00Z", document: first },
        {
          id: "b",
          created_at: "2026-10-01T11:00:00Z",
          document: changed,
          previous_revision_id: "a",
          source_session_id: "session",
        },
      ],
      "b",
    );
    expect(timeline).toHaveLength(1);
    expect(timeline[0].versions).toHaveLength(2);
    expect(timeline[0].versions[1].sourceSessionId).toBe("session");
  });
});
