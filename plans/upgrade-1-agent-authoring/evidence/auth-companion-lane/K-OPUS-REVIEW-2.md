# Combined closure: independent Opus review 2

Pre-correction review.

**Verdict: NOT CLEAR TO LAND.** Finding 1 and the doc fixes check out, but the new defensive guard (finding 4) introduced a regression that I reproduced in Chromium. A stale or forged result now changes the parent session and emits an outcome.

## Blocker: the new guard makes stale results reach the parent

**Where:** `packages/auth/src/lib/application/feature.ts:848-858`.
- When the flow isn't `refreshing`, the guard now returns the *same* `state` object for `refreshSucceeded`, `refreshFailed` and `expiryObserved`.
- Settlement markers are stored per state object (`sessionRefreshSettledMarkers`). The object a real settle marked stays in the slot, because nothing replaces it once parent and child expiry agree.
- So `reduceSessionRefreshResult` still finds that object's marker and acts on the stale action.
- Before this change, the plain child reducer always returned a new, unmarked object, so a stale result was dropped.

**Repro** (temporary Chromium test, since deleted). In each case a real request settled first, then I dispatched a forged result through the managed view:

| Real result | Forged dispatch | Parent effect |
|---|---|---|
| success, 13:00 | `refreshSucceeded` 2099 | `session.expiresAt` becomes `2099-01-01T00:00:00.000Z` and `{kind:'refreshed', expiresAt:'2099…'}` fires |
| 401 → `ended` | `refreshFailed` `invalid_credentials` | a second `{kind:'ended'}` fires and the resolve step runs again |
| `network` failure | `refreshFailed` `network` | a second `{kind:'failed'}` fires |

This breaks the replay protection that the CHANGELOG, the README and J-proof describe. It also lets a stale result extend the parent's expiry to an arbitrary value, so the parent may never refresh again. The existing test "drops stale or replayed refresh results" (`managed-session-refresh.test.ts:336`) misses it because it starts from a fresh, never-settled state.

**Suggested fix:** make the guard return an unmarked object, e.g. `[{ ...state }, Effect.none()]`, or delete the marker on that path. A reducer-owned `settled` field, as the password and delete-account flows use, would remove the class entirely. Add a regression test that forges each result after a real settle of the same kind.

## Verified corrections

- **Finding 1:** the slot now revives on a real transition into `authenticated` for the same subject (`feature.ts:1169-1173`): the previous status wasn't `authenticated`, the next one is, and the subject id is unchanged. New tests cover `sessionEstablished` and seeded `loginSucceeded` mid-resolve (`:637`, `:700`). The epoch-stale `sessionResolved` and "unrelated session action" tests still pass.
- **Findings 2 and 3:**
  - No stale `started` remains; README line 294 now says `watchStarted`.
  - README line 298 and J-proof line 29 now say the `ended` pulse fires in the reduction that sees the 401, before resolution. They no longer tie it to the backend confirming the session is gone.
  - Inventory rows 29 and 30 and consumer README line 38 now say "sequential isolated SSR renders" and "signup negative case installed; reset and short-existing sign-in are source-suite evidence".
- **My runs:** `managed-session-refresh` plus `auth-feature` passed 87/87 in Chromium, and the SSR session-refresh test passed 3/3.
- **Clean-up:** the repro file is deleted and `git status --porcelain` shows the same 30 entries as when this re-review started. `FINAL-ARTIFACT-RECEIPT.json` and `K-OPUS-REVIEW-1.md` are yours, not mine.

## Non-blocking notes

- **CHANGELOG line 47 is stale on recovery.** It still says only an accepted `sessionResolved` revives the watcher, while the README and J-proof now also list `sessionEstablished` and seeded login. The README's "(matching status and epoch, such as … `sessionEstablished`)" is also loose, because `sessionEstablished` carries no epoch.
- **J-proof lines 16 and 35 are inaccurate.** They say `ended` can come from "expiration or … `invalid_credentials`". The child only reaches `ended` on an `invalid_credentials` refresh failure.
- **A failed seeded re-login now revives the watcher.** `loginFailed` restores the previous authenticated subject, so the transition rule treats it as accepted. If the session really is dead, the next refresh gets another 401 and ends again, so it corrects itself. It's reachable only through the dev-seeded `login` path.

**Not verified by me:** the full suite, both installed matrices, the backend gate and the regenerated archive receipt are the coordinator's. They need to run after the guard fix above.
