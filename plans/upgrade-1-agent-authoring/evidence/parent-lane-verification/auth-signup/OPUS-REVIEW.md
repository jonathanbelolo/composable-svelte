# Independent Opus 5.5 signup review

Claude Code CLI; high effort; normal read-only tool access; parent task approval.

**The signup changes are sound: I found nothing that needs fixing, only two stale doc comments.** I only read the diff and the new files. I edited nothing and ran no tests, so none of this is backed by a test run.

**Doc nits (not bugs):**
1. `packages/auth/CHANGELOG.md:7`: the first `createAuthFeature()` entry now lists `SignupDependencies`, but it still describes only "optional `login` and `mfa` slots", "login and MFA slot handles", and "`openLogin` is refused while a login or MFA flow is live". The new entry on line 9 corrects all three, so the two entries contradict each other. Either fold signup into line 7 or remove the dependency change from it.
2. `packages/auth/src/lib/application/index.ts:2`: the module comment still says "optional login and MFA flows".

**Checked against your list:**
- **Package-owned `createAuthFeature`:**
  - The `signup` slot, `signupSlot`, the catalog entry, `SignupDependencies` and `initialState` (`signup: null`) are all added consistently.
  - `noFlows` and `hasLiveFlow` are used in every place that removes or refuses flows: `openLogin`, `openSignup`, `restartLogin`, `restartSignup`, `cancelSignIn`, `logout` and `handOver`.
- **Reducer-owned handoff and verification:**
  - A signup session is handed over only when `signupSucceeded` arrives, the flow's status is `succeeded`, and the stored session is the same object (`flow.session === child.session`). This matches the login and MFA checks, and the handover goes through the shared `handOver`, so a refusal during `loggingOut` also removes the flow.
  - `verificationRequired` leaves the flow in `awaitingVerification` with its `pendingEmail`, with no session and no handoff. The sibling test at `managed-auth-sibling-ownership.test.ts:136-138` checks exactly this.
- **Ownership and retirement:**
  - `signupReplaced` fires only on `restartSignup`. Core replaces an owner only when it is live both before and after, so restarting when no signup exists just creates one.
  - `loginReplaced` now also covers "Sign in instead" (`isSignupSignIn`), guarded by `after.login !== before.login`.
  - The sibling test shows the two siblings don't interfere: removing sibling A aborts A's request (`signups[2]` aborted), B's request is untouched (`signups[3]` not aborted), and A's late result is dropped.
- **Parent consumes only its own action:** the consumer's parent reducer (`consumer/src/model.ts:31-43`) records a verification only on the routed `signup/presented/verificationRequired` action, and only if the current state is still `awaitingVerification` with the same email. So a later auth action can't replay it (the browser script checks this with a refused `openSignup`), while a fresh lifetime after reset can record the same email again (the script expects 2 entries).
- **Managed `PresentationView`:** `SignupForm` follows the `LoginForm` pattern exactly: a `binding` object holding the rest props, `{#if flow}`, a form store per view, and the `Form` wrapped in `{#key formOwner}`. The standalone subscription and the handoff effect both return early in managed mode, and "Sign in instead" dispatches `signInRequested`.
- **Standalone compatibility:** props are unchanged. The fan-out subscription and `formStore` behave as before. `SignupFormStoreSwap.svelte` is a correct twin of `LoginFormStoreSwap` for swapping `flowStore`.
- **Exported types:**
  - `AuthHandoffSource` gains `'signup'`, and `AuthFeatureCatalog` and `AuthFeatureDependencies` are extended.
  - `SignupAction` gains `signInRequested`, which `signupReducer` handles as a no-op. The CHANGELOG notes that code switching exhaustively over `SignupAction` needs the new case.
  - `consumer/src/Props.svelte` uses `@ts-expect-error` to prove that managed `sessionStore` is rejected, spread included, and so is managed `onSignIn`.

**Behaviours worth knowing (not defects):**
- `signInRequested` is accepted in any signup status, including `submitting` and `awaitingVerification`. It retires the signup and aborts any request in flight. This is consistent with MFA's `startOverRequested`.
- `openSignup` is allowed while the session is already authenticated, the same as `openLogin`.

**Not verified:** `consumer/scripts/browser.mjs:63` waits for a "Sign in" button in the right-hand section. `auth.initialState()` opens no login, so this depends on earlier steps in the script that are outside the diff.

The plan file holds the same verdict; there is nothing to implement.
