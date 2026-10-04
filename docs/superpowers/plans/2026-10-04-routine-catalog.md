# Routine catalog implementation plan

> Implement natively in this session using the existing authorized publication workflow.

**Goal:** Make Rutinas a reusable catalog, keep student programming in profiles, and allow leaving an open workout without ending it.
**Architecture:** Share routine fields between student programming and a separate template editor. Persist drafts in account-scoped IndexedDB and save templates through the existing revision-checked, idempotent library RPC and owner RLS. Copies regenerate internal IDs and never change assigned routines.
**Tech stack:** React, TypeScript, Dexie, Supabase, Playwright.
**Spec:** User request dated 2026-10-04: back button in training; independent routine catalog; save a student routine as a renamed template.

## Constraints and review focus
- Preserve white/black/lime mobile interface and minute-based rest inputs.
- Preserve local drafts, including invalid or partially entered numbers, through reloads.
- Reject concurrent stale template updates; retain a recoverable local copy.
- Separate template targets when retrying uncertain library writes.
- Do not change real students for production verification.

## Tasks
- [x] Extract RoutineFields from RoutineBuilder without changing student save/publish behavior; run routine-builder unit tests.
- [x] Add catalog and template editor routes with durable drafts, rename, read-only summary, revision-safe saves and recoverable errors. Include template drafts in pending/update/logout checks and synchronization recovery.
- [x] Add profile action that clones its saved routine into an editable, renamed catalog draft. Move student editor links under /alumnos/:id/rutina; keep legacy redirects.
- [x] Add visible Volver a Hoy in training, preserving session state.
- [x] Add local E2E coverage: create/edit/reload templates, minute inputs, apply and copy independence, unauthorized reads/updates, stale writes, back/reopen workout.
- [x] Run typecheck, unit, database, E2E, build and sequential PWA checks.
- Publication: main auto-deploys to Vercel; record final deployment/CI evidence in `.local/routine-catalog/verification.md`.
