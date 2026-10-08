# Trainer routines and reliability

**Goal:** Make trainer programming fast and recoverable, with scheduled weekdays, up to six template days, block-only macro rest, preset values and optional per-set progression. Inspect the supplied Strong video and official references, preserve Pulso styling, then verify in browser and document in the specified Space.

**Architecture:** Extend the existing prescription with optional `progression: {weight: number | null, reps: number | null}[]`. Older prescriptions stay readable. Shared editor and summary consume it; local projection and database session creation must use the same per-set targets. Keep macroTarget for compatibility but new edits use blocks. Do not rewrite historical results.

**Constraints:** User explicitly requests autonomous execution with no questions. No real customer data in tests. Keep local and cloud save states honest. Preserve incomplete drafts and invalid raw input. Existing routines with historical nonpreset values stay readable. New template days limited to six; student routine days come from ISO weekdays 1–7. Unscheduled students can choose up to six generic days, with clear explanation. Copied sources must not silently discard extra days: show mismatch and require a compatible base/schedule.

## Tasks

- [x] Draft lifecycle: reproduce and test local-write failure, offline discovery/recovery, ambiguous server acknowledgement, concurrent edits, conflict resolution, deletion and publication; implement durable and truthful state handling. Own RoutineBuilder, StudentRoutines, template persistence and associated tests.
- [x] Domain and server: test optional per-set progression round trip and validation; implement session seeding and completion with each target, local/cloud parity, bounded new editor presets. Add migrations via CLI and run database tests.
- [x] Editor: weekday defaults, six-day cap including duplicate action, preset selects (series 1–4; reps 4/6/8/10/12; rests 30/60/180/300 seconds), progression checkbox with per-set weight/reps rows, macro exclusively on block. Preserve compatible old values without offering them for new values.
- [x] Routine reading and gym use: scannable exercise cards, set tables, selected day navigation, progression in printable routine and training, usable phone spacing and touch targets. Verify supplied reference and official Strong docs.
- [x] Verification: unit, types, build, database, affected end-to-end flows, desktop/mobile browser walkthrough; fix findings and record exact limitations. Independent final review.
- [x] Delivery: commit tested work and update existing Pulso Space pages with changes, evidence, deployment status and remaining external limitations.

## Review focus

Lost server response must not create duplicate commands; failed IndexedDB writes must not report saved; separate students/drafts must not overwrite each other; progression must survive snapshots, copies, session completion and export; repeated day/series actions must respect limits. Preserve existing historical data.

## Execution ledger

Initial checkout clean on main. Work proceeds on codex/trainer-routines-reliability. Autonomous design and implementation explicitly authorized by user; no approval gate. Using a focused draft implementation subagent while primary implements shared prescription/editor integration, followed by independent review.

User follow-up: prioritize trainer live logging ergonomics, keep Strong as presentation reference only, show durations in seconds or minutes/seconds, use12 instead of15, redesign week/day controls and branded loading. Implemented and reviewed. Verification:119 unit,43 legacy,80 database,96 E2E,5 PWA passed; WebKit overflow fixed and targeted narrow-screen suite passed. See docs/qa/trainer-routines-2026-10-08.md.

Delivery: PR #1 merged as e4ff552 after full CI passed on 6813467. All three migrations applied and verified in Supabase cloud. Production Vercel ready; published editor/menu/presets reviewed on desktop and phone width. Five existing Space pages updated. The final mobile scroll issue found by CI was corrected and independently reviewed, then verified by five Chromium and three WebKit repetitions before the successful full CI run. Final documentation records exact evidence and external limitations.
