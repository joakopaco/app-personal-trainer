> Update authorized by owner during execution: same domain/project, `/administracion` independently bootstraps the operator portal and auth storage. No second Vercel site. Original separate-build steps below are superseded; use shared build with path-based entry selection, private navigation network-only in the service worker, and same-origin isolation tests.

# Private administration portal implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline, as requested by the owner.

**Goal:** Independent operator portal with username AdminPulso123; no customer identity can become an operator.
**Architecture:** Separate Vite build and hosting origin, shared Supabase Auth and existing gym administration components. A server-only username resolver authenticates credentials without exposing the technical email. Database constraints and session checks enforce role separation.
**Tech Stack:** React, TypeScript, Vite, Supabase Auth/Postgres/Edge Functions, Playwright.
**Spec:** docs/superpowers/specs/2026-10-05-private-admin-portal-design.md

## Global constraints
- Preserve personal trainer functions and data. Reuse the existing gym administration panel.
- No public operator signup, customer navigation, email field or public administrative link.
- No service keys or plaintext credentials in client code, logs, screenshots or Git.
- Initial password change is mandatory; username is not a password.
- No new paid plan, schema reset or deletion of existing customer accounts.

## Review focus
- An operator session issued before a password change must lose administrative authority (task 1).
- Direct API calls cannot bypass first-login restrictions (task 1).
- Failed login, suspended operator and unknown username receive generic errors and bounded attempts (task 1).
- Parallel customer/operator sessions and logout must remain independent (task 2).
- Actual production CAPTCHA hostname and new deployment must work; never disable CAPTCHA to ship (task 3).

## Task 1: Server identity boundary
Files: new incremental SQL migration, supabase/functions/platform-login/index.ts, supabase/config.toml, gym-accounts/index.ts, tests/fixtures/operator.ts, tests/e2e/platform-access.spec.ts.
- [ ] Write tests using a fresh Auth identity and real local Supabase: trainer promotion rejected; operator cannot call ensure_workspace or join gym; initial password blocks is_platform_operator; changing password requires a new session; suspended identity denied.
- [ ] Run `npx playwright test tests/e2e/platform-access.spec.ts` and record expected failure.
- [ ] Add username, must_change_password, access_after to platform_operators. Enforce incompatible identities in database triggers. Password-change trigger clears initial gate and invalidates older sessions.
- [ ] Provide `platform_access()` for current identity state and service-only `platform_login_target(login_name text)` with atomic global and per-username rate limits. Resolve internal email only after checking active account. Anonymous/authenticated callers cannot invoke the resolver.
- [ ] Implement `platform-login` POST: validate bounded JSON, service resolver, anon Auth signInWithPassword with CAPTCHA token; return session credentials only for a valid dedicated operator. Disable JWT verification only for this pre-authentication function. Keep gym-accounts verification enabled.
- [ ] Harden gym-accounts and service operations so pending-password operators cannot create gyms or reset credentials.
- [ ] Apply locally without reset; run the tests and existing gym provisioning tests after replacing mixed-role fixtures with dedicated identities.

## Task 2: Independent frontend
Files: apps/web/src/features/platform/PlatformApp.tsx and platform.css, main.tsx, adapters/supabase.ts, app/router.tsx, settings/Settings.tsx, gym/PlatformAdmin.tsx, vite.config.ts, package.json, tests/e2e/platform-portal.spec.ts, playwright.platform.config.ts.
- [ ] Write browser tests: username-only login, invalid customer credentials rejected, first-password gate, gym list and create form, logout, independent client session, no customer admin route. Verify widths 320/390/768/1440.
- [ ] Run them against the current app; observe missing dedicated portal.
- [ ] Add admin build mode. Example entry selection: `import.meta.env.VITE_APP_MODE === "admin" ? <PlatformApp /> : <App />`. Use independent session storage key for that build.
- [ ] PlatformApp consumes `platform_access()` before mounting PlatformAdmin. Mount DialogFocus, branded navigation, visible signout and error/retry states. No AuthProvider/DataProvider/customer workspace bootstrap.
- [ ] Password form calls Auth updateUser with current password, then signs in again through platform-login and rechecks server authority. Lost responses must remain retryable.
- [ ] Remove PlatformAdminLink and client route. Customer AuthProvider treats operator metadata as a routing warning only; database is authoritative.
- [ ] Build admin without PWA registration. Run browser, unit, typecheck and build checks; inspect saved screenshots, excluding credentials.

## Task 3: Deploy and bootstrap
Files: docs/ops/platform-admin.md; build and host configuration for independent admin project.
- [ ] Review diff and run security/functional checks. Record outstanding host dependencies rather than weakening authentication.
- [ ] Apply incremental SQL and deploy platform-login/gym-accounts using Supabase connector, verify anonymous login errors and client permission denials.
- [ ] Create/configure independent Vercel admin site with the public Supabase variables and proper CAPTCHA hostname; never transfer service keys into build variables.
- [ ] Bootstrap a new exclusive operator identity for AdminPulso123 with a generated temporary password via server Admin API. Deliver the credential once through a private local file; do not publish it in logs or Git.
- [ ] Verify independent live URL, then publish customer route removal. Update operations documentation with actual URLs and reset procedure.
- [ ] Finish with a fresh independent security/code review, fix required findings, and report deployed evidence and any real blockers.
