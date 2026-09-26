# Managed change-password and delete-account candidate proof

Status: CLEAR TO LAND after independent Opus 5.5 review. This implements the *Change password and delete account* row of `A-INVENTORY.md` as a qualified local candidate, not a published package.

## Behavior and ownership

`createAuthFeature()` integrates optional managed `changePassword` (`changePasswordSlot`) and `deleteAccount` (`deleteAccountSlot`) settings slots with genuine `PresentationView` ports and explicit parent outcome routing.

Both slots belong to the signed-in account:

- **Settings slot lifetime & guards**:
  - Bound to authenticated subject: `openChangePassword` and `openDeleteAccount` are refused without an authenticated subject in the session slot, or while temporary sign-in flows (`login`, `mfa`, `signup`, `forgotPassword`, `resetPassword`, `emailVerification`, `oauthStart`, `oauthCallback`, `magicLinkRequest`, `magicLinkSignIn`, `changeEmailConfirm`) are live.
  - Sibling settings coexistence: they coexist with each other and other settings slots (`account`, `connectedAccounts`, `mfaManagement`, `mfaEnrolment`, `changeEmail`).
  - Sibling feature isolation: independent feature instances maintain separate slot owners and state.
  - Subject retirement: any change of the authenticated subject (logout, switching to a different account, or session expiration) retires slot owners in the managed composition, aborting in-flight effects and dropping late responses.
  - SSR safety: zero client-only work during SSR; no backend dependency calls run during server rendering.

- **Change-password (`changePasswordSlot`)**:
  - Renders `ChangePasswordForm mode="managed" flowStore={view.store}`.
  - Password policy: enforces repository password policy via the shared `passwordField()` schema (`PASSWORD_MIN_LENGTH` 12-character minimum).
  - Password clearing: on successful change, sensitive password values (`password`, `confirmPassword`) are immediately scrubbed from the form state (`createInitialFormState`), avoiding retention of credential values in long-lived state. When the backend demands re-authentication, entered values are preserved so the user is not forced to re-type.
  - Parent-owned handoff of rotated session:
    - If the backend returns a rotated `SessionSnapshot` whose `subject_id` matches the authenticated subject, the feature updates the parent session via internal `handOver` with `source: 'changePassword'`, and emits outcome `{ kind: 'changed', session }`.
    - If the backend returns a rotated session with a mismatched `subject_id`, the feature explicitly rejects it with `{ kind: 'rejected', reason: 'subjectMismatch', session, error }`, retaining the current session and attaching the error to the flow.
    - If the backend returns `null`, the current session snapshot is preserved and the outcome reports `{ kind: 'changed', session: null }`.
  - Outcome pulse: Reports `AuthFeatureState.changePasswordOutcome` (a one-reduction pulse cleared on every routed reduction and pulsed only when `flow.settled` is non-null):
    - `{ kind: 'changed', session: SessionSnapshot | null }` — password changed.
    - `{ kind: 'rejected', reason: 'subjectMismatch', session: SessionSnapshot, error: AuthError }` — rotated session subject mismatch.
    - `{ kind: 'reauthenticationRequired', methods }` — backend requires re-authentication; names requested methods from the failed child action error.
  - In-flight mutation safety: while password change is submitting (`status === 'submitting'`), closing the slot (`closeChangePassword`), restarting (`restartChangePassword`), and presentation dismissal are refused (no-op), preserving the in-flight request and session.
  - Standalone compatibility: standalone props (`sessionStore`, `onChanged`, `onReauthenticationRequired`) are preserved in standalone mode and rejected via `never` in managed mode. Standalone completions are tracked via a durable reducer-owned `completionCount` on `ChangePasswordState` (incremented on each settled `changeSucceeded`) and a module-level `WeakMap<object, number>`, so that an unhandled completion is handed over on remount while the flow remains `changed`, while re-renders, field edits, and remounts with no new completion never duplicate handoffs. Standalone consumers must handle a completed result before starting another operation and discard the flow store on logout or account switch; the standalone component does not validate the current account before handing over a retained session.

- **Delete-account (`deleteAccountSlot`)**:
  - Renders `DeleteAccountPanel mode="managed" store={view.store}`.
  - **Load-bearing confirmation gate**: The reducer enforces a strict two-step confirmation gate. A direct `deletionRequested` while idle is refused and never calls the backend; an explicit `confirmationRequested` action must precede deletion. Dismissing confirmation via `confirmationDismissed` returns status to `idle`.
  - **Parent-owned transition on deletion**: Account deletion is irreversible at runtime. When deletion succeeds, the feature transitions the session to `anonymous`, clears all live flows (`...allFlowsNull`), and emits `deleteAccountOutcome: { kind: 'deleted' }`.
  - **Re-authentication handling**: If the backend requires re-authentication, the demand is rendered in the panel and reports `deleteAccountOutcome: { kind: 'reauthenticationRequired', methods }`. The panel remains visible and allows re-confirming and retrying after re-authentication.
  - **Refusal while deleting**:
    - While `status === 'deleting'`, closing the slot (`closeDeleteAccount`), restarting (`restartDeleteAccount`), and presentation dismissal are refused (no-op), ensuring the client does not close the slot or abort while the backend is deleting the account.
    - An authenticated subject switch or `logout` safely retires the owner and aborts the request.
  - **Remount deduplication**: In standalone mode, a module-level `WeakSet<object>` tracking handed-over store instances ensures that remounting an already-completed standalone panel never duplicates `sessionStore.dispatch({ type: 'logout' })` or `onDeleted`. Deletion is terminal.
  - **Mock dependencies only**: Account deletion is irreversible; all tests strictly use mock dependencies (`deleteAccounts`), never calling a real service.
  - Standalone compatibility: the optional `confirm` snippet prop is supported in both standalone and managed modes. Standalone props (`sessionStore`, `onDeleted`, `onReauthenticationRequired`) are preserved in standalone mode and rejected via `never` in managed mode.

- **Keyed markup & Props typing**:
  - Entire component markup in both `ChangePasswordForm` and `DeleteAccountPanel` is keyed by view owner (`{#if flow}{#each [owner] as key (key)}`), preventing preflush event mismatch and stale clicks from reaching retired owners.
  - `ManagedBinding` sets standalone callbacks and session stores to `never`, enforced at compile time with negative type checks (`@ts-expect-error`) in both test components (`ManagedFormProps.svelte`) and consumer props (`Props.svelte`).

## Exact local candidate and measured checks

- Base commit: `6f2d4f2a` (clean start commit).
- Package `check`: 0 errors, 0 warnings (`svelte-check --tsconfig ./tsconfig.test.json --fail-on-warnings`).
- Package `typecheck`: 0 errors (`tsc --noEmit`).
- Package `build`: pass (emitted 25 NodeNext Svelte declaration bridges).
- Full package Chromium test suite: 54 files, 914 passed (including 21 tests in `tests/managed-password-delete.test.ts`).
- Full package SSR test suite: 10 files, 59 passed (including 4 tests in `tests/ssr/managed-password-delete-ssr.test.ts`).
- Total package tests: 973 tests (914 Chromium + 59 SSR), all passed.
- Candidate archive: `/private/tmp/auth-password-delete-candidate/composable-svelte-auth-0.2.1.tgz`, SHA256 `b3e50228c65457bb4717be3f84ad0222cd787b3cf05751c59fedabf7bb42e97f`.
- Physical consumer qualification: coordinator installed exactly that archive in `/private/tmp/auth-oauth-min` (Svelte 5.20.0) and `/private/tmp/auth-oauth-current` (Svelte 5.55.3). Both passed `check`, `build`, `test:browser`, and `test:ssr`. Both auth package directories are regular directories, their lockfile SHA512 integrity matches the archive, and their consumer recipe sources match the repository.
- Consumer recipe: fixtures aligned with same-subject rotation (`00000000-0000-4000-8000-000000000001`) in `consumer/src/main.ts` and `consumer/scripts/browser.mjs`, asserting unchanged subject UUID and updated display name, plus dedicated mismatch rejection recipe and assertion (`rejected:subjectMismatch`).

## Caveats and non-blocking observations

- **Refusal policy while deleting or submitting**: While `status === 'deleting'` or `status === 'submitting'`, closing the slot (`closeDeleteAccount` / `closeChangePassword`), restarting (`restartDeleteAccount` / `restartChangePassword`), and presentation dismissal are refused so in-flight requests are not aborted and slots remain open until completion. Explicit logout or subject switch remains the exit hatch that retires the owner and aborts the signal.
- **Password clearing timing**: Passwords are wiped from form state immediately upon successful reduction. If the backend demands re-authentication, the passwords are intentionally preserved in state so that the user does not lose their typed input.
- **Delete irreversibility**: Runtime deletion is permanent. All automated tests must use mock dependency functions to avoid destructive backend calls.
- **Independent review**: Opus 5.5 returned CLEAR TO LAND, running 82 focused Chromium tests, 4 focused SSR tests and typecheck itself. The full 914 Chromium / 59 SSR suite and exact installed-consumer results above were independently measured by the coordinator. The review noted a nonblocking gap in normal, non-pending presentation-dismiss test coverage; source inspection confirmed the dismissal route.
