# Managed session refresh and watcher candidate proof

Status: Qualified local candidate. Independent Opus 5.5 verdict: **CLEAR TO LAND** (see FINAL-OPUS-REVIEW.md). This implements the *Session refresh* row of `A-INVENTORY.md` as a qualified local candidate, not a published package.

## Behavior and ownership

`createAuthFeature()` integrates an optional managed `sessionRefresh` slot (`sessionRefreshSlot`) with genuine `PresentationView` ports and explicit parent outcome routing.

The slot belongs to the signed-in account:

- **Slot lifetime & guards**:
  - Bound to authenticated subject: `openSessionRefresh` is refused without an authenticated subject in the session slot, or while temporary sign-in flows (`login`, `mfa`, `signup`, `forgotPassword`, `resetPassword`, `emailVerification`, `oauthStart`, `oauthCallback`, `magicLinkRequest`, `magicLinkSignIn`, `changeEmailConfirm`) are live.
  - Sibling settings coexistence: coexists with sibling account settings slots (`account`, `connectedAccounts`, `mfaManagement`, `mfaEnrolment`, `changeEmail`, `changePassword`, `deleteAccount`).
  - Sibling feature isolation: independent feature instances maintain separate slot owners and background watchers.
  - Subject retirement: any change of the authenticated subject (logout, switching to a different account, or session expiration) retires slot owners in the managed composition, aborting in-flight effects and dropping late responses.
  - Ended state preservation: when the watcher status transitions to `'ended'` (due to backend `invalid_credentials`), the feature preserves `sessionRefresh` across the session transition to anonymous so the user sees the ended notification/snippet.
  - SSR safety: zero client-only work during SSR; `$effect` does not execute on the server, ensuring zero timer or network activity.

- **Component attachment and watcher lifetime (`SessionRefresh mode="managed"`)**:
  - Renders `SessionRefresh mode="managed" store={view.store}` (or `flowStore={view.store}`) with an optional `ended` snippet.
  - Client-only watcher activation: the background watcher starts only when the component attaches on the client via `$effect`, dispatching `watchStarted` into the presentation view.
  - Multiple attachments: active attachments are reference-counted per view owner using a module-level `WeakMap<object, number>`. Multiple mounts of `SessionRefresh` for the same view share the existing watcher without starting duplicate timers; the watcher stops only when the last relevant attachment unmounts.
  - Replacement safety: unmounting an old or superseded owner never stops a replacement owner.
  - Owner-keyed rendering: markup and reactive derived state are keyed to view owners (`{#if flow}{#each [owner] as key (key)}`), preventing preflush event mismatch and stale clicks from reaching retired owners.
  - Standalone compatibility: standalone mode (`sessionStore` provided, `mode` omitted or `'standalone'`) is fully preserved, including standalone watcher startup, expiry forwarding, and ending behavior. In managed mode, standalone authority prop `sessionStore` is forbidden via `never`.

- **Truthful expiry updates and session reconciliation**:
  - Parent owns accepted session: on successful refresh, the parent feature updates the authenticated session snapshot's `expires_at` truthfully without re-authenticating a logged-out or different account.
  - `invalid_credentials` reconciliation: if the backend reports `invalid_credentials` (401), the feature immediately transitions the slot to `ended`, emits `sessionRefreshOutcome: { kind: 'ended', error }` in that reduction, and initiates session resolution following existing `resolveSession` semantics (not unconditional logout). While resolution is in flight (`session.status === 'resolving'`), unrelated session actions leave the `ended` slot alone (refusing duplicate refresh requests). If the backend agrees the session has ended, it transitions to anonymous while preserving the ended view. If the backend or parent confirms the same authenticated user via an accepted transition into authenticated (such as `sessionResolved` matching status and epoch, `sessionEstablished`, or seeded `loginSucceeded`), the watcher recovers from `ended` to `idle` with the resolved expiry (including when the expiry is `null` or unchanged).
  - Transient failure tolerance: network or transient failures do not destroy a valid session; the feature retains the current session, returns flow status to `idle`, and emits `sessionRefreshOutcome: { kind: 'failed', error }`.
  - Distinct operation IDs: the background watch subscription (`auth/flows/session-refresh/watch`) and the active refresh request (`auth/flows/session-refresh/refresh`) use distinct effect IDs.
  - Replay protection: `sessionRefreshChildReducer` associates transitions from active `refreshing` status with a private accepted-result marker keyed by the resulting state via a `WeakMap<SessionRefreshState, ...>`, ensuring only reductions from actively refreshing state emit an outcome pulse without altering public state keys or using global mutable booleans. Replayed, premature, or idle results emit no outcome.
  - Outcome pulse: reports `AuthFeatureState.sessionRefreshOutcome` (a one-reduction pulse cleared on every routed reduction):
    - `{ kind: 'refreshed', expiresAt: string | null }` — session expiry successfully extended.
    - `{ kind: 'ended', error: AuthError }` — backend reported `invalid_credentials`; session resolution initiated.
    - `{ kind: 'failed', error: AuthError }` — transient refresh error; session preserved.

- **Deterministic time & cookie security**:
  - Injected clock: `AuthFeatureDependencies` accepts optional `clock?: Clock`, `leadMs?: number`, and `tickMs?: number` for fully deterministic time decisions across browser visibility changes and tests.
  - No client tokens: no bearer tokens or client cookie access; operations rely strictly on server-owned HttpOnly cookies and `credentials: 'include'`.

## Exact local candidate and measured checks

- Base commit: `f1442781` (clean start commit).
- Package `check`: 0 errors, 0 warnings (`svelte-check --tsconfig ./tsconfig.test.json --fail-on-warnings`).
- Package `typecheck`: 0 errors (`tsc --noEmit`).
- Package `build`: pass (emitted 25 NodeNext Svelte declaration bridges).
- Full package Chromium test suite: 55 files, 942 passed (including 28 tests in `tests/managed-session-refresh.test.ts`).
- Full package SSR test suite: 11 files, 62 passed (including 3 tests in `tests/ssr/managed-session-refresh-ssr.test.ts`).
- Total package tests: 1004 tests (942 Chromium + 62 SSR), all passed.
- Candidate archive: `/private/tmp/auth-final-candidate/composable-svelte-auth-0.2.1.tgz`, SHA256 `92d8ee7f8486f7573bdbfbae9181b20a0aac696e282050793ce2ddf14a33bdd5`; 404 files, zero consumer dependency/cache/build artifacts (FINAL-ARTIFACT-RECEIPT.json).
- Physical final qualification: check/build/browser/SSR and live reference-backend proof passed on both physical Svelte 5.20.0 and 5.55.3 fixtures; archive bytes and lock integrity match. See K-CROSS-CUTTING-PROOF.md.
- Final review: CLEAR TO LAND; Opus independently measured 89 focused Chromium tests, 3 SSR tests and svelte-check. Coordinator independently measured the full 942 Chromium + 62 SSR suite, check/typecheck/build and both installed matrices.

## Caveats and non-blocking observations

- **Ref-count cleanup on rapid unmount/remount**: The module-level `attachmentCounts` `WeakMap` accurately tracks mounted instances per owner. When replacing a feature owner via `restartSessionRefresh`, the new owner starts its own watcher immediately; unmounting the old component decrements the old owner's ref-count, safely stopping only the old watcher.
- **Ended view retention**: When the session resolves to anonymous following an `ended` refresh result, `authFeatureCore` explicitly checks `keepEndedRefresh = next.sessionRefresh?.status === 'ended' && authenticatedId(next) === null` so the ended snippet remains visible instead of being wiped with the session.
- **Clock and timing configuration**: Optional `leadMs` and `tickMs` allow consumers to tune watcher refresh lead time and polling interval, with safe defaults matching standalone behavior.

### Preserved standalone limits

Standalone refresh retains its existing session-to-flow expiry forwarding. Its ended recovery depends on an observed changed non-null expiry; null/unchanged resolution is fully handled by the managed feature. An ended mounted watcher may retain a timer whose ticks do no work until cleanup. These are accepted compatibility limits, not outstanding managed blockers.
