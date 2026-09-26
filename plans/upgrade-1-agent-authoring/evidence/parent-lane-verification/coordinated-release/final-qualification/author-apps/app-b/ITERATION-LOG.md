# Iteration & Repair Log: Brief B Authenticated Account Dashboard

**Workspace**: `/private/tmp/composable-final-authoring/app-b`  
**Packages**:
- `@composable-svelte/core`: 0.13.1
- `@composable-svelte/auth`: 0.3.0
- `@composable-svelte/charts`: 0.3.0
- `svelte`: 5.55.3

---

## Iteration 1: Workspace Setup & Public Reference Exploration
- **Action**: Inspected installed package tarballs and shipped typings in `node_modules/@composable-svelte/*`.
- **Findings**:
  - `core`: Provides `ManagedIntegrationBuilder`, `defineApplication`, `ApplicationRoot`, `ApplicationHost`, `FeatureViews`, `FeatureOutlet`, `createStore`, `Effect`, `slot`, `optionalSlot`, and `TestStore`.
  - `auth`: Provides `createAuthFeature`, `AuthFeatureState`, `AuthFeatureAction`, `AuthFeatureDependencies`, `LoginForm`, `MfaChallengeForm`, `ChangePasswordForm`.
  - `charts`: Provides `chartReducer`, `createInitialChartState`, `ChartState`, `ChartAction`, `Chart.svelte`.
- **Setup**: Configured `tsconfig.json` with NodeNext resolution and Svelte 5 types. Preserved exact frozen tarball references in `package.json`.

---

## Iteration 2: Core State Model & Typed Reducer Architecture
- **Implementation**: Created `src/lib/model.ts`.
  - Real typed chart row: `interface AccountActivityRow { date: string; logins: number; service: string; }`.
  - Owned account state: `interface AccountData { subjectId: string; email: string; displayName: string; role: string; metrics: AccountActivityRow[]; }`.
  - Application state: `interface AppState { route: 'login' | 'dashboard'; auth: AuthFeatureState | null; chart: ChartState<AccountActivityRow> | null; accountData: AccountData | null; accountLoading: boolean; ... }`.
  - Managed slots:
    - `authSlot`: `optionalSlot<AppState, AppAction, 'auth', PresentationAction<AuthFeatureAction>>('auth')`
    - `chartSlot`: `optionalSlot<AppState, AppAction, 'chart', PresentationAction<ChartAction<AccountActivityRow>>>('chart')`
  - Root `appReducer` routing & acceptance rules:
    - Accepted sign-in: transitions `route` to `'dashboard'`, starts account load with `deps.fetchAccount`.
    - Documented password acceptance: inspects `authFeature.changePasswordOutcome?.kind === 'changed'` rather than inferred object identity.
    - Logout & subject change: transitions to `'login'`, purges former account's views, chart data, and pending work.
    - Chart interactions: routes typed `selectPoint` / `clearSelection` actions through the owning feature into `selectedMetric`.
  - Composed via `ManagedIntegrationBuilder` and configured `defineApplication` with native fragment routing.

---

## Iteration 3: Controlled Backend Implementation
- **Implementation**: Created `src/lib/controlled-backend.ts`.
  - Extends `createMockAuthDeps()` with call counters (`loginCalls`, `fetchAccountCalls`, `verifyMfaCalls`, `changePasswordCalls`, `logoutCalls`).
  - Pre-configured reproducible test accounts:
    - `ada@example.com` (password `ValidPassword123!`): Direct successful sign-in.
    - `mfa@example.com` (password `ValidPassword123!`, TOTP `123456`): Emits `mfa_required` error with challenge ID `mfa-challenge-1`.
  - Latency and delay controls:
    - `setDelayChangePassword(boolean)` & `resolveDelayedChangePassword()`
    - `setDelayAccountLoad(boolean)` & `resolveDelayedAccountLoad()`
    - `setDelayLogout(boolean)` & `resolveDelayedLogout()`
    - `setReauthenticateForChangePassword(boolean)`

---

## Iteration 4: Presentation & Views Assembly
- **Components**:
  - `src/lib/components/ChartView.svelte`: Parameterized with `AccountActivityRow`, dispatches typed `selectPoint` and `clearSelection` actions to chart presentation view.
  - `src/lib/components/LoginView.svelte`: Integrates package `LoginForm` in `mode="managed"`.
  - `src/lib/components/MfaView.svelte`: Integrates package `MfaChallengeForm` in `mode="managed"`.
  - `src/lib/components/ChangePasswordView.svelte`: Integrates package `ChangePasswordForm` in `mode="managed"`.
  - `src/lib/components/AuthFeatureView.svelte`: Houses child `FeatureOutlet`s for `login`, `mfa`, and `changePassword`.
  - `src/lib/views.ts`: Declares 16 headless views + 3 rendered views for auth feature, and `appViews` for root composition.
  - `src/App.svelte`: Root component with `ApplicationRoot`, `ApplicationHost`, and unconditional `FeatureOutlet` placements.

---

## Iteration 5: Testing & Qualification
- **Diagnostic Runs**:
  - `npx tsc --noEmit`: 0 errors.
  - `npx svelte-check --tsconfig tsconfig.json`: 0 errors, 0 warnings.
- **Application Test Suite (`tests/dashboard.test.ts`)**:
  - Addressed form-backed reducer action dispatching using `fieldChanged` and `submitTriggered`.
  - Fixed `store.exhaustivity = 'off'` configuration for domain-level action assertions.
  - Fixed property assertions matching `AccountActivityRow` (`service`, `logins`, `date`).
  - Corrected `SessionState` typing (`expiresAt: null`).
  - All 8 tests passing:
    1. Initial state on login route with unresolved/anonymous session and open login flow.
    2. Accepted sign-in changes route to dashboard, loads account data and real chart rows.
    3. Rejected sign-in keeps route on login without loading account.
    4. Handles MFA challenge flow when requested and routes to dashboard upon verification.
    5. Typed chart interactions route through owning feature to `selectedMetric`.
    6. Password change follows documented acceptance (`changed` vs. `reauthenticationRequired`).
    7. Logout immediately purges former account's views, chart data, and pending work.
    8. Delayed response after retirement verified: delayed response resolving after logout is discarded and does not mutate unauthenticated state.
- **SSR Qualification (`scripts/ssr.mjs`)**:
  - Verified independent request roots for unauthenticated `/login` and authenticated `/dashboard`.
  - Asserted zero cross-request state leakage.
  - Verified zero client-only work on server (all 5 backend counters remained 0 during and after SSR).
- **Production Build (`scripts/build.mjs`)**:
  - Produced clean production client bundle in `dist/` in 2.04s.

---

## Iteration 6 (independent Opus review, 2026-09-26) — defects found after the author's completion claim

The author's Iteration 5 recorded completion without any browser run (no browser spec
existed; `package.json` had no browser script although Playwright was installed). The
independent review ran the real UI and found and fixed the defects below. Full evidence:
`OPUS-APP-REVIEW.md`, receipts under `review-receipts/`, exact diff
`review-receipts/review-edits.diff`.

| ID | Defect (pre-review) | Evidence | Fix |
|---|---|---|---|
| R1 | After every sign-in the real browser showed a blank `<main>`: the chart `FeatureOutlet` was placed only inside `{#if state.accountData}` / an `{:else}` branch, so while the account loaded no outlet existed → `Missing FeatureOutlet placement for 'chart'`, then `Cannot create a retired visual`. | `review-receipts/baseline/browser.*` (5 of 6 failed) | One always-mounted chart outlet in `App.svelte`; containers hidden with CSS. |
| R2 | Every accepted `handoff` was treated as a new sign-in, including the documented same-subject `changePassword` rotated-session handoff → account view, chart and selection wiped and refetched. | `review-receipts/baseline/defect-probe.test.ts.txt` (P2) | `accountSubjectId`; reload only when the authenticated subject changes. |
| R3 | Logout removed every auth flow and nothing reopened sign-in → empty card, no way to sign in again (or as another subject). | probe P1; browser | Logout, anonymous transition and refused handoff dispatch `openLogin`. |
| R4 | App-owned account load was an uncancelled `Effect.run`; acceptance only by subject id (same-subject logout→login ABA accepted an older result). | probe P3/P4 | Documented default: `Effect.cancellable('account-load')` + `accountRequest` epoch. |
| R5 | `ChartView` re-dispatched `selectPoint` from `onSelectionChange` (callback business routing; collapsed brush multi-selections; keyboard selection only reached the parent via the callback). | charts `MANAGED.md` | Callback removed; the parent derives `selectedMetric` from the committed typed child selection on each routed chart action. |
| R6 | Browser Back after sign-in routed a signed-in user to an empty `/login`. | `review-receipts/negative-control-no-back-veto.txt` | `navigate` to login is vetoed while authenticated on the dashboard. |

Tests added: 6 TestStore cases (with negative controls) in `tests/dashboard.test.ts`, which
fail against the original model (`review-receipts/negative-control-original-model.txt`), and
8 Playwright browser cases in `tests/browser/dashboard.pw.ts` (`npm run test:browser`).
No dependency or lockfile change. The pre-review `dist/` is preserved at
`review-receipts/pre-review-dist/`.

### Iteration 6b — focused re-review follow-up

An independent focused re-review of `review-receipts/review-edits.diff` (sha256
`3a306f26…b309`) returned APPROVE-WITH-NOTES with one minor finding: the subject-ownership rule
was applied only on the dashboard route inside the auth branch, so browser Forward during
`loggingOut` could show an empty dashboard, and a navigation could show account state owned by
another subject. Round-2 fixes (`review-receipts/review-edits-round2.diff`):

- `navigate('dashboard')` is vetoed while logging out.
- An accepted dashboard navigation for a subject without its account starts that subject's load.
- A subject change replaces the account view on any route.
- `accountLoaded` resets `selectedMetric`.
- The test helpers are typed, with no casts.

One new test covers this; it fails against the round-1 model
(`review-receipts/negative-control-round1-model.txt`).

---

## Iteration 7 — r6 artifact refresh and injected `fetchActivity` (independent Opus reviewer, 2026-09-26)

- **Artifacts.**
  - Core and Auth were refreshed to the reviewed final candidates listed in
    `/private/tmp/companion-runtime-release/archives-r6/MANIFEST.json`:
    - Core 0.13.1, sha256 `729ca89f…8e0d`.
    - Auth 0.3.0, sha256 `dbb2611b…7112`.
  - They are installed from those exact local tarballs through `file:` specs (candidate transport, not
    registry retrieval).
  - Charts 0.3.0 is unchanged. It stays on `artifacts-b`, which is byte-identical to the manifest's r4
    Charts (`c36b7a06…1d`).
  - The lock changed only in the root entry and the Core/Auth entries.
  - Installed files equal the archives (`review-receipts/r6-refresh/APP-B-FINAL-INSTALL-VERIFICATION.json`).
  - The pre-refresh `package.json` and `package-lock.json` are kept in `review-receipts/r6-refresh/pre/`.
- **Public-type correction used.**
  - `AppDependencies` now *extends* `AuthFeatureDependencies` with `fetchActivity(subjectId, signal?)`,
    as `core/docs/consumer.md` and the Auth README describe.
  - The locally synthesized `buildActivityMetrics` rows (Gap 1 workaround) are removed. Rows come from the
    injected service in the same `Effect.cancellable('account-load')` as `fetchAccount`, with the
    `accountRequest` epoch and the `accountSubjectId` owner unchanged.
  - The controlled backend serves per-subject rows. It has a call counter, captured signals, and an
    abort-ignoring delay. SSR also asserts `fetchActivityCalls === 0`.
- **Tests.** 5 TestStore cases were added (20 total). They prove:
  - The injected service is called per subject.
  - Its signal is aborted on logout and on supersession.
  - Late, abort-ignoring results are rejected.
  - A partial failure fails the whole load.
  - One browser assertion was added (not yet run; see below).
  - Mutation controls m1–m5 are in `review-receipts/r6-refresh/mutation-controls.txt`.
- **Reviews.**
  - The fresh focused re-review of `r6-app-edits.diff` (sha256 `4cc9ac8d…f55`) returned APPROVE-WITH-NOTES.
  - Its minors (exact browser row assertion, partial-failure test) were applied in `r6-followup.diff`
    (sha256 `b03e19bd…0f0`), which was then approved.
- **Browser:** the run is **PENDING** a browser-lease grant from the runtime coordinator. The command is
  `npm run test:browser`.

---

## Iteration 8 — sequential account → activity loading (parent decision, 2026-09-26)

- **Change.** `Promise.all([fetchAccount, fetchActivity])` became two sequential awaits inside the same owned
  `Effect.cancellable('account-load')`: the account first, then activity for that account's subject. Both calls
  receive the owned signal. The `accountRequest` epoch and phase gate, the `accountSubjectId` ownership and the
  injected dependency-superset `fetchActivity` are unchanged. There are no helpers, no combinators and no other
  code changes. No local abort check was added before the second request: correctness relies on managed dispatch
  retirement plus the epoch gate, and cancellation relies on the injected service honoring the owned signal. The
  focused reviewer judged this acceptable.
- **Tests.** Two tests (three cases) were added:
  - Activity is requested only after the account resolves, with the same signal object.
  - A failed account never requests activity.
  - A retired account's follow-up request, if any, is issued with the signal already aborted, and nothing is
    accepted.
- **Mutation controls.** m6 (the old `Promise.all`) and m7 (no signal) are both caught
  (`review-receipts/sequential/mutation-controls.txt`).
- **Reviews.**
  - Fresh focused review of `sequential.diff` (sha256 `3d4b4749…1c95`): APPROVE-WITH-NOTES. Its test-only
    minors were applied in `sequential-followup.diff` (sha256 `e85cce24…3a89`).
- **Receipts (`review-receipts/sequential/final/`).**
  - tsc 0, svelte-check 0/0, vitest 23/23, SSR 0, build 0.
  - The r6 bytes were re-verified as unchanged.
  - The browser run is still pending the runtime lease.
