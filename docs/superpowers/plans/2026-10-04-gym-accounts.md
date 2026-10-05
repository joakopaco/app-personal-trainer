# Gym accounts implementation

Spec: `docs/superpowers/specs/2026-10-04-gym-accounts-design.md` (approved by user: ejecuta).

## Global constraints
Personal trainer behavior, data and routes must remain unchanged. Gym data uses independent tables, RLS and commands. No production fixtures or destructive migrations. All account authority comes from protected database records. Temporary credentials never persist in plaintext. Production operator bootstrap awaits explicitly supplied email.

## Task 1: Isolation and authorization
Add local integration tests for two gyms, forced password change, suspension and cross-tenant denial. Observe RED. Add gym schema, access resolver, immutable routine revisions, bounded command gateway and first-login checks. Keep PT SQL functions unchanged except an additive guard rejecting newly provisioned gym identities. Validate with local Supabase and existing DB tests; expected: pass and unchanged PT workspace behavior.

## Task 2: Account provisioning
Test operator-only gym creation, gym-only member creation, duplicate/idempotent requests, password gate and reset. Implement server-only Auth Admin endpoint and service-only transactional provisioning helpers. Expected: no orphan account can gain PT or gym access; no role can provision outside its scope.

## Task 3: Entry and private administration
Test all login choices, no gym signup, forced change and private operator route. Add minimal auth branching for server-marked gym accounts, new isolated gym provider and shells. Retain PT path as default. Build private gym administration and gym member management; expected: full local provisioning flow and login regressions green.

## Task 4: Routine workflows
Test catalog publication, personalized assignment, single own routine, selection and stale-edit conflict. Reuse pure routine editor/summary. Keep active routine separate from drafts, explicit discard, private notes and source labels. Expected: published snapshots immutable, only entitled members can select/read.

## Task 5: Training and progress
Test starting once, day selection, recording/finishing and immutable prescription. Build member training, visual timer, progress, muscle figure and export; retain pending input on network failure scoped to identity/session. Expected: session and progress work at mobile sizes without overflow or lost input.

## Task 6: Verification and release
Run typecheck, unit/legacy, DB, PT E2E and new gym/mobile flows. Inspect screenshots desktop, 320/375/390/tablet. Fresh whole-branch reviewer (executing-plans requirement), fix material issues with regression tests. Publish migrations/endpoints before frontend, verify production assets and security advisors. Bootstrap operator only after user supplies email.

## Interfaces and review focus
Database JSON access contract → isolated frontend provider. Command envelope `{operationId,kind,payload}` → all mutations with revision checks. RoutineDocument remains existing four-week schema; immutable revision IDs are selection/session inputs. Privileged server endpoint is sole creator/resetter. Review provisioning races, existing JWT after suspension/reset, direct RPC attacks, routine ownership, PT login/offline regression and responsive empty/error states.
