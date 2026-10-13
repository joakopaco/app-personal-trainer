// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const api = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../../apps/web/src/adapters/supabase", () => ({
  cloud: () => ({ from: api.query }),
}));
import { PreviousResult } from "../../apps/web/src/features/live/TrainingScreen";

afterEach(cleanup);

test.each([
  { firstState: "done", expected: "22.5 kg" },
  { firstState: "skipped", expected: "20 kg" },
])(
  "previous result uses the first completed series by ordinal when series 1 is $firstState",
  async ({ firstState, expected }) => {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        error: null,
        data: [
          {
            id: "previous-item",
            sessions: { status: "closed", started_at: "2026-10-12T18:00:00Z" },
            // Corrections can change the database's physical row order.
            session_sets: [
              {
                ordinal: 3,
                state: "done",
                weight: 30,
                reps: 10,
                duration_sec: null,
              },
              {
                ordinal: 2,
                state: "done",
                weight: 20,
                reps: 10,
                duration_sec: null,
              },
              {
                ordinal: 1,
                state: firstState,
                weight: 22.5,
                reps: 10,
                duration_sec: null,
              },
            ],
          },
        ],
      }),
    };
    api.query.mockReturnValue(query);

    render(<PreviousResult exerciseId="squat" studentId="student" />);

    expect(
      await screen.findByText(`Anterior: ${expected} · 10 reps`),
    ).toBeTruthy();
  },
);
