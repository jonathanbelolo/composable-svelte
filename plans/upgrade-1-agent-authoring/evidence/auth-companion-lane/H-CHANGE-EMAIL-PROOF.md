# Managed change-email request and confirmation candidate proof

Status: CLEAR TO LAND after independent Opus review of the final diff. This implements the *Change email request/confirm* row of `A-INVENTORY.md`.

## Behavior and ownership

`createAuthFeature()` integrates optional managed `changeEmail` (`changeEmailSlot`) and `changeEmailConfirm` (`changeEmailConfirmSlot`) flows with genuine `PresentationView` ports and explicit parent outcome routing.

Request and confirmation occur across distinct page loads:

- **Change-email request (`changeEmailSlot`)**:
  - Belongs to the signed-in account: `openChangeEmail` is refused without an authenticated subject in the session slot, or while a temporary auth flow is live.
  - Coexists with other settings slots (such as `account`, `connectedAccounts`, `mfaManagement`); survives temporary flows opened after it.
  - Sibling features maintain independent state.
  - Retires with its active operations and drops late feedback upon subject switch, logout, or session expiration.
  - **Safe error rendering**:
    - An address that already has an account (`email_taken`) is safely presented as an informational offer ("That address already has an account.") rather than a red failure banner (`showsError` derived state).
    - Re-authentication demands (`reauthentication_required`) render in the alert banner (`role="alert"`) with the backend message (matching `ConnectedAccountsPanel` precedent) while keeping the form visible for re-authentication, and pulse the `reauthenticationRequired` outcome on both initial request failure and resend failure.
  - **Outcome pulse**: Reports `AuthFeatureState.changeEmailOutcome` (a one-reduction pulse cleared on every routed reduction and pulsed only when `flow.settled` is non-null):
    - `{ kind: 'requested', email }` — confirmation link dispatched; keeps pending confirmation state visible with "Send it again" resend capability.
    - `{ kind: 'resent' }` — confirmation email resent.
    - `{ kind: 'reauthenticationRequired', methods }` — backend requires re-authentication; names requested methods from the failed child action error (`child.error`).
  - **Replay suppression & resend cancellation**: `changeEmailReducer` sets `settled: state.status === 'submitting' ? 'request' : null` on request completion and `settled: state.resendStatus === 'sending' ? 'resend' : null` on resend completion. A new form submission cancels any in-flight resend effect and clears resend state; `resendSucceeded` / `resendFailed` are guarded by `resendStatus === 'sending'` to suppress late results. Direct dispatches and unrelated actions leave `settled: null`, suppressing stale or duplicate outcome pulses.

- **Change-email confirmation (`changeEmailConfirmSlot`)**:
  - Runs on the confirmation page load (`openChangeEmailConfirm`, `restartChangeEmailConfirm`, `closeChangeEmailConfirm`), seeded with the confirmation token. In managed mode, `EmailChangeConfirmation` automatically consumes the seeded token from flow state (`flow?.token`) when the `token` prop is omitted.
  - **Zero work during SSR**: Renders instructions without starting verification; `confirmEmailChange` sees 0 calls during SSR.
  - **Mount effect and attempt correlation**: On client mount, `EmailChangeConfirmation mode="managed" flowStore={view.store}` dispatches confirmation. If the token prop changes while confirming, the in-flight effect is cancelled via `tokenProvided` (AbortSignal cancellation as primary guard, attempt comparison as backup), status resets to idle, and attempt is incremented so stale results are dropped while the new token proceeds to confirmation. Remounting after an attempt does not re-dispatch confirmation for the same token, evaluating actual work/result facts (status confirming or confirmed, or idle with error) rather than attempt counter alone.
  - **Signed-in confirmation**: Uses the accepted current session; existing session subject is preserved untouched.
  - **Signed-out confirmation & 401 sign-in route**: When confirmation fails with `invalid_credentials` (401), the component truthfully explains that the user must sign in to the account that requested the change, offering a "Sign in" button that dispatches `signInRequested` to route to fresh sign-in (`loginReplaced` where predicate `isChangeEmailConfirmSignIn(action)` evaluates to `true`).
  - **Missing token handling**: A missing token (`token === null`) renders truthful instruction without starting network requests.
  - **Outcome pulse**: Reports `AuthFeatureState.changeEmailConfirmOutcome`:
    - `{ kind: 'confirmed', email }` — address successfully confirmed.
    - `{ kind: 'failed', error }` — confirmation failed (expired token, 401, etc.).
  - Retiring or closing the slot aborts in-flight requests and drops late results.

- **Keyed markup & Props typing**:
  - Entire component markup in both `ChangeEmailForm` and `EmailChangeConfirmation` is keyed by view owner (`{#each [owner] as key (key)}`), preventing preflush event mismatch and stale clicks from reaching retired owners.
  - `ManagedBinding` sets `onSignIn?: never` and `onConfirmed?: never`, enforced at compile time with negative type checks (`@ts-expect-error`) in both test components and installed consumer props.

## Exact local candidate and measured checks

- Committed base: `ff6a6b6a` (clean start commit).
- Package `check`: 0 errors, 0 warnings (`svelte-check --tsconfig ./tsconfig.test.json --fail-on-warnings`).
- Package `typecheck`: 0 errors (`tsc --noEmit`).
- Package `build`: pass (emitted 25 NodeNext Svelte declaration bridges).
- Full package Chromium test suite: 53 files, 893 passed (including 28 tests in `tests/managed-change-email.test.ts`).
- Full package SSR test suite: 9 files, 55 passed (including 4 tests in `tests/ssr/managed-change-email-ssr.test.ts`).
- Total package tests: 948 tests (893 Chromium + 55 SSR), all passed.
- Candidate archive: exact archive `/private/tmp/auth-change-email-candidate/composable-svelte-auth-0.2.1.tgz` with SHA256 `f2ee6c95c5045e205ab593aac333e32b914581b360ad2571986b1d29e0ef1a0f`. Both pinned consumers physically installed this archive.
- Physical consumers (regular installed package directories with consumer source matching the worktree, both physically installing the candidate archive above):
  - `/private/tmp/auth-oauth-min` (Svelte 5.20.0):
    - `npm run check`: 0 errors, 0 warnings.
    - `npm run build`: pass.
    - `npm run test:ssr`: pass ("Installed SSR render proof passed for two isolated roots").
    - `npm run test:browser`: pass ("Installed nested browser proof passed").
  - `/private/tmp/auth-oauth-current` (Svelte 5.55.3):
    - `npm run check`: 0 errors, 0 warnings.
    - `npm run build`: pass.
    - `npm run test:ssr`: pass ("Installed SSR render proof passed for two isolated roots").
    - `npm run test:browser`: pass ("Installed nested browser proof passed").
- Standalone behavior changes and compatibility:
  - Both standalone and managed modes benefit from attempt correlation and remount auto-retry prevention: a token change mid-flight cancels the in-flight effect via `tokenProvided` (AbortSignal cancellation as primary guard, attempt comparison as backup) and increments `attempt` to drop late results from the cancelled attempt, while remounting after an attempt suppresses duplicate execution for the same token based on actual status and error facts.
  - In `changeEmailConfirmReducer`, attempt correlation uses AbortSignal cancellation as primary guard and attempt comparison (`action.attempt !== state.attempt`) as backup, not token matching. `tokenProvided` while idle sets `attempt: 0`, counting only real confirmation requests. `ChangeEmailConfirmState` (not reducer) gains `token?: string | null | undefined`, `attempt?: number | undefined`, and a required `settled: 'confirmed' | 'failed' | null`. Stale, replayed, or out-of-order confirmation results dispatched when the flow is not confirming leave `settled: null` and emit no parent outcome pulse (though hand-dispatching `confirmationSucceeded` directly to the child store while idle mutates the child status and email).
  - `settled` is a required field on `ChangeEmailState` (`'request' | 'resend' | null`) and `ChangeEmailConfirmState` (`'confirmed' | 'failed' | null`).
  - Standalone props and callbacks (`currentEmail`, `onChanged`, `onReauthenticationRequired` on `ChangeEmailForm`; `token`, `onSignIn`, `onConfirmed` on `EmailChangeConfirmation`) remain 100% functional and required/supported; compile-time props checks in `consumer/src/Props.svelte` and `tests/test-components/ManagedFormProps.svelte` verify both managed and standalone variants with positive and negative (`@ts-expect-error`) checks.

## Caveats and non-blocking observations

- **Distinct page loads**: Change email request and confirmation are designed to execute on separate page loads. While both can be opened within the same lifetime in test recipes, in production the confirmation URL carries the query token to a dedicated confirmation page. When confirmed while signed in, the session subject remains preserved; when confirmed while signed out, 401 transitions to sign-in via `signInRequested`.
- **Subject email freshness on confirmation**: When confirmation succeeds, the backend updates the user's primary email address. The client session subject continues to hold the existing subject snapshot until the parent application triggers a session refresh or user reload.
- **Independent review**: Opus 5.5 reviewed the final diff and returned CLEAR TO LAND after reproducing and then rechecking the unmounted token-replacement case. In its final pass it ran 28 focused Chromium tests and 4 focused SSR tests; the full-suite and installed-consumer results above are coordinator measurements. This is an installed local candidate, not a published package.
