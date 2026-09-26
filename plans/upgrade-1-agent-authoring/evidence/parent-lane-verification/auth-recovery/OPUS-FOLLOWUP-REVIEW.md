# Independent recovery correction review

**Verdict: the corrections are correct and nothing blocks them.** The three low-severity points from my earlier review about the forgot-password button, the README and the module comment are fixed. I found no new correctness defects. Two small test gaps remain, and neither needs fixing before merge.

**Evidence.** I only read code: the current `ForgotPasswordForm.svelte`, the diffs of `feature.ts` and the two test files, the new `ManagedRecoveryFooter.svelte`, and README lines 95–112. I ran nothing. The 61/61 focused tests and the 0/0 check are the lane's own results, not mine.

**Confirmed**
- **`signInLabel`** (`ForgotPasswordForm.svelte:49,61,233`): it defaults to "Back to sign in", so the default text is unchanged.
- **Default styling** (`:233,365–379`): the button now has the `forgot-form__back` class. There's no hover transition, and the focus outline changes instantly, which the animation policy allows.
- **Custom footer** (`:229–235`): when a `footer` is supplied it replaces the default button, so there's never two.
- **Standalone mode keeps its old behaviour:** the default button sits behind `binding.mode === 'managed'`, so a standalone form still shows only its `footer`, as before. `onSent` also stays standalone-only (`:149`).
- **Owner-bound dispatch:** the button calls `binding.flowStore.dispatch({ type: 'signInRequested' })`, and in managed mode `flowStore` is the owner-bound view. That's the same way `SignupForm:201`, `ResetPasswordForm:207,211` and `MfaChallengeForm:222` dispatch. The button is inside `{#if flow}`, so it disappears once the owner retires.
- **Rendered test** (`managed-forms.test.ts:210`):
  - The default branch shows "Return to account".
  - The custom branch hides it and shows "Custom return".
  - Clicking either one presents a login flow.
- **Pending-request test** (`auth-feature.test.ts:994`):
  - `signInRequested` while a forgot-password request is in flight aborts that request, presents an idle login, and the late result leaves `forgotPassword` null.
  - `requestNewLinkRequested` while a reset is in flight aborts it, and the late session is dropped: the session stays anonymous and there's no handoff.
  - This matches your choice to keep both actions as explicit intents.
- **Docs:**
  - README:103–107 now covers the refused `open…`, the footer replacement, `signInLabel` and navigation during pending requests.
  - The `feature.ts` module comment now includes the recovery flows, and the `authFeatureCore` comment now says "every temporary flow slot".

**Remaining gaps (tests only)**
1. **`auth-feature.test.ts:994`**: nothing tests `signInRequested` from a *reset* while its request is in flight, even though the README (lines 105–107) promises it. Adding a third step to this test, a reset `signInRequested` mid-request, would close it by asserting three things:
   - the request is aborted;
   - `login` is idle;
   - the late session is dropped, with no handoff.
2. **`managed-forms.test.ts:210`**: the rendered test only covers managed mode. Nothing asserts that a *standalone* form with no `footer` shows no "Back to sign in" button. The code looks right, but that compatibility isn't locked in by a test.
