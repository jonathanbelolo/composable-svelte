# Session refresh: independent Opus review 2

Pre-correction review; final disposition belongs in J-SESSION-REFRESH-PROOF.md.

**Verdict: not clear to land.** Blocker 1 is fixed for the case it named, but three blockers remain. Two are variants of blocker 1 that I reproduced in Chromium; the third is a broken installed-consumer scenario, found by reading the code.

## Remaining blockers

**B1. Any session action during the pending resolve revives `ended` too early.**
- Where: `packages/auth/src/lib/application/feature.ts`, `withSessionRefreshExpiry` (called on every `session` action) together with `reduceSessionRefreshResult`.
- After the 401, the session sits in `resolving`. The subject is still Ada and `session.expiresAt` still holds the old value. Any `session` action at that point hits the `ended && newExpiry !== null` branch and resets the watcher to `idle`, before the backend has answered. Even a `resolveSession` that the session reducer ignores (because one is already in flight) does it.
- My repro, which I ran and then deleted, used a `fetchSession` that doesn't settle:
  - after the 401: `resolving`, slot `ended`
  - after dispatching `{type:'session', action:{type:'resolveSession'}}`: slot `{status:'idle', expiresAt:'…12:00…', error:null}`
  - `refreshRequested` then sent a **second** `refreshSession` request while reconciliation was still pending (2 requests in total)
  - when `fetchSession` resolved `null`, the session went anonymous and the slot was **retired** (`undefined`), so the ended view the docs promise was lost.
- Fix direction: revive only when the matching resolve settles (`sessionResolved` for the same subject, with the right epoch). While the session is `resolving` with a reconciliation pending, a session action must leave the `ended` slot alone. Add a test that dispatches something like `resolveSession` or `loginStarted` mid-reconciliation.

**B2. A same-user resolve with a null expiry leaves the watcher dead.**
- Where: same function. With a `null` expiry the `ended → idle` branch is skipped, and the second branch leaves the state unchanged.
- My repro had `fetchSession` return Ada with no `expires_at`:
  - final state: session `authenticated`, `expiresAt: null`, slot `{status:'ended', error: invalid_credentials}`
  - a later `refreshRequested` was ignored (still 1 request)
  - a signed-in user keeps seeing the ended view.
- `README.md`, `CHANGELOG.md` and J-proof line 29 all say that when the backend confirms the same user, the watcher recovers to `idle` with no qualification about expiry.
- The existing recovery test (`managed-session-refresh.test.ts:424`) only covers a non-null, *changed* expiry.
- Fix direction: recover based on the resolved subject, not on whether an expiry is present. Add tests for a null expiry and for an unchanged expiry.

**B3. The installed browser scenario can't prove expiry propagation.**
I found this by reading the code; I didn't run the installed consumer because it has no `node_modules` in this worktree.
- `packages/auth/consumer/src/App.svelte:316` renders `left.session.subject.session.expires_at`. `AuthenticatedSubject` is `{kind, id, attributes}` (`src/lib/subject/types.ts:44`) and has no `session` field. That should fail `svelte-check --fail-on-warnings`, and at runtime it throws a TypeError as soon as the left side signs in. It also reads the wrong source: the parent's truth is `left.session.expiresAt`.
- `consumer/src/main.ts:5` calls `createMockAuthDeps` without `sessionExpiresAt`, so the mock's expiry is `null` and every refresh returns `{expiresAt: null}`. Even with the expression fixed, `expiryBefore === expiryAfter === 'none'`, so `scripts/browser.mjs` fails its own propagation check.
- The coordinator's point about running after account deletion is addressed: `browser.mjs` now calls `page.goto(address)`, and the mock's `deleted` flag is a closure variable, so each page load gets a fresh mock.
- Still needed:
  - Configure `sessionExpiresAt` for this scenario.
  - Render `session.expiresAt`.
  - Assert the outcome carries the new non-null value and that `left-expiry` equals it.
  - Assert something after the restart and close clicks, which are currently unchecked.

## Prior findings 2–8

- **2** fixed: `refreshSession` → `Promise<SessionLifetime>` in `CHANGELOG.md`.
- **3** fixed: `ended` now carries `error` in `CHANGELOG.md`, `README.md` and the J-proof.
- **4** partly fixed: the same-user branch is now documented, but its "recovers" claim is untrue for a null expiry (B2).
- **5** fixed: the dead `class` prop is gone.
- **6** fixed: the component comment now describes the fixed interval gated on expiry, plus visibility handling.
- **7** fixed: the start/stop, multiple-attachment and replacement tests assert `setInterval`/`clearInterval` counts. They don't count `visibilitychange` listeners; that's minor.
- **8** fixed: the test now asserts that `watchStopped` doesn't abort the in-flight refresh signal. The reverse direction (restarting or cancelling the refresh leaves the watch running) isn't tested; that's minor.

## Other checks (I verified these; none block)

- **Replay state:** the old module-level boolean is gone. It's now a module `WeakMap` keyed by the child state object that settled. Every settle produces a new object, and a replayed `refreshSucceeded` or `refreshFailed` while not refreshing produces a new object with no marker, so there's no leak between instances or SSR requests. It's still not reducer-owned state like `settled` in the password and delete-account flows, but it's acceptable.
- **Retirement:** a subject switch or logout retires the slot and drops late results. `keepEndedRefresh` keeps the view only when the slot is `ended` and the session is anonymous. B1 defeats this.
- **Standalone mode:**
  - Props and the `expiryObserved` / `resolveSession` forwarding are preserved.
  - Two behaviour changes aren't in the CHANGELOG. First, `expiryObserved` now clears `error` when going `ended → idle`. Second, standalone attachments are now refcounted per `flowStore`; I'd call that an improvement.
  - Standalone has the same limitation as B2, and also for an unchanged expiry, but that was already true at `f1442781`.
- **Test runs:** `managed-session-refresh` plus `auth-feature` passed 81/81 in Chromium, and the SSR slice passed 3/3.
- **Cleanup:** I deleted the scratch repro. `git status --porcelain` shows the same 22 entries as at the start. I made no edits and no commits.

**Taken from others, not verified by me:** full-suite counts, `check`, `typecheck`, `build`, and the installed consumer runs on Svelte 5.20.0 and 5.55.3. Those belong to the coordinator's parallel qualification, which should hit B3.
