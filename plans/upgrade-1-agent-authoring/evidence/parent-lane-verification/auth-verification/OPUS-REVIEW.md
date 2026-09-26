**Verdict:** the change is sound, with one real standalone regression to fix or knowingly accept (M1) and two minor gaps. I only read code: I didn't run any tests, and I didn't open the auth contract or inventory.

**Checked and correct:**
- **Feature reducer (`feature.ts`):** `emailVerification` slot is added to `noFlows`, `hasLiveFlow`, the catalog, the dependencies and the handle. `open` refuses while any flow is live, and `restart` wipes all flows and replaces the owner (`emailVerificationReplaced`).
- **Handoff:** it requires a session (`child.session !== null`), `verified` status, and that the stored snapshot is the same object as the action's (`flow.session === child.session`). The null check matters: without it a no-session result (null === null) would pass. The shared `handOver` path makes it accepted or refused and clears the flow either way.
- **No-session and resend results:** they aren't consumed. The flow stays, and the consumer's `model.ts` routes on each specific action plus the child state.
- **`signInRequested`:** it swaps in a fresh login with `noFlows`, and `loginReplaced` (via `isVerificationSignIn`) retires a live login. This matches reset and signup.
- **Verify and resend:** they keep separate fixed cancellable IDs. Replacement or removal retires the owner, so late results are dropped (tested at auth-feature test diff lines 139–163).
- **Component:**
  - The standalone session effect is skipped in managed mode.
  - Managed props reject `sessionStore`, `onSuccess` and `onSignIn` at the type level (`Props.svelte` has `@ts-expect-error` checks for each).
  - A retired view has `state === undefined`, so `{#if flow}` renders nothing.
  - Clicks go through the `view` captured by the each block, so after a swap they can't reach an old sibling (the StoreSwap test covers this).
  - `$effect` doesn't run during SSR, so there's no server-side work.
- **Exports:** `AuthHandoffSource` gains `'emailVerification'`, and the flow types are already exported. Sibling managed components also skip a runtime `assertPresentationView` check, so the type-level brand alone matches existing practice.

**Defects:**

1. **M1: standalone regression.** `packages/auth/src/lib/components/EmailVerification.svelte:97-101` and `:153`.
   - The identity-based reset of `requested`, and the keyed `{#each [binding.flowStore] as view (view)}`, now apply to standalone mode as well.
   - Before this change, `requested` lasted for the whole component instance. That is the guard the comment at lines 85–89 calls load-bearing against the "fail → re-dispatch → fail" loop.
   - **Failure case:** a standalone consumer passes a flowStore object that is rebuilt whenever state changes, e.g. `flowStore={{ state: s.state, dispatch: s.dispatch }}`. A failed token returns to `idle`, the new object resets `requested`, and the same dead token is sent again, over and over. The keyed each also remounts the DOM on every state change, which loses focus.
   - **Fix:** apply the view-identity reset only when `binding.mode === 'managed'`, and render standalone without the keyed each (or key it on a constant). Standalone then behaves exactly as before, and managed keeps "once per view".

2. **L1: undocumented public change.** `packages/auth/src/lib/flows/email-verification/types.ts:79`. `signInRequested` is a new member of the public `EmailVerificationAction` union, so a consumer's exhaustive `switch` stops compiling. The CHANGELOG doesn't list it as an action-union addition; it should.

3. **L2: test gap.** Nothing drives `restartEmailVerification` with the **same** token through `FeatureOutlet` and asserts exactly one new exchange. That would prove "once per view" rather than "once per component instance". The current tests restart with a different token (`token-b`, `new-token`).
