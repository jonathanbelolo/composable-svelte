# @composable-svelte/auth

## [0.3.0] - 2026-09-26

### Added

- `createAuthFeature()`, from the new `@composable-svelte/auth/application` entry and the root barrel: a managed composition, on core's existing `ManagedIntegrationBuilder`, of a persistent session with optional `login`, `mfa` and `signup` slots. It returns the composition with its exact slot catalog, its slot handles and `initialState()`. It needs only `SessionDependencies & LoginDependencies & MfaChallengeDependencies & SignupDependencies`, not all of `AuthDependencies`. Login, MFA and signup session results are handed to the session by reductions, with nothing mounted. An `mfa_required` login result opens the challenge. `openLogin` is refused while any auth flow is live; `restartLogin` replaces the live login owner and removes other flows. `cancelSignIn`, a view's `dismiss()` and `logout` (even from an anonymous session) remove flows, so a late result from a removed flow is dropped with its owner. The state has no route; where to go next belongs to the containing application.
- `LoginForm` and `MfaChallengeForm` take `mode="managed"` with `flowStore` set to the feature's presentation view (`PresentationView<LoginState, LoginAction>` / `PresentationView<MfaChallengeState, MfaChallengeAction>`, as `defineViews` hands it to a content snippet). The managed branch takes no `sessionStore`, `onSuccess`, `onMfaRequired`, `onStartOver` or `challenge` — the types reject each one — because `createAuthFeature` performs the handoff, the MFA branch and the challenge seeding itself. Managed mode requires that feature or an equivalent parent handling those outcomes. When the view's owner retires its state becomes `undefined`, and the form then renders nothing and stops following it. The `Form` subtree and form store are keyed by the view, so departing field events cannot reach a replacement flow. Standalone use is unchanged: `mode` may be omitted or `'standalone'`, and `sessionStore` (both forms) and `onStartOver` (MFA) are still required.
- `createAuthFeature()` gains an optional managed `signup` slot (`signup: SignupState | null`, `signupSlot`, a `signup` catalog entry) and needs `SignupDependencies` as well. `openSignup` is refused while any login, MFA or signup flow is live, and `openLogin` is now also refused while a signup is live. `restartSignup` replaces the live signup owner and removes login and MFA; `restartLogin` also removes a signup. `cancelSignIn` and `logout` remove the signup too. A lifted `signupSucceeded` whose session the flow stored is handed to the shared accepted/refused decision once (`AuthHandoffSource` gains `'signup'`) and the flow is removed. `verificationRequired` keeps the flow in its terminal `awaitingVerification` state with `pendingEmail`, establishes no session and sets no handoff. Results addressed to an absent signup do nothing.
- `SignupForm` takes `mode="managed"` with `flowStore` set to the feature's `PresentationView<SignupState, SignupAction>`. The managed branch takes no `sessionStore`, `onSuccess`, `onVerificationRequired` or `onSignIn`, and performs no handoff in a component effect. As with the other managed forms, a retired view renders nothing and the `Form` subtree and its form store are keyed by the captured view. Standalone use is unchanged.
- `SignupAction` gains `{ type: 'signInRequested' }`, the managed form's `email_taken` "Sign in instead". `signupReducer` leaves the state unchanged; `createAuthFeature` removes the signup and presents a fresh sign-in, replacing a live login owner. A reducer that switches exhaustively over `SignupAction` needs the new arm.
- `createAuthFeature()` gains optional managed `forgotPassword` and `resetPassword` slots and the two recovery dependencies. A sent link keeps the editable forgot-password flow and its conditional message; the parent can observe each accepted request from its matching routed `requestSent` action. A reset that issues a session uses the shared accepted/refused handoff with source `resetPassword`; a reset without a session keeps its terminal state for parent routing. `openResetPassword` and `restartResetPassword` seed the link token explicitly. Flow replacement, cancellation, logout and parent removal retire pending recovery requests.
- `ForgotPasswordForm` and `ResetPasswordForm` take genuine presentation views in `mode="managed"`. Managed mode excludes standalone result callbacks and session dispatch; the feature owns outcomes and navigation actions. A retired view renders nothing, and each form subtree captures its own view. The standalone forms keep their existing props and behavior. `ForgotPasswordAction` gains `signInRequested`; `ResetPasswordAction` gains `signInRequested` and `requestNewLinkRequested` for managed navigation.
- `createAuthFeature()` gains an optional `emailVerification` slot with independent verify and resend operations. `openEmailVerification` and `restartEmailVerification` seed an optional resend address. A session result enters the shared accepted/refused handoff (`AuthHandoffSource` gains `'emailVerification'`) and retires the flow; verification without a session and resend results stay in the flow for action-specific parent routing. Replacement or removal cancels both pending operations and drops late feedback.
- `EmailVerification` takes the feature's genuine view in `mode="managed"`, with no session store or result callbacks. Its token prop still initiates one client-side exchange; no request runs during SSR. A retired view renders nothing. Managed sign-in dispatches `signInRequested`; the standalone token, session and callback behavior remains available.
- `EmailVerificationAction` gains `{ type: 'signInRequested' }`, the managed confirmed panel's "Sign in". `emailVerificationReducer` leaves the state unchanged; `createAuthFeature` removes the verification flow and presents a fresh sign-in, replacing a live login owner. A reducer that switches exhaustively over `EmailVerificationAction` needs the new arm.
- `createAuthFeature()` gains optional managed `mfaEnrolment` and `mfaManagement` settings slots (`mfaEnrolmentSlot`, `mfaManagementSlot`, catalog entries) and needs `MfaEnrolmentDependencies & MfaManagementDependencies` as well. `AuthFeatureAction` gains `openMfaEnrolment`, `restartMfaEnrolment`, `closeMfaEnrolment`, `openMfaManagement`, `restartMfaManagement`, `closeMfaManagement` and the two lifted `mfaEnrolment` / `mfaManagement` routes; a parent switching exhaustively over `AuthFeatureAction` needs the new arms. Opening either requires an authenticated subject, which owns them. The two may coexist and survive a later temporary flow and a same-subject handoff; any change of the authenticated subject — to another subject, to none, or from unresolved to someone — retires both. Open is also refused while that flow or a temporary flow is live. Close, restart, dismiss, `logout` and parent removal abort pending begin/confirm/disable/regenerate requests and drop late feedback.
- `AuthFeatureState.mfaOutcome` and the exported `AuthMfaOutcome`: a one-reduction pulse, `enrolmentAcknowledged`, `disabled`, `recoveryCodesRegenerated` or `reauthenticationRequired` with its `operation` and `methods`, set only for a transition admitted in that reduction. The feature admits `recoveryCodesAcknowledged` once per enrolment owner; management outcomes follow the management reducer's `settled` output, so a repeated acknowledgement or a replayed result reports nothing.
- `MfaEnrolmentState.acknowledged` (initially `false`): set by `createAuthFeature` when it accepts the acknowledgement, never by `mfaEnrolmentReducer`. `MfaManagementState.settled` (initially `null`): the operation whose result the last reduction accepted, cleared by every other action. Code that builds these states literally, rather than from `createInitialMfaEnrolmentState()` / `createInitialMfaManagementState()`, needs the new field.
- `MfaEnrolment` and `MfaManagementPanel` take the feature's genuine view in `mode="managed"` (`flowStore` and `store` respectively) and reject `onDone`, `onChanged` and `onReauthenticationRequired` there. The managed panel keeps a `reauthentication_required` failure visible, with both buttons enabled, because it cannot tell whether a parent routes `mfaOutcome`. The enrolment view starts once per owner on the client, never during SSR. A retired view renders nothing and each subtree dispatches to the view it was rendered for. Standalone props and behavior are unchanged.
- `MfaEnrolmentAction` gains `{ type: 'recoveryCodesAcknowledged' }`, dispatched by the managed recovery-code panel. `mfaEnrolmentReducer` leaves the state unchanged. A reducer that switches exhaustively over `MfaEnrolmentAction` needs the new arm.
- `MfaChallengeAction` gains `{ type: 'startOverRequested' }`, the managed MFA form's "Back to sign in". `mfaChallengeReducer` leaves the state unchanged. `createAuthFeature` removes the live challenge and presents a fresh sign-in. If a sign-in was also live, its owner is replaced (login `replaceOn`) rather than reused, so its request is aborted and its late result is dropped. A start-over from a retired or absent challenge changes nothing. A reducer that switches exhaustively over `MfaChallengeAction` needs the new arm.
- `AuthFeatureState.handoff`, a one-reduction output: `{ kind: 'accepted'; source; session }` or `{ kind: 'refused'; source; reason: 'loggingOut' }`, cleared by every action the feature reduces and set only by the reduction that hands a login, MFA, signup, reset-password, email-verification, or magic-link sign-in session to the session. A parent that embeds the feature reads it after its auth child, on auth-routed actions only.
- `createAuthFeature()` gains optional managed `oauthStart` and `oauthCallback` slots (`oauthStartSlot`, `oauthCallbackSlot`, catalog entries). `AuthFeatureAction` gains `openOAuthStart`, `restartOAuthStart`, `closeOAuthStart`, `oauthStart`, `openOAuthCallback`, `restartOAuthCallback`, `closeOAuthCallback`, and `oauthCallback`; a parent switching exhaustively over `AuthFeatureAction` needs the new arms. OAuth start initiates provider authorization with browser redirect, retaining provider, intent (`signIn` | `link`), and safe `returnTo` in `sessionStorage` (shared across sibling instances within the tab). OAuth callback runs on the return page with its own fresh owner and one-use callback parameters.
- `AuthFeatureState.oauthOutcome` and the exported `AuthOAuthOutcome`: a one-reduction pulse reporting `{ kind: 'signedIn', returnTo }`, `{ kind: 'linkCompleted', returnTo }`, `{ kind: 'mfaRequired', challengeId, methods }`, or `{ kind: 'failed', intent, error }`. Output `returnTo` is normalised to a same-origin path or `null`. OAuth sign-in hands the established session to the session slot via the shared accepted/refused reduction. OAuth provider linking **never** establishes or modifies a session, leaving the current session untouched. MFA requirements transition directly to a live managed MFA challenge slot only for sign-in intent; an `mfa_required` failure during a provider link reports `{ kind: 'failed', intent: 'link' }` without presenting an MFA challenge or touching the session. Denied, mismatched, or corrupt callbacks report terminal failure without exposing attacker-supplied error descriptions.
- `OAuthSignIn` and `OAuthCallback` take `mode="managed"` with `flowStore` set to the feature's genuine presentation view (`PresentationView<OAuthStartState, OAuthStartAction>` and `PresentationView<OAuthCallbackState, OAuthCallbackAction>` respectively). Managed `OAuthSignIn` initiates sign-in; no managed `ConnectedAccountsPanel` is claimed in this slice. Initiating a managed provider link is supported by opening the feature's `oauthStart` slot and dispatching `authorizationRequested` with `intent: 'link'` directly to that `oauthStartSlot` view. Managed `OAuthCallback` rejects `sessionStore`, `onSuccess`, `onStartOver`, and `onMfaRequired`, running its exchange once per owner on the client and never during SSR. Both components render nothing when their view is retired (`undefined` state) and key their DOM subtrees to the view owner to prevent stale clicks from targeting replaced flows. Standalone props and behavior are unchanged.
- `OAuthCallbackAction` gains `{ type: 'startOverRequested' }`, dispatched by the managed callback view when retrying or starting over from a failed or empty callback, or continuing from a completed panel left mounted by a parent. `oauthCallbackReducer` leaves state unchanged; `createAuthFeature` removes the callback flow and presents a fresh sign-in flow. When a callback fails (including a failed provider link), "Start again" dispatches `startOverRequested` which returns to fresh sign-in; no dedicated managed link retry route is provided. A reducer that switches exhaustively over `OAuthCallbackAction` needs the new arm.
- `createAuthFeature()` gains optional managed `magicLinkRequest` and `magicLinkSignIn` slots (`magicLinkRequestSlot`, `magicLinkSignInSlot`, catalog entries). `AuthFeatureAction` gains `openMagicLinkRequest`, `restartMagicLinkRequest`, `closeMagicLinkRequest`, `magicLinkRequest`, `openMagicLinkSignIn`, `restartMagicLinkSignIn`, `closeMagicLinkSignIn`, and `magicLinkSignIn`; a parent switching exhaustively over `AuthFeatureAction` needs the new arms.
- `AuthFeatureState.magicLinkOutcome` and the exported `AuthMagicLinkOutcome`: a one-reduction pulse reporting `{ kind: 'requestSent', email }`, `{ kind: 'signedIn' }`, or `{ kind: 'mfaRequired', challengeId, methods }`.
- `MagicLinkRequestForm` and `MagicLinkSignIn` take `mode="managed"` with `flowStore` set to the feature's genuine presentation view (`PresentationView<MagicLinkRequestState, MagicLinkRequestAction>` and `PresentationView<MagicLinkSignInState, MagicLinkSignInAction>` respectively). Managed `MagicLinkRequestForm` submits the request and renders the sent confirmation with a default back button returning to sign-in. Managed `MagicLinkSignIn` **never** spends its token on mount, GET, or during SSR: only an explicit user press initiates the exchange. On valid exchange, the session is handed to the parent via `handoff` with `source: 'magicLinkSignIn'`. An `mfa_required` outcome immediately branches to the managed `mfa` challenge slot and retires `magicLinkSignIn`. Missing token (`token === null`) or expired token (`error.code === 'token_expired'`) presents a recovery notice with "Send me a new link" dispatching `requestNewLinkRequested`. Other errors keep the default "Sign in" button enabled to allow retrying the token. "Sign in another way" dispatches `startOverRequested`. The sign-in view disables navigation buttons in markup and refuses navigation actions while an exchange is in flight. A new token prop arriving while submitting safely cancels the in-flight request, resets status to idle, and increments attempt correlation. Both views reject standalone callbacks and session stores, render nothing when retired (`undefined` state), and key their entire DOM subtrees to view owners.
- `MagicLinkRequestAction` gains `{ type: 'signInRequested' }`, the managed request form's "Back to sign in". `magicLinkRequestReducer` leaves state unchanged; `createAuthFeature` removes `magicLinkRequest` and presents fresh sign-in. A reducer that switches exhaustively over `MagicLinkRequestAction` needs the new arm.
- `MagicLinkSignInAction` gains `{ type: 'requestNewLinkRequested' }` (opening `magicLinkRequest`) and `{ type: 'startOverRequested' }` (returning to `login`). `magicLinkSignInReducer` leaves state unchanged. A reducer that switches exhaustively over `MagicLinkSignInAction` needs the new arms.
- `createAuthFeature()` gains optional managed `account` and `connectedAccounts` settings slots (`accountSlot`, `connectedAccountsSlot`, catalog entries). `AuthFeatureAction` gains `openAccount`, `restartAccount`, `closeAccount`, `account`, `openConnectedAccounts`, `restartConnectedAccounts`, `closeConnectedAccounts`, `connectedAccounts`, and `startOAuthLink`; a parent switching exhaustively over `AuthFeatureAction` needs the new arms. Both settings slots belong to the signed-in account: opening either requires an authenticated subject in the session slot (and is refused while temporary sign-in flows are active). Any change of the authenticated subject (logout, switching to a different account, or session expiration) retires both with their active operations and drops late feedback. `startOAuthLink` enables initiating OAuth provider linking with `intent: 'link'`, routing authorization through the genuine `oauthStart` slot owner so in-flight requests are properly bound and cancelled on retirement.
- `AuthFeatureState.connectedAccountsOutcome` and the exported `AuthConnectedAccountsOutcome`: a one-reduction pulse reporting `{ kind: 'unlinked', provider }` or `{ kind: 'reauthenticationRequired', provider, methods }`. The outcome is emitted only when `flow.settled === 'unlink'`.
- `createAuthFeature()` gains optional managed `changeEmail` and `changeEmailConfirm` slots (`changeEmailSlot`, `changeEmailConfirmSlot`, catalog entries). `AuthFeatureAction` gains `openChangeEmail`, `restartChangeEmail`, `closeChangeEmail`, `changeEmail`, `openChangeEmailConfirm`, `restartChangeEmailConfirm`, `closeChangeEmailConfirm`, and `changeEmailConfirm`; a parent switching exhaustively over `AuthFeatureAction` needs the new arms. `changeEmail` belongs to the signed-in account (`openChangeEmail` is refused without an authenticated subject or while temporary flows are live). `changeEmailConfirm` runs across distinct page loads (seeded with confirmation token).
- `AuthFeatureState.changeEmailOutcome` and `AuthFeatureState.changeEmailConfirmOutcome` (and exported `AuthChangeEmailOutcome` / `AuthChangeEmailConfirmOutcome`): one-reduction pulses reporting `{ kind: 'requested', email }`, `{ kind: 'resent' }`, or `{ kind: 'reauthenticationRequired', methods }` for request flow, and `{ kind: 'confirmed', email }` or `{ kind: 'failed', error }` for confirmation flow. The outcomes are emitted only when `flow.settled` is non-null. Both `changeRequestFailed` and `resendFailed` inspect the child action's error rather than stale flow state, correctly pulsing `reauthenticationRequired` without missed or false outcomes. Signed-in confirmation preserves current session subject.
- `ChangeEmailForm` and `EmailChangeConfirmation` take `mode="managed"` with `flowStore` set to the feature's genuine presentation view (`PresentationView<ChangeEmailState, ChangeEmailAction>` and `PresentationView<ChangeEmailConfirmState, ChangeEmailConfirmAction>` respectively). `ChangeEmailForm` safely renders `email_taken` as an informational notice rather than a red failure banner and renders re-authentication demands in the alert banner (`role="alert"`) with backend message while keeping the form visible. `EmailChangeConfirmation` automatically consumes the seeded token from state when the `token` prop is omitted. Both standalone and managed modes cancel in-flight requests and correlate attempts using the `attempt` counter (with AbortSignal cancellation as primary guard and attempt counter comparison as backup) on token changes, and both modes suppress duplicate confirmation on remount with the same token. When confirmation fails with 401 `invalid_credentials`, the component presents a clear explanation and "Sign in" button that dispatches `signInRequested` to route to login. Both views reject standalone callbacks (`onChanged`, `onReauthenticationRequired`, `onConfirmed`, and `onSignIn` typed as `never`), render nothing when retired (`undefined` state), and key their DOM subtrees to view owners.
- `ChangeEmailConfirmAction` gains `{ type: 'signInRequested' }`, the managed confirmation panel's "Sign in" on 401. `changeEmailConfirmReducer` leaves state unchanged; `createAuthFeature` removes `changeEmailConfirm` and presents fresh sign-in. A reducer that switches exhaustively over `ChangeEmailConfirmAction` needs the new arm.
- `ChangeEmailConfirmAction` gains `{ type: 'tokenProvided', token }`. Both in standalone and managed modes, when `tokenProvided` receives a different token while confirming, it cancels the active effect, resets status to idle, and increments the `attempt` counter so late results from the cancelled attempt are dropped; when idle, it records the new token and sets `attempt: 0`, counting only real confirmation requests.
- `ConnectedAccountsPanel` takes `mode="managed"` with `store` set to the feature's genuine presentation view (`PresentationView<ConnectedAccountsState, ConnectedAccountsAction>`). Can also receive `accountStore` (`PresentationView<AccountState, AccountAction>`) and `oauthStore` (`PresentationView<OAuthStartState, OAuthStartAction>`), or consume `providers`, `hasPassword`, and `onLink` via props/context. When provided with `accountStore`, its client-side mount effect dispatches `accountRequested` once per mounted view on client and never runs during SSR (`fetchAccount` is never called during SSR). Truthfully renders "Reading your account…" before read without false empty state, and "Account details are unavailable." when a passed `accountStore` has retired. Updates and prunes local unlinked knowledge after account re-read via `providersObserved`. Supported managed link action / port `onLink` enables opening or restarting `oauthStart` or dispatching `startOAuthLink` without violating genuine-view typing. Retired or unavailable OAuth start views are safely handled. Backend remains authority for unlink safety; no front-end rule denies unlink based only on password or provider count (`isLastWayIn` is advisory). Keyed markup protects against preflush events and retired view state. Standalone props and behavior remain 100% supported.
- `createAuthFeature()` gains optional managed `changePassword` and `deleteAccount` settings slots (`changePasswordSlot`, `deleteAccountSlot`, catalog entries) and needs `ChangePasswordDependencies & DeleteAccountDependencies` as well. `AuthFeatureAction` gains `openChangePassword`, `restartChangePassword`, `closeChangePassword`, `changePassword`, `openDeleteAccount`, `restartDeleteAccount`, `closeDeleteAccount`, and `deleteAccount`; a parent switching exhaustively over `AuthFeatureAction` needs the new arms. Both settings slots belong to the signed-in account: opening either requires an authenticated subject in the session slot (and is refused while temporary sign-in flows are active or without an authenticated subject). Any change of the authenticated subject (logout, switching to a different account, or session expiration) retires both with active operations and drops late feedback.
- `AuthFeatureState.changePasswordOutcome` and `AuthFeatureState.deleteAccountOutcome` (and exported `AuthChangePasswordOutcome` / `AuthDeleteAccountOutcome`): one-reduction pulses reporting `{ kind: 'changed', session: SessionSnapshot | null }`, `{ kind: 'rejected', reason: 'subjectMismatch', session: SessionSnapshot, error: AuthError }`, or `{ kind: 'reauthenticationRequired', methods }` for password change, and `{ kind: 'deleted' }` or `{ kind: 'reauthenticationRequired', methods }` for delete account. The outcomes are emitted only when `flow.settled` is non-null. A successful password change with a valid same-subject rotated session hands the new snapshot to the parent session via `handOver` with source `'changePassword'`; a null rotated session retains the current session. If the rotated session has a different subject than the authenticated user, it is explicitly rejected with `reason: 'subjectMismatch'`, retaining the current session and attaching the error to the flow. Successful account deletion transitions the session to `anonymous`, clears all flows, and emits `{ kind: 'deleted' }`.
- `ChangePasswordForm` and `DeleteAccountPanel` take `mode="managed"` with `flowStore` and `store` set to the feature's genuine presentation views (`PresentationView<ChangePasswordState, ChangePasswordAction>` and `PresentationView<DeleteAccountState, DeleteAccountAction>` respectively).
  - Managed `ChangePasswordForm` clears sensitive password fields (`password`, `confirmPassword`) from long-lived form state upon successful change, while preserving entered values if the backend demands re-authentication. While a change is in flight (`status === 'submitting'`), closing the slot (`closeChangePassword`), restarting (`restartChangePassword`), and presentation dismissal are refused (no-op), preserving the in-flight server mutation and session. Standalone props and callbacks (`sessionStore`, `onChanged`, `onReauthenticationRequired`) are rejected via `never` in managed mode. In standalone mode, completions are tracked via a durable reducer-owned `completionCount` and a module-level `WeakMap<object, number>`, so that an unhandled completion is handed over on remount while the flow remains `changed`, while re-renders, field edits, and remounts with no new completion never duplicate handoffs. Standalone consumers must handle a completed result before starting another operation and discard the flow store on logout or account switch; the standalone component does not validate the current account before handing over a retained session.
  - Managed `DeleteAccountPanel` honors the reducer's load-bearing two-step confirmation gate: direct deletion while idle is refused and requires explicit `confirmationRequested` first. While deletion is in flight (`status === 'deleting'`), closing the slot (`closeDeleteAccount`), restarting (`restartDeleteAccount`), and presentation dismissal are refused (no-op), ensuring the client does not dismiss or abort an active server deletion. Subject switch or `logout` safely retires the owner and aborts the request. The optional `confirm` snippet prop is supported in both standalone and managed modes. In standalone mode, a module-level `WeakSet<object>` tracking handed-over store instances ensures that remounting an already-completed standalone panel never duplicates `sessionStore.dispatch({ type: 'logout' })` or `onDeleted`. Both components render nothing when their view is retired (`undefined` state) and key their DOM subtrees to view owners. Standalone props and behavior remain 100% supported.
- `createAuthFeature()` gains optional managed `sessionRefresh` slot (`sessionRefreshSlot`, catalog entry) and needs `refreshSession` (and accepts optional `clock?: Clock`, `leadMs?: number`, `tickMs?: number`) in `AuthFeatureDependencies`. `AuthFeatureAction` gains `openSessionRefresh`, `restartSessionRefresh`, `closeSessionRefresh`, and `sessionRefresh`; a parent switching exhaustively over `AuthFeatureAction` needs the new arms. `openSessionRefresh` belongs to the signed-in account and is refused without an authenticated subject. When status reaches `'ended'`, the view is preserved across the session transition to anonymous so the ended snippet remains visible.
- `AuthFeatureState.sessionRefreshOutcome` and the exported `AuthSessionRefreshOutcome`: a one-reduction pulse reporting `{ kind: 'refreshed', expiresAt: string | null }`, `{ kind: 'ended', error: AuthError }`, or `{ kind: 'failed', error: AuthError }`. A successful refresh updates the parent's authenticated session `expires_at` truthfully without re-authenticating a different or logged-out account. An `invalid_credentials` error initiates `resolveSession` reconciliation (not unconditional logout). While resolution is in flight (`session.status === 'resolving'`), unrelated session actions leave the `ended` slot intact (preventing premature revival and duplicate refresh requests). When resolution completes: if the backend confirms the session is gone (`session: null`), the feature transitions to anonymous while preserving the ended view; if the backend or parent confirms the same authenticated subject via an accepted transition into authenticated (such as an accepted `sessionResolved` matching status and epoch, `sessionEstablished`, or seeded `loginSucceeded`), the watcher recovers from `ended` to `idle` with the resolved expiry (including when the resolved expiry is `null` or unchanged). Transient errors leave the authenticated session intact. Replay protection ensures only reductions from an actively refreshing state emit an outcome pulse.
- `SessionRefresh` takes `mode="managed"` with `store` or `flowStore` set to the feature's genuine presentation view (`PresentationView<SessionRefreshState, SessionRefreshAction>`) and optional `ended` snippet. In managed mode, standalone authority prop `sessionStore` is forbidden via `never`. Watcher lifetime is tied to client-side attachment (`$effect`), running zero work in SSR. Multiple mounted attachments for the same owner are reference-counted via a module-level `WeakMap` without duplicate timers, stopping only when the last attachment unmounts. Old-owner cleanup never stops a replacement owner. DOM markup is keyed by view owner. In standalone mode, `expiryObserved` now clears `error` when recovering from `ended` to `idle`, and standalone attachments are reference-counted per `flowStore` without duplicate timers; standalone watch/expiry forwarding and ending behavior remain fully functional.

### Changed

- Requires `@composable-svelte/core` `^0.13.1` and Svelte `^5.20.0` as peers.
- **Breaking pre-release API change: `AuthFeatureDependencies` requires `refreshSession`.** Any store constructed over `createAuthFeature()`'s composition must now supply `refreshSession: (signal?: AbortSignal) => Promise<SessionLifetime>` (and optional `clock?: Clock`, `leadMs?: number`, `tickMs?: number`) in its dependencies object.
- `createInitialSessionRefreshState()` accepts an optional `expiresAt: string | null = null` argument, preserving standalone exact key order `['error', 'expiresAt', 'status']`.
- **Breaking pre-release API change: `AuthFeatureDependencies` requires `changePassword` and `deleteAccount`.** Any store constructed over `createAuthFeature()`'s composition must now supply `changePassword: (newPassword: string, signal?: AbortSignal) => Promise<SessionSnapshot | null>` and `deleteAccount: (signal?: AbortSignal) => Promise<void>` in its dependencies object.
- **Breaking pre-release change: `ChangePasswordState` gains `settled: 'changed' | 'failed' | null` and `completionCount: number`.** `ChangePasswordState` gains a required `completionCount: number` (initialized to `0` and incremented on each settled `changeSucceeded`) and a required `settled: 'changed' | 'failed' | null` field (`null` initially and cleared before every other action, set to `'changed'` or `'failed'` only when `changeSucceeded` or `changeFailed` settles a change operation in flight). Anyone manually constructing `ChangePasswordState` literals rather than using `createInitialChangePasswordState()` must include these fields. In the managed feature, stale, replayed, or out-of-order results dispatched when the flow is not awaiting a response leave `settled: null` and emit no parent outcome.
- **Breaking pre-release change: `deleteAccountReducer` gains `settled: 'deleted' | 'failed' | null`.** `deleteAccountReducer` gains a required `settled: 'deleted' | 'failed' | null` field (`null` initially and cleared before every other action, set to `'deleted'` or `'failed'` only when `deletionSucceeded` or `deletionFailed` settles a deletion operation in flight). Anyone manually constructing `DeleteAccountState` literals rather than using `createInitialDeleteAccountState()` must include this field. In the managed feature, stale, replayed, or out-of-order results dispatched when the flow is not awaiting a response leave `settled: null` and emit no parent outcome.
- **Breaking pre-release API change: `AuthFeatureDependencies` requires `requestEmailChange`, `resendEmailChange`, and `confirmEmailChange`.** Any existing callers of `createAuthFeature(deps)` must now supply `requestEmailChange: (newEmail: string, signal?: AbortSignal) => Promise<void>`, `resendEmailChange: (signal?: AbortSignal) => Promise<void>`, and `confirmEmailChange: (token: string, signal?: AbortSignal) => Promise<string>` in their dependencies object.
- **Breaking pre-release change: `changeEmailReducer` status guard and `ChangeEmailState.settled`.** `changeEmailReducer` gains a required `settled: 'request' | 'resend' | null` field (`null` initially and cleared before every other action, set to `'request'` or `'resend'` only when a request or resend completes in flight). Anyone manually constructing `ChangeEmailState` literals rather than using `createInitialChangeEmailState()` must include this field. New form submissions cancel any in-flight resend effect, and `resendSucceeded` / `resendFailed` are guarded by `resendStatus === 'sending'` so late resend results after a new submission are suppressed. In the managed feature, stale, replayed, or out-of-order results dispatched when the flow is not awaiting a response leave `settled: null` and emit no parent outcome.
- **Breaking pre-release change: `ChangeEmailConfirmState` gains `settled` / `attempt` / `token`.** `ChangeEmailConfirmState` gains `token?: string | null | undefined`, `attempt?: number | undefined`, and a required `settled: 'confirmed' | 'failed' | null` (`null` initially and cleared before every other action, set to `'confirmed'` or `'failed'` only when confirmation settles in flight). Anyone manually constructing `ChangeEmailConfirmState` literals rather than using `createInitialChangeEmailConfirmState()` must include this field. Both standalone and managed modes benefit from attempt correlation (dropping late results from cancelled attempts via AbortSignal cancellation as primary guard and `attempt` counter comparison as backup) and remount auto-retry prevention for the same token. In the managed feature, stale, replayed, or out-of-order results dispatched when the flow is not confirming leave `settled: null` and emit no parent outcome (though hand-dispatching `confirmationSucceeded` directly to the child store while idle mutates the child status and email).
- **Breaking pre-release API change: `AuthFeatureDependencies` requires `fetchAccount` and `unlinkOAuthProvider`.** Any existing callers of `createAuthFeature(deps)` must now supply `fetchAccount: (signal?: AbortSignal) => Promise<AccountSnapshot>` and `unlinkOAuthProvider: (provider: string, signal?: AbortSignal) => Promise<void>` in their dependencies object.
- **Breaking pre-release change: `connectedAccountsReducer` status guard and `ConnectedAccountsState.settled`.** `connectedAccountsReducer` gains a required `settled: 'unlink' | null` field (`null` initially and cleared before every other action, set to `'unlink'` only when `unlinkSucceeded` or `unlinkFailed` settles an unlinking operation in flight). Anyone manually constructing `ConnectedAccountsState` literals rather than using `createInitialConnectedAccountsState()` must include this field. In the managed feature, stale, replayed, or out-of-order results dispatched when the flow is not awaiting a response leave `settled: null` and emit no parent outcome.
- **Breaking pre-release API change: `AuthFeatureDependencies` requires `beginOAuth` and `completeOAuth`.** Any existing callers of `createAuthFeature(deps)` must now supply `beginOAuth: (provider: string, signal?: AbortSignal) => Promise<OAuthStart>` and `completeOAuth: (provider: string, code: string, state: string, signal?: AbortSignal) => Promise<SessionSnapshot>` in their dependencies object, even if they do not mount or use OAuth slots. `linkOAuthProvider`, `pendingOAuth`, and `redirect` remain optional (defaulting to per-tab `sessionStorage` and browser navigation).
- **Breaking pre-release API change: `AuthFeatureDependencies` requires `requestMagicLink` and `signInWithMagicLink`.** Any existing callers of `createAuthFeature(deps)` must now supply `requestMagicLink: (email: string, signal?: AbortSignal) => Promise<void>` and `signInWithMagicLink: (token: string, signal?: AbortSignal) => Promise<SessionSnapshot>` in their dependencies object, even if they do not mount or use magic-link slots.
- **Breaking pre-release change: `oauthCallbackReducer` exchange guard and `OAuthCallbackState.settled`.** `oauthCallbackReducer` now ignores `exchangeSucceeded` and `exchangeFailed` unless `status === 'exchanging'` for standalone callers too; results arriving when the flow is not awaiting an exchange are discarded. `OAuthCallbackState` gains a required `settled: 'succeeded' | 'failed' | null` field (`null` initially and cleared before every other action, set to `'succeeded'` or `'failed'` only when an exchange settles an active request in flight). Anyone manually constructing `OAuthCallbackState` literals rather than using `createInitialOAuthCallbackState()` must include this field. In the managed feature, stale, replayed, or out-of-order exchange results dispatched when the flow is not awaiting an exchange leave `settled: null` and emit no parent outcome.
- **Breaking pre-release change: `magicLinkRequestReducer` status guard and `MagicLinkRequestState.settled`.** `magicLinkRequestReducer` now ignores `requestSent` and `requestFailed` unless `status === 'submitting'` for standalone callers too; results arriving when the flow is not awaiting a response are discarded. `MagicLinkRequestState` gains a required `settled: 'sent' | null` field (`null` initially and cleared before every other action, set to `'sent'` only when `requestSent` completes a submission in flight). Anyone manually constructing `MagicLinkRequestState` literals rather than using `createInitialMagicLinkRequestState()` must include this field.
- **Breaking pre-release change: `magicLinkSignInReducer` status guards, in-flight navigation refusal, token replacement cancellation, and `MagicLinkSignInState.settled` / `attempt`.** `magicLinkSignInReducer` now ignores `signInSucceeded` and `signInFailed` unless `status === 'submitting'`; effect-driven results carry an attempt ID that must match the active attempt. Results arriving when the flow is not awaiting an exchange are discarded, and effect-driven results from superseded attempts are discarded. The feedback actions retain optional `attempt` for standalone callers; a manually dispatched action without it is guarded by status only. Navigation actions `requestNewLinkRequested` and `startOverRequested` are refused while `status === 'submitting'`. Changing the token via `tokenProvided` while `submitting` cancels the in-flight effect, resets status to `idle`, clears error/session/settled, and increments attempt counter. Repeating `tokenProvided` with the same token is now a no-op and retains the current error. `MagicLinkSignInState` gains required `settled: 'succeeded' | 'failed' | null` and `attempt: number` fields. Anyone manually constructing `MagicLinkSignInState` literals rather than using `createInitialMagicLinkSignInState()` must include these fields. In the managed feature, stale, replayed, or out-of-order results dispatched when the flow is not awaiting a response leave `settled: null` and emit no parent outcome.
- `mfaManagementReducer` now ignores `disableSucceeded`/`disableFailed` unless a disable is in flight, and `regenerateSucceeded`/`regenerateFailed` unless a regeneration is. Effect-driven results are unaffected; a result dispatched by hand for an operation that is not running no longer changes the state.

- The `sessionEstablished` rule (refused only while `loggingOut`) is one internal decision shared by `sessionReducer` and the managed feature, which reads its accepted/refused result directly instead of inferring it from the session state. `sessionReducer`'s behaviour is unchanged.

### Fixed

- `loginReducer` no longer starts a sign-in request on a `submissionSucceeded` that does not complete a submission in flight: one the form reducer refused (a superseded `submissionId`, or a stamped one arriving after a reset), or an unstamped one while nothing is submitting. It previously sent whatever the fields then held.
- The same check in the seven other form-backed flows — `signupReducer`, `forgotPasswordReducer`, `resetPasswordReducer`, `changeEmailReducer`, `magicLinkRequestReducer`, `changePasswordReducer` and `mfaEnrolmentReducer`. Each started its request on any `submissionSucceeded`, including one the form reducer had refused. A replayed result could send a second reset or sign-in link, and after `changeEmailReducer` or `changePasswordReducer` succeeded (both clear their fields), a stale result submitted the empty fields. `resetPasswordReducer` checks this before its missing-token check, so a stale result no longer reports the link as broken. A new submission still cancels and replaces the request in flight in every flow. Signing up again after a success, asking again after `sent` and changing the password again stay allowed.
- `mfaEnrolmentReducer` also confirms a code only while `confirming` or `submitting`. An accepted submission result arriving after `enrolled` used to confirm the finished enrolment again. That confirmation fails, and the failure returned the flow to `confirming`, which took the one-time recovery codes off the screen.

## [0.2.1] - 2026-09-18

### Fixed

- Correct public repository and documentation links for external consumers.
- Export the stores used by the login form example and verify it in an installed application.

### Added

- Ship the complete default HTTP adapter contract: 27 routes, payloads, status/error semantics and backend responsibilities.


## [0.2.0] - 2026-09-18

### Changed

- Requires `@composable-svelte/core` `^0.12.0` (peer range): core 0.12.0 is a minor release with breaking changes to the navigation DSL's action shape, the API client's dedup/cache, the WebSocket config, `renderToHTML` and `TestStore`; see core's changelog.
- **An all-whitespace email address now reports "Email is required" on submit**,
  matching what it already said while typing. Core's two validation paths used
  to disagree about which of the two issues to show; both now take the first.
  `magic-link-flow.test.ts` pinned the old message deliberately so that a fix
  had to come past it, and it did.

- The `FormState` slices in the eight flow states change shape with core's:
  `fields` is keyed by field path and is partial, so `state.form.fields.email.error`
  becomes `state.form.fields.email?.error`.


- **BREAKING: `AuthDependencies` gains six members** — `beginOAuth`,
  `completeOAuth`, `requestMagicLink`, `signInWithMagicLink`, `fetchAccount` and
  `changePassword`. A hand-written adapter must add all six. They are required rather than optional,
  because every existing member is, and making them optional would push a null
  check into the flows. Consumers on `@composable-svelte/auth/flows` are
  unaffected: each flow's dependency interface names only the calls it makes, so
  an app that uses neither OAuth nor magic links never constructs them.

- **BREAKING: `SessionState.error` is `AuthError | null`, not `string | null`.**
  `sessionResolveFailed`, `loginFailed` and `loggedOut` carry the same, and
  `AuthGuard`'s `fallback` snippet now receives the structured error.

  A sentence could not be branched on. Every failure arrived as
  `"Login failed (401)"`, because the HTTP layer discards the response body on
  non-2xx — so "wrong password", "confirm your email first", "this account is
  locked" and "now enter your second factor" were indistinguishable. The last of
  those is not a failure at all; it is the login flow branching, and there was
  nowhere to put the challenge id it needs.

  `AuthError` is a discriminated union of eight arms — `invalid_credentials`,
  `mfa_required`, `email_unverified`, `account_locked`, `rate_limited`,
  `token_expired`, `network`, `unknown` — each carrying its payload in typed
  fields rather than in prose a caller would have to parse back out.

  **Migration:** read `error.message` where you read `error`. A `fallback`
  snippet rendering `{error}` now renders `[object Object]`; use
  `{error?.message}`. Branch on `error.code` where you were matching strings.

  Every field in the union is a JSON primitive — `account_locked.until` is an
  ISO 8601 string, not a `Date`. Core hydrates SSR state with `JSON.stringify`,
  which turns a `Date` into a string while the type still claims `Date`, so
  `until.toISOString()` would typecheck and throw after hydration.


- **`AuthError` gained `email_taken`** (8 arms → 9), and `409` maps to it.
  Signup's characteristic failure previously arrived as `unknown`, and the
  useful response to it is not a red banner but an offer — sign in instead, or
  reset the password. A surface cannot make that offer by reading prose.

  It leaks that an address is registered, which is the caller's call: a backend
  treating account existence as private should answer signup for a known address
  exactly as for an unknown one, and then this arm never arrives.

  `KNOWN_CODES` in the HTTP adapter is now keyed off `Record<AuthErrorCode, true>`
  rather than an array with `satisfies AuthErrorCode[]` — that form checks the
  values are assignable but not that they are exhaustive, so a new arm could
  have joined the union and simply never been accepted from a backend.

- **Email verification** — `emailVerificationReducer`,
  `createEmailVerificationStore`, `tokenFromUrl`, and `EmailVerification`.
  Signup's `awaitingVerification` terminal now has something that consumes the
  link it points at.

  **No form.** The input arrived in a URL, so the work starts on mount and the
  only thing a user can type is nothing. That removes the form slice and the
  schema — a token is opaque, and validating its shape here would reject links a
  future backend issues.

  **The token is single-use, so the request is guarded twice.**
  `verificationRequested` is refused unless the status is `idle`, and the
  component separately tracks which token it has already asked about. Both are
  wanted: one stops the dispatch, the other stops whatever gets past it. A
  Svelte effect re-runs for reasons unrelated to its subject, and a second
  exchange spends a working link and then reports the failure as the user's
  fault. Removing the component guard does not merely double-exchange — it
  hangs.

  **Confirming and resending are tracked separately**, because a failed
  confirmation with a resend in flight is the ordinary state of this page. A
  successful resend deliberately leaves the confirmation error alone: that link
  is still dead, and clearing it would be a lie the user acts on.

  `verifyEmail` resolving with `null` is a success — the address is confirmed
  and the user still has to sign in. Only a non-null session reaches the session
  store.

- **Password recovery** — `forgotPasswordReducer` / `ForgotPasswordForm` and
  `resetPasswordReducer` / `ResetPasswordForm`, completing the credentials
  family. The `<a href="/forgot">` this package has shown in its own README
  example since sign-in landed now points at something.

  **Asking for a link tells you nothing, on purpose.** `requestPasswordReset`
  resolves whether or not the address has an account, and the surface says "if
  there is an account for…" rather than confirming one. Distinguishing the two
  would make the form an account checker; a test asserts the two outcomes render
  *identical text*, because that is where the leak would actually appear.

  **Success is not terminal here**, unlike signup's. The message is conditional,
  so a user who mistyped their address needs the form still in front of them —
  it sits beside the form rather than replacing it, and each acceptance is
  reported so a second attempt is not swallowed.

  **Reset deliberately does not copy verification's token guards.** That flow
  exchanges on mount, so an effect that re-fires spends a single-use link;
  this one exchanges on submit, where there is no mount effect to re-fire. The
  fixed cancellation id every form flow has is the whole of it, and a comment
  says so, because copying the guards is the obvious mistake.

  A dead or missing link does not leave a form up that cannot succeed: both end
  in the same offer of a new link. `resetPassword` resolving with `null` is a
  success — the password changed, and the user signs in with it.


- **The password policy moved to `flows/password-policy.ts`**, shared by signup
  and reset so a user cannot be told one thing creating an account and another
  recovering it. Every schema builds its password field from `passwordField()`
  rather than restating the rules. **No exported name moved** — the barrels
  re-export exactly as before. The coupling this fixes was already visible:
  `PasswordCriteria`, a component about passwords in general, was reaching into
  `flows/signup/schema.ts`.

- **The account surface begins** — `accountReducer`, `changePasswordReducer` /
  `ChangePasswordForm`, and `SignOutButton`.

  **The first components for someone who is already signed in.** Seven flows got
  a user from anonymous to authenticated and nothing let them act afterwards.
  Measured before starting: no component in this package read the session store
  and dispatched to it — `AuthGuard` and `RoleGate` both type their prop as
  `{ readonly state: SessionState }` with the comment "for a `dispatch` this
  component never calls" — and `{ type: 'logout' }` had **zero call sites** in
  the whole repository.

  **`fetchAccount()` is a separate read, deliberately.** `SessionSnapshot`
  carries identity and nothing else, and it should stay that way: it crosses SSR
  hydration and rides along with every authenticated render, so widening it to
  hold an email and a provider list would make every page pay for what one page
  needs. `AccountSnapshot` answers the questions a panel must ask before it can
  render honestly — `hasPassword` decides whether the password panel says "set"
  or "change", and getting that wrong offers to change something an OAuth-only
  account never had.

  **Re-authentication is the backend's call, and that is forced by a fact.** The
  client cannot ask for a current password: `SessionSnapshot` has no
  credential-kind field, so nothing here knows whether an account *has* one, and
  accounts created through OAuth or a magic link never set one. So
  `changePassword` takes only the new value, and a backend that wants proof
  rejects with a twelfth `AuthError` arm, `reauthentication_required`, carrying
  which methods it accepts. That is the shape `mfa_required` established — the
  backend says the flow branches and says what it needs — and like it, the arm
  is a **branch, not a failure**: a surface handling it shows no red banner.

  `methods` is required on the arm rather than optional, which the compiler
  enforced usefully: the adapter's `default` case could not build one, because a
  demand for proof carrying no way to satisfy it would strand the user on a
  prompt with nothing to answer.

  **The package ships panels, not a settings shell.** Chrome is the app's, and
  this is the third time that line has been drawn — after the QR encoder and the
  provider logos. The repo's own primitives make the case: `Tabs` holds no state
  at all, `Accordion` cannot accept an external store, and there is no
  confirmation component anywhere.

  Smaller, and overdue: `subjectDisplayName()` beside `subjectRoles()`.
  `display_name` has been written into `attributes` since the package began and
  **nothing ever read it back**; a settings panel is the first surface that wants
  it, and digging it out of `Record<string, unknown>` at the call site is what a
  helper exists to prevent.

  `SignOutButton` surfaces something that previously had nowhere to go. Sign-out
  is fail-closed — the client goes anonymous even when the request never reached
  the server, because the cookie is HttpOnly and it cannot verify either way —
  and the resulting `SessionState.error` could only appear in `AuthGuard`'s
  `fallback`, after the UI had already switched to the signed-out view.

- **Magic links** — `magicLinkRequestReducer` / `MagicLinkRequestForm`,
  `magicLinkSignInReducer` / `MagicLinkSignIn`.

  **The last of the four routes `sessionEstablished` names.** Its doc comment
  has listed "a credentials login, an MFA challenge, an OAuth callback and a
  magic link" since the action was written. Three shipped; this is the fourth,
  and the list is now a description rather than a promise.

  **The token is spent on a press, never on mount**, and that is the whole
  design rather than a detail. Mail scanners and link prefetchers follow links
  before a person does. `EmailVerification` auto-consumes and is right to: a
  scanned verification link still verifies the address, which is what it was
  for. A scanned *sign-in* link is spent before its owner sees the page, so
  their link is dead on arrival and the replacement they request is eaten the
  same way. A scanner issues a GET; it does not press buttons.

  The consequence is a component with less machinery, not more: nothing
  dispatches from an effect, so there is no mount guard, no "has this token been
  handed over" flag, and none of the short-circuit-ordering subtleties those
  have cost this package. The only guard left is against a double press, which
  would spend a single-use token twice and tell someone a link that just worked
  is no longer valid.

  **Failure returns to `idle`, unlike the OAuth callback**, which is terminal —
  and the difference is real rather than stylistic. An OAuth code is spent at
  the provider before the app hears about it, so nothing can succeed from
  `idle` there. A `network` failure here may mean the request never arrived and
  the token is untouched, so pressing again is a genuine recovery.
  `token_expired` is the one that is not, and the surface branches on it to
  withdraw the button and offer a new link.

  **No new `AuthError` arms.** A spent or malformed link is `token_expired`,
  not distinguished for the reason `verifyEmail` documents; a hammered request
  endpoint is `rate_limited`; and `mfa_required` reaches here too, because
  proving control of a mailbox is not proving possession of a device.

  The request half is `forgot-password` with a different verb, including its
  refusal to say whether the address has an account, and its `onSent` is keyed
  on the attempt rather than the address — the defect `ForgotPasswordForm`
  shipped, where asking twice for the same inbox produced one callback.

  `MagicLinkSignIn` takes a `token` prop and dispatches `tokenProvided`, as all
  four siblings do with their own values. It shipped without one on the first
  pass, which left `tokenProvided` declared, documented, and with no caller
  anywhere — and left a token arriving after mount, from a router resolving its
  parameters, with no way into the flow.

  An unhandled `mfa_required` **withdraws the press** rather than offering it.
  That case means the exchange got far enough to consume the token, so pressing
  again cannot work; the first pass offered a "Sign in" button that would
  re-spend a consumed token and fail, which is the same dead end the MFA work
  exists to close, rebuilt in a new component.

  `MagicLinkSignIn.email` is display-only, and the doc comment says plainly that
  the consumer owns its provenance: the token is opaque, so the component cannot
  learn the address from it, and a value read straight out of the URL would be
  attacker-controlled text rendered in the app's own chrome.

- **OAuth** — `oauthStartReducer` / `OAuthSignIn`, `oauthCallbackReducer` /
  `OAuthCallback`, and the pending-record storage they share.

  **`sessionEstablished` finally has its fourth caller.** Its doc comment has
  named "an OAuth callback" since the action was created, its reducer case
  repeats the list, and `tests/session-established.test.ts` has an arm labelled
  *"The OAuth-callback shape"* — a handover designed for, commented, and tested
  against, with nothing on the other end of it. The same dangling-promise
  species as `challengeId`, which the MFA round closed.

  **Two flows, not one, because the two halves run in different page loads.** A
  full-page redirect destroys the store, so `oauth-start` and `oauth-callback`
  can never share one. A merged reducer would have been two state machines with
  no action connecting them.

  **The backend mints `state` and builds the authorize URL**, mirroring
  `beginMfaEnrolment`. Every id in this package is server-minted, and the party
  holding the client secret has to verify the nonce anyway — so there is **no
  PKCE crypto in the browser**. No `getRandomValues`, no `crypto.subtle`, no
  base64url encoder; writing them would have been the codebase's first Web
  Crypto use, to duplicate a mandatory server-side check. `OAuthStart` carries
  `authorizeUrl` and `state` and must never carry a `codeVerifier`: that would
  be a secret in `sessionStorage`, and this package's claim that the browser
  never holds OAuth secrets would stop being true.

  **The client-side `state` check is defence in depth, never the defence.** The
  backend binds `state` to the exchange. But the client gate does gate — a
  mismatch never reaches `completeOAuth` — rather than reporting after the fact.

  **`pendingOAuth` and `redirect` are deliberately not on `AuthDependencies`.**
  That interface is documented as the auth I/O whose every member reports
  failure by rejecting with an `AuthError`; storage and browser navigation are
  neither, and widening it to fit them would weaken a promise eleven other
  members keep. They live on `OAuthStartDependencies`.

  **The redirect is the only full-page navigation in the repository.** Nothing
  else anywhere calls `location.assign`, `location.href =` or `window.open`, and
  core's routing is `history.pushState`, which cannot cross an origin at all.
  It is injected so a `TestStore` can assert where the user was sent and a demo
  can show the URL instead of following it.

  **Two new `AuthError` arms**, `oauth_denied` and `oauth_state_mismatch`. The
  MFA round argued against widening the union because the recoveries were
  identical; here they differ. `oauth_denied` is the user pressing Cancel — a
  branch rendered as `role="status"`, never a red alert, the `mfa_required`
  lesson applied. `oauth_state_mismatch` carries **nothing but a message**: no
  nonce, and no hint of which of its three routes produced it, because naming
  that tells an attacker whether a sign-in was in progress. Reusing
  `token_expired` was considered and rejected — it is a backend verdict about a
  link, and surfaces branch on it to offer "send another".

  Security decisions worth naming, because each is invisible once it works:
  `returnTo` never crosses the wire and is normalised to a same-origin path, so
  a consumer reading it from their own query string cannot carry an open
  redirect through the flow; `?error=` is echoed only if it matches
  `/^[a-z_]{1,64}$/` and `error_description` is never rendered, because a banner
  in the app's own chrome showing attacker prose is a phishing surface;
  `authorize_url` is refused unless it is `http(s):`, in both the adapter and
  the redirect, because that value is handed to `location.assign`; and the
  provider used in the exchange comes from the stored record, never from the
  URL.

  `sessionStorage` rather than `localStorage`, and the strongest argument is
  correctness rather than secrecy: `localStorage` is shared between tabs, so a
  second tab starting a sign-in would clobber the first tab's nonce and the
  first tab's *legitimate* callback would then fail. Popups and `target=_blank`
  are unsupported for the mirror-image reason, which is why `OAuthSignIn`
  renders `<button>` and never `<a href>`.

  **No provider logos ship.** The `qr` precedent, plus a second reason specific
  to this: Google, GitHub, Apple and Microsoft each publish brand guidelines
  governing the mark, its clear space and the button wording, and vendoring them
  into an MIT package would make every consumer's trademark compliance this
  library's problem. An `icon` snippet takes whatever they already have.

- **MFA** — `mfaChallengeReducer` / `MfaChallengeForm`, `mfaEnrolmentReducer` /
  `MfaEnrolment`, and `OneTimeCodeInput`.

  **`challengeId` is finally read by something.** It has been on
  `mfa_required` since the union was created — its doc comment calls it "the
  reason this union exists at all" — and until now it was validated on arrival,
  carried through the login reducer, and rendered as a sentence in a red banner
  offering nowhere to type a code. `isMfaRequired` was exported with zero
  production callers.

  `LoginForm` gains `onMfaRequired`, which is that first caller. Supplying it
  also **suppresses the error banner**: being asked for a second factor is this
  flow branching, not a failure, and a red alert on the way to a code prompt is
  alarming and wrong. It reports once per *challenge*, not once per distinct
  challenge id — plenty of backends hand back the same pending challenge for a
  repeated sign-in, and keying on the id meant the second attempt did nothing
  visible at all: no callback, and no banner either, because it is suppressed. Optional, unlike `ResetPasswordForm`'s `onRequestNewLink`
  — MFA is off for most backends, so requiring it would break every consumer for
  a branch they never reach.

  **No new `AuthError` arm.** A wrong code is `invalid_credentials` and the form
  stays up; an expired challenge is `token_expired`, the form is withdrawn, and
  `onStartOver` is the way back. Those are the two recoveries that differ, and
  both codes already existed.

  **A recovery code is a different method, not a different field.** Switching
  clears the code and sends `method: 'recovery_code'` — and the switch is only
  offered when `methods` says the account has them.

  **Enrolment needs the guards reset-password deliberately does not.** It
  fetches on entry, so a re-firing effect starts a second enrolment and silently
  invalidates the secret the user is at that moment typing into their phone;
  both the reducer and the component refuse a repeat, and retrying is a button
  rather than anything the effect re-derives. Recovery codes are shown once,
  `onDone` fires when the *user* acknowledges them rather than when enrolment
  completes, and the two copy buttons track what was copied rather than sharing
  one flag — the panel must never tell someone the codes are saved when what
  they copied was the setup key.

  **`OneTimeCodeInput` is one field, not six** — reversing what the previous
  round said MFA would need. A single input with `inputmode="numeric"` and
  `autocomplete="one-time-code"` autofills from the OS, pastes with no handler,
  and has one label and one error; split boxes must re-implement paste and
  backspace and announce as six unlabelled inputs. `name` is required, as on
  every other input this package renders.

  **No QR encoder was added.** Nothing in the repository can produce one and
  there is no precedent for a satellite package computing SVG, so an encoder
  would be this package's second runtime dependency for something that is not
  its concern. `MfaEnrolment` renders the secret for manual entry and takes a
  `qr` snippet receiving `{ otpauthUri, secret }`.

### Fixed

- **The HTTP adapter now honours the contract `AuthDependencies` states.** Its
  module doc promises "every member reports failure by rejecting with an
  `AuthError`", and none of the 22 `fetch` calls was wrapped — a transport
  failure escaped as a raw `TypeError`. `toAuthError` caught most by matching
  four engine strings, but undici's `terminated`, React Native's `Network
  request failed` and Deno's phrasing all fell through to `unknown`.

  Wrapping the `fetch` call itself removes the guessing: a rejection from
  `fetch` and nothing else is, by construction, a request that never reached a
  verdict. This is what `toAuthError`'s own comment anticipated — *"a dependency
  that knows it was doing I/O should report `{ code: 'network' }` itself … the
  HTTP adapter will"* — future tense since it was written. An abort still passes
  through untouched: it is a cancellation, not a failure.

- **`network` reads as a sentence.** Components render `error.message` straight
  into a banner, so a user was shown the engine's string — "fetch failed" on
  Node, "Failed to fetch" in Chrome. It is now "Could not reach the server.
  Check your connection and try again."

- **`fetchLogin` / `fetchLogout` / `fetchSession` report `AuthError`s.** They
  threw `new Error('Login failed (401)')` — a status in a sentence with the body
  discarded, which is the precise defect `http/errors.ts` was written to fix and
  which was fixed only for the flow surface. A 401 on the seeded login is now
  `invalid_credentials`. Because `sessionReducer` prefers a thrown value's own
  wording over its fallback, that raw string was reaching `AuthGuard` and being
  rendered.

- **`MalformedSessionError` satisfies the contract**, carrying `code: 'unknown'`
  so it passes `isAuthError` structurally while `instanceof` keeps working. And
  `toAuthError` copies an `Error`-shaped `AuthError` into a plain object —
  `Error.prototype.message` is non-enumerable, so SSR hydration through
  `JSON.stringify` was dropping the explanation and leaving `{"code":"unknown"}`.

- **`ConnectedAccountsPanel` no longer hides a re-attached provider.** The
  flow's doc said the panel unioned the account's list with the locally detached
  one; it subtracted, and `unlinked` only ever grew. A provider disconnected and
  then reconnected vanished from the list *and* was offered under "Connect".
  `providersObserved` now prunes an entry once the read it covered has landed.

- **`mfa-management`'s `disabled` status is no longer a dead end.** Nothing in
  its eight-arm action union moved off it, and the reference client reached it:
  one store kept across an enrolment left the panel saying "two-factor is off"
  for an account that had just turned it on, with two buttons whose dispatches
  the guards silently ate. `mfaObserved` returns it to `idle` — but only on a
  *change*, so the stale `true` still in props cannot undo a disable the moment
  it succeeds.

### Added

- **The account lifecycle completes** — changing an email address, deleting an
  account, and session-lifetime management.

  Changing an address is **two** flows. `change-email` is the request, a form in
  a settings panel; `change-email-confirm` is the link target, formless. They
  are separate because the halves run in different page loads — the criterion
  this package already applies to OAuth and magic links. Nothing is shared with
  `email-verification` but the word "token": that one confirms *the account's*
  address and may return a session, this one swaps to a different address on a
  session that already exists and returns the new address.

  Confirming requires a live session. Accepting the token alone would let a
  forwarded mail, a shared inbox or a mail scanner complete an identity change
  silently — and unlike verifying an address, which is what its link was for,
  this *moves* the account. The cost is a real cliff, so
  `EmailChangeConfirmation` takes a **required** `onSignIn`.

  `delete-account` puts the confirmation in the **reducer**:
  `deletionRequested` is reachable only from `confirming`, so a consumer who
  renders their own dialog — or none — cannot delete an account with one
  dispatch. `DeleteAccountPanel` takes a `confirm` snippet for a modal and
  confirms inline without one; it deliberately does not import core's
  `AlertDialog`, which is Tailwind and would render transparent in an app that
  has not wired it.

  `session-refresh` is session lifetime, **not bearer tokens**, and none is
  introduced: a refresh token reachable by JavaScript is exfiltrable by any XSS,
  which is exactly what the HttpOnly cookie avoids. The decision "is it time
  yet" is pure over an injected `Clock`, so `createMockClock` drives it with no
  timers. Only `invalid_credentials` ends a session — a `network` failure keeps
  the expiry and retries, because signing someone out of a working session when
  their wifi drops is worse than a late refresh.

- **`createUnauthorizedHandler`** ships the 401 backstop the README previously
  only described. It coalesces on `status !== 'resolving'`, so a page firing a
  dozen requests that all 401 dispatches one re-resolve rather than a dozen.

- **Four components** — `ChangeEmailForm`, `EmailChangeConfirmation`,
  `DeleteAccountPanel`, `SessionRefresh`.

- **`sessionEstablished`** — a flow outside this store completing a sign-in.
  The session store owns "who am I"; it does not own every way of becoming
  someone. A credentials login, an MFA challenge, an OAuth callback and a magic
  link each need their own multi-step reducer, and all of them end with a
  `SessionSnapshot`. This is the handover.

  Refused in exactly one status, `loggingOut`: a slow sign-in resolving after
  the user has signed out would otherwise put them back in a session they left.
  Every other status yields to it, on the principle the `login` arm already
  states — explicit intent supersedes a background resolve.

- **`loginStarted`** — optional, and only about presentation: it moves the status
  to `loggingIn` so `AuthGuard` shows its pending branch while a flow works.

- **`@composable-svelte/auth/errors`** — the union, plus `toAuthError`,
  `isAuthError`, `isMfaRequired` and `retryDelaySeconds`. Errors are plain
  objects and `isAuthError` is structural, so they survive `structuredClone` and
  an SSR boundary; `instanceof` would survive neither.

  `retryDelaySeconds` returns `null` for failures that waiting does not fix, and
  refuses to invent a delay the backend did not state — guessing an interval is
  how a client turns one rate limit into several.

- **`@composable-svelte/auth/flows`** — the headless sign-in flow:
  `loginReducer`, `createLoginStore`, `createInitialLoginState`, `loginSchema`
  and the state and action types. Markup-free, so a consumer with their own
  design system builds over the same machine.

  **The flow owns the submission, not the form**, and that is forced rather than
  stylistic. Core's `createFormReducer` catches whatever `config.onSubmit`
  throws and stores `error.message` — a string. Route the auth call through it
  and the union above is flattened on arrival: `mfa_required` loses its
  `challengeId`, `rate_limited` loses its delay, and the whole of this release
  buys nothing. So `onSubmit` is a no-op, the form's job ends at "these fields
  are valid", and the flow observes `submissionSucceeded` and makes the request.

  Two behaviours the form reducer does not provide. A second submit while the
  first is in flight **supersedes** it rather than racing — a fixed cancellation
  id, so two sign-ins cannot be resolved in whichever order the network picks.
  And editing any field clears the last failure, because core never clears its
  own `submitError` on `fieldChanged`, which otherwise leaves "Invalid
  credentials" sitting above the password being retyped.

- **`@composable-svelte/auth/http`** — `createHttpAuthDeps`, the Composable Rust
  adapter, which **reads the response body on failure**. Two layers, so another
  backend still gets something useful: status codes map as a baseline (401 →
  `invalid_credentials`, 423 → `account_locked`, 429 → `rate_limited` with the
  `Retry-After` header, 410 → `token_expired`), and an optional
  `{ error: { code, … } }` body overrides and enriches that — which is the only
  way `mfa_required` can carry a challenge id.

- **`LoginForm` and `PasswordInput`** — the styled layer, on the `components`
  subpath and the root barrel.

  `LoginForm` takes **both** stores. A completed sign-in has to cross from the
  flow to the session, and a required prop makes a forgotten wiring a compile
  error; composing into a parent reducer or injecting an `onSessionEstablished`
  callback both fail silently instead. The handoff fires once per successful
  sign-in, not once per dispatch.

  `PasswordInput`'s toggle is a real `<button type="button">`, tabbable, with
  `aria-pressed` and a label that changes between "Show password" and "Hide
  password". It is *not* `tabindex="-1"` like `Combobox`'s chevron: that one
  duplicates keyboard access the input already offers, and this one has no
  keyboard equivalent at all.

  Both ship **scoped CSS, not Tailwind classes**. The preset's content glob
  covers core's `dist` only, so a utility class in this package's `dist` is
  purged in every consuming app — the "renders transparent" defect the root
  CLAUDE.md opens with. Colours are `hsl(var(--token, fallback))`, so they
  follow core's theme and dark mode when its stylesheet is present and fall back
  when it is not.

- **`@composable-svelte/auth/testing`** — `createMockAuthDeps`, a backend-shaped
  fake. Every auth failure is server-side, so a demo or test that can only show
  the happy path shows almost nothing; this rejects with real `AuthError`
  shapes, including `mfa_required`, and honours the `AbortSignal` so a
  superseded sign-in stops pretending to work.

- **`createLoginStore`**, mirroring `createSessionStore`.

- **`createHttpAuthDeps` and `authErrorFromResponse` on the root barrel**, beside
  `createHttpSessionDeps`, which was already there. They were reachable only
  through `./http`, which made the package's own documentation wrong about its
  API — every other subpath was already re-exported. `flat-barrel.test.ts` holds
  the rule now: for this package a subpath is a convenience, never the only way
  in.

### Fixed in review

- **`LoginForm` detached silently when `flowStore` was replaced.** `Form`
  captures its store into context at init and `FormField` reads
  `$store.data[name]`, so both hold whatever object the component handed them on
  its first render. Delegating `subscribe` straight through pinned the
  subscription to the *first* store: the field went on showing the old data
  while dispatches went to the new one, and typing left the input uncontrolled —
  DOM holding one value, store another, nothing thrown. Recreating the store to
  reset a form is how a consumer meets that.

- **`createMockAuthDeps` ignored an already-aborted signal** unless `latencyMs`
  was above zero — and zero is the default. At the setting every test uses, a
  cancelled request resolved *successfully*, so a flow that had stopped
  cancelling would still have looked correct.

- **The default heading was `<h1>`.** This component is embeddable; an `<h1>`
  inside a page that already has one is a document-structure defect that renders
  identically to a correct one. It is `<h2>` now, with `headingLevel` for a
  dedicated `/login` page.

- **The in-flight state was announced to nobody.** Assistive technology skips a
  disabled control, so the button's label changing to "Signing in…" was silent.
  A `role="status"` region carries it.

- **The fields were disabled during the request** along with the button. That
  buys nothing — the credentials were captured at dispatch — and costs focus:
  submitting with Enter leaves focus in the password field, and disabling the
  focused element drops focus to `<body>`. Only the submit button is disabled,
  which the HTML spec says also suppresses implicit submission.

- Inputs carry `name` as well as `autocomplete`, which password-manager
  heuristics fall back to; the form's own styles no longer reach out of the
  component through a bare `:global` class.

- **`@composable-svelte/auth/flows` gains signup** — `signupReducer`,
  `createSignupStore`, `signupSchema`, `passwordCriteria`, and `SignupForm` /
  `PasswordCriteria` beside them.

  **Two terminal states, and both are successes.** A backend that requires email
  confirmation cannot return a session, and one that does not should not be
  forced into a second round trip — so `deps.signup` answers with a union,
  `{ kind: 'session' }` or `{ kind: 'verificationRequired' }`, rather than a
  nullable session. There is no field to forget to check. `awaitingVerification`
  leaves `error` null and replaces the form with a terminal panel; dispatching
  `sessionEstablished` there would sign in an account that cannot be used yet.

  **The password policy is length and nothing else**, following NIST 800-63B.
  Composition rules push people toward `Passw0rd!` — predictable substitutions
  on a short base — while a longer passphrase is stronger and easier to
  remember. `PasswordCriteria` is derived from the same constants the schema
  validates against, so the checklist cannot say "done" while the form
  disagrees; a test asserts they agree on every sample, and another fails if a
  character-class rule is ever added.

  `signupFormConfig` uses `mode: 'onBlur'` where sign-in uses `onSubmit`,
  because the confirm field is the one place a submit-only rule means retyping a
  password the user believed they had already entered twice. That is only
  possible since cross-field validation was fixed in core.

### Still missing

Changing an email, deleting an account, token refresh, account linking, and MFA
*management* — disabling it or regenerating recovery codes, which belong on an account-settings surface this package does
not have. The
`AuthError` union names the failures those flows produce because the wire
contract needs them — a code appearing there is not a promise that the flow
behind it ships today.

## [0.1.1] - 2026-08-18

Prepared alongside core 0.6.0 and **never published** — npm has `0.1.0`.

### Changed

- Patch-bumped so a widened `@composable-svelte/core` peer range could reach
  consumers. No functional change to the package.

## [0.1.0] - 2026-07-05

The first published release: session resolution, seeded-user passwordless
login, and the `AuthGuard` / `RoleGate` UX gates.

Everything the package has grown since — password sign-in, signup, email
verification, password recovery, MFA, OAuth, magic links and the account
surface — is under [Unreleased] above, because none of it has reached a user.
