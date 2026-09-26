# Combined closure: independent Opus review 1

Pre-correction review against f1442781.

**Verdict: NOT CLEAR TO LAND.** There is one correctness blocker, which I reproduced in Chromium, and one evidence blocker in the inventory and consumer README. The fixes for both are small. Everything else checked out, including the B1, B2 and B3 fixes, SSR and packaging.

## Blockers

**1. A same-user `sessionEstablished` while the resolve is pending leaves a signed-in user's watcher dead for good.**
- **Where:** `packages/auth/src/lib/application/feature.ts:1155`. Only a `sessionResolved` counts as "accepted same subject", while `handOver()` (around line 2170) revives the slot on any accepted same-subject handover. The session reducer's `sessionEstablished` arm is commented as sharing one rule with the feature so the two "cannot drift", but here they do.
- **Repro** (temporary Chromium test, since deleted):
  1. A 401 sets the slot to `ended` and the session to `resolving`.
  2. Dispatch `{type:'session', action:{type:'sessionEstablished', session: Ada with expires_at 20:00}}`.
  3. Result: session is `authenticated`/Ada with expiry 20:00, but the slot stays `{status:'ended', error: invalid_credentials}`.
  4. The pending `fetchSession` then settles with Ada. The session reducer drops it because the status is already `authenticated`, so the slot stays `ended`.
  5. A later `refreshRequested` is refused (still 1 request). The user sees the ended view and is never refreshed again.
- The seeded session `login` → `loginSucceeded` path has the same gap by construction. I didn't run that one because the fixture's `fetchLogin` throws.
- **Contrast:** a managed `openLogin` is allowed during `resolving`, and that path goes through `handOver` and does revive the slot.
- **Suggested fix:** revive `ended` on any session transition *into* `authenticated` for the same subject. That is: `state.session.status !== 'authenticated'`, `next.session.status === 'authenticated'`, and the same subject id. Ignored or stale actions don't change the status, so B1 still holds. Add tests for `sessionEstablished` mid-resolve.

**2. Two inventory rows and the consumer README claim installed coverage the proof doesn't have.**
- `A-INVENTORY.md:29` (subject/role helpers) says "isolated SSR test with multiple concurrent requests". K-proof and `ssr.mjs` do three sequential renders, and K says explicitly that this is not a concurrency test.
- `A-INVENTORY.md:30` (password policy) says "12-char policy enforced on signup/reset in installed consumer". Only signup is exercised when installed; K says reset is covered by the source suite only. The same row's "sign-in does not enforce…" has no installed evidence either: the fixture password `correct-horse` is 13 characters, so it passes the 12-character policy anyway.
- `consumer/README.md:38` says the consumer exercises "signup/reset 12-character minimum versus sign-in policy", which has the same problem.
- **Fix:** reword to "sequential isolated SSR renders" and "signup negative case installed; reset and short-existing sign-in are source-suite evidence".

## Should fix

**3. The README describes the watch action and the ended outcome inaccurately.**
- `README.md:294` and J-proof line 21 say mounting dispatches `started`. The action is `watchStarted`.
- `README.md:298` says `{kind:'ended'}` is emitted "if the backend confirms the session is gone". It is actually emitted in the same reduction as the 401, before resolution, and it fires even when the same user is confirmed later. By the time the anonymous transition happens, the pulse has already been cleared. A parent that treats `ended` as "signed out" will be wrong.

**4. Stale child results and `expiryObserved` sent through the managed view can hide `ended` and restart requests. This is hardening, not a blocker.** Reproduced while `resolving` + `ended`:
- `view.dispatch({type:'refreshSucceeded', …})` moves the slot to `idle`. `refreshRequested` then sends a second request (2 total). When the resolve returns `null`, the slot is retired, so the ended view is lost.
- `expiryObserved` does the same thing.
- A forged `refreshFailed` while idle gives an `ended` slot on an authenticated session, with no resolve and no outcome.
- A forged `refreshSucceeded` makes the child's expiry diverge from the parent's (child 2030, parent 12:00).
- None of this is reachable from a real effect; it needs a consumer to dispatch the feedback actions directly. It also matches how the sibling flows handle it: the child accepts the result, and the parent ignores it unless it settled a request.
- It does contradict "stale actions during resolve cannot restart requests or hide ended", though. The test "drops stale or replayed refresh results" at `managed-session-refresh.test.ts:336` only checks the parent's state.
- **Suggested fix:** in `sessionRefreshChildReducer` (`feature.ts:842`), return the state unchanged for `refreshSucceeded`/`refreshFailed` when the flow wasn't refreshing, and for `expiryObserved`, since the parent owns expiry in managed mode.

## Verified by me

- **B1 fix:** a mid-resolve `resolveSession` leaves the slot `ended`, and `refreshRequested` is refused.
- **B2 fix:** recovery works for a null expiry and for an unchanged expiry, and an epoch-stale `sessionResolved` doesn't revive the slot.
- **Retirement:** a subject switch retires the slot, logout clears it via `allFlowsNull`, and the ended view is kept only when the result is anonymous.
- **B3 fix:**
  - `main.ts` seeds `sessionExpiresAt` and the matching snapshot.
  - `left-expiry` renders the parent's `session.expiresAt`.
  - `browser.mjs` asserts the expiry changed, isn't `none`, and appears exactly in the `refreshed:` outcome.
  - It asserts the call count after the request, the restart and the close.
  - It opens a fresh `page.goto` before the refresh section.
- **Consumer gates and HTTP checks:**
  - Gates use a passive `{state}` projection; the flow views use genuine `PresentationView` ports.
  - `Props.svelte` has positive and negative `ComponentProps` controls.
  - The headless HTTP block really asserts the identical `AbortSignal`, `credentials: 'include'`, structured `invalid_credentials`, and the nested MFA `challengeId`.
- **Packaging** (I planted probe directories and deleted them afterwards):
  - With `npm pack --dry-run`, the consumer's `node_modules/.vite`, `.vite`, `dist`, `.svelte-kit` and `*.tgz` were all excluded; the 21 runnable source files remained.
  - A real `pnpm pack` gave 405 entries with none of the excluded paths.
  - The only thing that got through was a synthetic nested `consumer/src/.vite` I planted. No tool writes a cache there, so it isn't a finding.
- **Test runs:**
  - Full Chromium suite: 55 files, 938/938 passing.
  - SSR suite: 11 files, 62/62 passing.
  - `pnpm run check`: 0 errors, 0 warnings.

**Not verified by me:** the installed consumer runs on both Svelte pins, the live reference-backend run, and `verify-final-artifact.py` all belong to the coordinator, as do the final hash and final-run facts.

**Clean-up:** the scratch repro test is deleted and `git status --porcelain` shows the same 29 entries as at the start. `pnpm pack` did rebuild the gitignored `packages/auth/dist` and left a tarball in `/private/tmp/opus-pack/`. I made no source edits and no commits.
