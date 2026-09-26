# Final independent Opus 5.5 verdict

**Verdict: CLEAR TO LAND.** The marker fix removes the regression from my last review, and I found no material blockers left.

**The marker fix** (`packages/auth/src/lib/application/feature.ts:846-883`):
- The wrapper now deletes any marker on the incoming state before it does anything else.
- When it ignores an action, it returns a fresh copy rather than the same state object.
- Only a result that arrives while the flow is actually `refreshing` marks the new state.
- The core reducer always runs right after the children in the same step, so a marker is only ever read in the step that created it.

**Scratch repro (Chromium, now deleted).** I let a real request settle, ran an unrelated session step, then sent a forged result twice: once through the managed view and once as a plain parent `sessionRefresh`/`presented` dispatch.

| Real result, then forged | Session expiry | Outcome | Other |
|---|---|---|---|
| success, then `refreshSucceeded` with 2099 | stays `13:00` | `null` | child expiry stays `13:00` |
| 401, then forged `invalid_credentials` | — | `null` | `fetchSession` still called once; slot still `ended` |

Last review, the first case moved the session expiry to 2099 and emitted a `refreshed` outcome, and the second emitted a second `ended`.

**Earlier corrections:**
- **Failed seeded login:** `loginFailed` is now excluded from the "same user is back" check (`feature.ts:1173`), and the test at `:867` covers it.
- **Recovery tests:** the tests for a same-user `sessionResolved`, `sessionEstablished` and `loginSucceeded` are still there and pass.
- **New replay test:** `:384` covers a real success, network failure and 401, each followed by a forged repeat.

**Docs:**
- No `started` action name remains; the README says `watchStarted`.
- The README and the J-proof say the `ended` pulse fires in the same step as the 401, before the session is re-checked.
- J-proof lines 16 and 35 now attribute `ended` only to `invalid_credentials`.
- CHANGELOG line 47 lists the accepted paths: `sessionResolved`, `sessionEstablished` and seeded `loginSucceeded`. Its replay-protection claim now holds.

**My runs:**
- Chromium: `managed-session-refresh` plus `auth-feature`, 89/89 passing.
- SSR: the session-refresh test, 3/3 passing.
- `svelte-check`: 0 errors, 0 warnings.

**Not verified by me:** the full suites, both installed matrices, the backend gate, and the new archive receipt and hash. Those are the coordinator's, and the landing depends on those runs passing.

**Clean-up:** the scratch test is deleted and I made no edits or commits. `git status` now shows 31 entries; the one added since last time is `K-OPUS-REVIEW-2.md`, which isn't mine.
