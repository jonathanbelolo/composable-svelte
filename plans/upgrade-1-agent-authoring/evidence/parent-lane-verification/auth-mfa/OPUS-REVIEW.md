**Verdict: not clear to land.** Two blocking defects, both confirmed by reading the source. The rest of the slice is sound, but several of its ownership proofs can pass without testing anything.

I made no edits. The review is also saved in the plan file `/Users/jonathanbelolo/.claude/plans/read-only-independent-opus-5-5-elegant-fairy.md`.

## Blocking (confirmed in source)

**B1. Standalone regression: a dead "I have saved them" button.**
- `MfaEnrolment.svelte:268` now always passes `onAcknowledged={() => acknowledge(key)}`.
- `RecoveryCodes.svelte:37-43,146` shows the button only when `onAcknowledged` is set, and its docs say an absent handler means no button "rather than rendered inert".
- **Scenario:** standalone `<MfaEnrolment flowStore={store} />` with no `onDone`. After enrolment, the user sees a button that does nothing. Before this slice there was no button.
- `CHANGELOG.md:19` says "Standalone props and behavior are unchanged", which is now false. No test covers standalone without `onDone`.
- **Fix:** `onAcknowledged={binding.mode === 'managed' ? () => acknowledge(key) : binding.onDone}`.

**B2. A replayed acknowledgement is reported again.**
- `feature.ts:628-635` reports `enrolmentAcknowledged` whenever the state after the flow's reducer shows `enrolled` with codes.
- The enrolment reducer leaves the state unchanged on `recoveryCodesAcknowledged`, and the button stays on screen.
- **Scenario:** the parent doesn't close the enrolment on the outcome, or closes it later. A second click, or any repeat dispatch on the live view, reports `enrolmentAcknowledged` again. That breaks your "replayed cannot route" requirement.
- **Fix:** record the acknowledgement on the flow's state so the reducer refuses a second one. Otherwise, document that every click is reported.

## Lesser findings
- **Management outcomes are also judged from the post-reduction state only** (`feature.ts:647/648/651`).
  - A `disableSucceeded` arriving while the flow is already `disabled` is refused by the flow but still reported as `disabled`.
  - Re-dispatching the identical `regenerateSucceeded` or `*Failed` action object passes the object-identity checks and is reported again.
  - This contradicts `README.md:167` ("a result for an operation that is not in flight reports nothing"). It is only reachable by hand-dispatch or replay; effect-driven results are fine. The existing test (~settings:186) covers only a flow in `idle`.
- **No owning account for settings opened before sign-in.** Opening isn't limited to a signed-in session (`feature.ts:473/484`), and the retirement check skips cases where nobody was signed in before (`feature.ts:407`).
  - Possible scenario: at start-up the app opens enrolment while the session is still being checked, and the setup request goes out with A's cookie. The check fails, so the session falls back to anonymous, but A's secret still arrives and is shown. If B then signs in, A's secret stays on screen.
  - This is unlikely to happen in practice. Refusing to open without an authenticated subject, or storing the owning subject id, would close it.
- **`feature.ts:161` docs** say only logout, close, restart or `dismiss()` retire enrolment. They leave out retirement on a change of signed-in account and removal by the parent.
- **`consumer/README.md:67`** says the MFA additions haven't been run against installed tarballs. That line ships in the candidate archive and is out of date given the coordinator's installed runs.
- **The consumer tracks `retry` and `accounts` per left/right section, not per panel or per account** (`model.ts:52`). They survive close, restart, logout and a switch of account. A new panel can show a stale "Confirm it's you and retry", or a stale on/off reading for a different account. This affects the example app only, not the library.
- **`MfaEnrolment.svelte:333`**: the form dispatches to whichever view is currently passed in, not to the view its own copy of the markup was rendered for. This is inconsistent with the "each subtree dispatches to its own view" claim, but harmless in practice.

## Test strength: what can pass without proving ownership
- **`managed-mfa-views.test.ts:205-225` (departed subtree's click) is vacuous.** Svelte 5 handles `onclick` with one listener on the mount root, so a click on a detached button never reaches any handler, whatever it would have dispatched to. Also, `FeatureOutlet` already re-mounts its content per owner (`{#each instances as instance (instance.key)}`), so `isConnected === false` doesn't prove the component's own per-owner keying either.
- **The views restart test proves one start per owner only through `FeatureOutlet` mounting a fresh component.** The component's own reset path (`startedOwner`) never runs, because the recipe never passes a new view to the same component instance.
- **`managed-mfa-settings.test.ts:304` doesn't prove "a retired view cannot report an outcome".** Even if the late result and the old view's acknowledgement reached the new owner, they would report nothing: the new owner is idle, its codes are null, and the management acknowledgement never reports. Only the aborted-request assertions carry weight.
- **The "replaced by none" branch is untested apart from logout**, and logout clears the flows on its own path anyway. Changing `feature.ts:407` to retire only when switching to another signed-in account would pass every test. There are no expiry or resolve-to-anonymous cases.
- **Also untested:** a repeated acknowledgement (the test at 121-125 dispatches once) and standalone enrolment without `onDone`.
- **Consumer browser proof:** the right section's panel stays unread and never runs an operation. Concurrency between sibling features is proven only in the headless test at `managed-mfa-settings.test.ts:325`, which does hold up.

## Confirmed good
- Types: `ComponentProps` rejects callbacks and a plain store in managed mode, and rejects a managed view in standalone mode. Views are cached per owner in core, so the component's per-owner keys are valid. A retired view's dispatches are dropped.
- Server rendering starts nothing. After a failed start, "Try again" makes exactly one new request.
- The new result guards in the management reducer don't affect normal results.
- Disable and regenerate share a busy guard, so they can't run at once, and each has its own cancellation id. Enrolment and management effects in sibling features don't cancel each other.
- `reauthentication_required` keeps the operation and methods, stays visible, and both buttons stay enabled.
- The retirement wrapper around the session: during checks and sign-in the signed-in account stays the same, so re-checking or re-authenticating as the same user doesn't retire the settings. A switch to another account and logout retire them and abort pending requests.
- The `mfaOutcome` pulse is cleared on every action the feature handles and on retirement, so it can't carry over to an unrelated action or an old panel.
