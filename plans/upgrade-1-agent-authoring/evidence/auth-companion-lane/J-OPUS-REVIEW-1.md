# Session refresh: independent Opus review 1

Reviewed candidate against `f1442781`. This is the pre-correction review; final disposition will be recorded in J-SESSION-REFRESH-PROOF.md.

**Verdict: NOT CLEAR TO LAND.** There is one confirmed blocker, reproduced in Chromium, plus some documentation and test fixes.

## Blocker

**1. After a 401 on refresh, if `resolveSession` still returns the same signed-in user, the managed watcher stays dead.**
- Where: `packages/auth/src/lib/application/feature.ts:1145-1154` (the `withExpiry` step in the `session` case) and `:2078`.
- On `invalid_credentials`, the child reducer sets the slot to `status: 'ended'`. The feature then calls `resolveSession`.
- If the backend confirms the same account (for example, the 401 came from a proxy), the account id doesn't change. So the retirement wrapper does nothing.
- `withExpiry` then copies the new `expiresAt` straight into the slot, but leaves `status: 'ended'`.
- The child reducer's `expiryObserved` would have switched `ended` back to `idle` when a real expiry arrived. That is exactly what standalone mode does through its `sessionStore` forwarding, so managed and standalone behave differently here.
- Reproduced with a temporary Chromium test, since deleted:
  - `fetchSession` returned Ada with `expires_at` 13:00.
  - Final state: session `authenticated`/Ada, expiry 13:00, and `sessionRefresh = {status:'ended', expiresAt:'…13:00…', error: invalid_credentials}`.
  - The mounted managed `SessionRefresh` rendered the `ended` snippet to a signed-in user.
  - A later `ticked` and `refreshRequested` were both ignored (status stayed `ended`, 1 request total). The session will never be refreshed again until someone restarts the slot.
  - The outcome pulse `{kind:'ended'}` also fired, even though the session survived.
- No existing test covers this: the fixture's `fetchSession` always returns `null`.
- Fix direction: when the same subject resolves with a non-null expiry, send the parent's expiry through the child's `expiryObserved` rules (or reset `ended` → `idle` inside `withExpiry`/`handOver`). Add a test where `fetchSession` returns the same user.

## Should fix before landing (docs and types)

2. **`CHANGELOG.md:52` gives the wrong type for `refreshSession`.** It says `Promise<SessionSnapshot | null>`; the real type is `Promise<SessionLifetime>` (`{ expiresAt: string | null }`, `deps.ts:434`).
3. **The `ended` outcome is documented without its `error` field** in `CHANGELOG.md:47`, `README.md:303` and the J-proof at lines 29 and 35. The exported type is `{ kind: 'ended'; error: AuthError }` (`feature.ts:128`).
4. **README line 298 and the J-proof say `invalid_credentials` always ends in anonymous.** That's only true when the backend agrees. The docs should say what happens when it returns the same user (currently finding 1).
5. **The new `class` prop does nothing** (`SessionRefresh.svelte:88`). It's destructured as `className` but never used. Either remove it or apply it.
6. **The component doc comment is inaccurate** (`SessionRefresh.svelte:22-25`). It calls this an "activity watcher … not a fixed interval". The code uses a fixed `setInterval(tickMs)` gated on expiry, with no user-activity input.

## Test quality (the author's counts are real, but these tests can't fail)

7. **The attachment tests would pass even if refcounting were removed** (`managed-session-refresh.test.ts:434-558`: start/stop, multiple attachments, replacement). They only assert `status === 'idle'`, which the watch never changes. My own timer spies are what actually proved the behaviour (see verified facts below). These tests should assert interval or listener counts instead.
8. **The "distinct effect IDs" test** (`:388`) doesn't observe effect IDs or cancellation either.

## Non-blocking observations

- **The replay guard relies on a module-level global** (`lastSessionRefreshWasRefreshing`, `feature.ts:840`). It is correct today: the builder runs children before the core in the same synchronous reduction (`managed-integration.ts:385-391`), and an empty slot short-circuits both. But it is hidden mutable state shared across instances and SSR requests. A reducer-owned `settled` field, as the password and delete-account flows use, would match the rest of the codebase.
- **While anonymous with the ended view kept on screen, the 30s interval keeps running** and dispatches no-op ticks (confirmed: no `clearInterval` until unmount). It's harmless but wasteful; `watchStopped` could be dispatched when the slot reaches `ended`.
- **In standalone mode the owner is a constant symbol**, so swapping the `flowStore` prop does not re-key the DOM. This is minor.

## Verified facts vs author reports

What I verified myself:
- The base is `f1442781`.
- The builder runs children first, then the core.
- `bind` caches views per (store, owner, slot), so multiple attachments share one view and the refcount is meaningful.
- **Refcounting:** two mounts on one view created 1 interval, and unmounting one cleared nothing. Remounting created no second interval. The last unmount cleared the interval.
- **Restart and close through the real `ManagedAuthRecipe`/`FeatureOutlet` host:** restart gave 2 intervals and 1 clear (the old owner stopped, the new one started). Close gave 2 clears.
- The SSR test passes (no effects, timers or requests).
- Subject switch, logout and late results are dropped, and the ended view is kept on anonymous, per the tests I read and re-ran.
- Targeted runs: `managed-session-refresh` plus `auth-feature` (80/80 Chromium) and the SSR slice (3/3), all passing.
- `git status --porcelain` shows the same 21 entries it started with. The scratch test file was deleted.

Not verified by me:
- The full 933 Chromium + 62 SSR pass counts, `check`, `typecheck` and `build` are the author's reports; I didn't re-run them.
- The physical consumer checks on Svelte 5.20.0 and 5.55.3 are the coordinator's to confirm.
