/**
 * The managed auth feature: a persistent session plus optional login, MFA,
 * signup, password-recovery and email-verification flows, composed on core's
 * managed composition.
 *
 * `LoginForm` performs the flow-to-session handoff in a `$effect` and branches
 * to MFA through `onMfaRequired`; neither runs without a mounted component.
 * `SignupForm` does the same for a signup that ends in a session. Here the same
 * outcomes are reductions. The feature's core runs after its child slots, in
 * the same reduction, so when it sees a lifted `loginSucceeded` or
 * `signupSucceeded` the flow has already recorded it.
 *
 * Lifetime rules, each one a flow owner that must not outlive its intent:
 *
 * - Opening any flow is idempotent: refused while another temporary auth flow
 *   is live, so an open never silently resets an attempt whose
 *   request is in flight, nor presents a second flow beside it.
 * - `restartLogin` replaces the login owner (`replaceOn`) and removes MFA and
 *   signup. `restartSignup` replaces the signup owner and removes the others.
 * - A live challenge's `startOverRequested` removes it and presents a fresh
 *   sign-in, replacing a live login owner (`replaceOn`) rather than reusing it.
 * - An `mfa_required` login result opens the challenge. Over a live challenge
 *   it replaces that owner, and only then.
 * - A signup's `signInRequested` (the `email_taken` "Sign in instead") removes
 *   it and presents a fresh sign-in, replacing a live login owner.
 * - A signup's `verificationRequired` keeps the flow: its terminal panel and
 *   `pendingEmail` stay presented, no session is established and no handoff is
 *   reported. A parent routes from `signup.status` after that routed action.
 * - Forgot-password `requestSent` keeps the editable form and conditional
 *   message. A parent reads `requestedFor` after that routed result.
 * - A reset with a session uses the shared handoff; without one it keeps its
 *   terminal panel. New-link and sign-in requests present the next flow.
 * - Email verification and resend are separate owned operations. A verified
 *   session uses the shared handoff; no-session and resend results stay for
 *   the parent to read after their matching routed actions.
 * - A sent forgot-password flow stays live to permit another request. Opening
 *   another flow is refused until an explicit restart or in-form sign-in.
 * - Explicit sign-in and new-link actions may switch flows while a recovery
 *   request is pending; retiring its owner aborts it and drops late feedback.
 * - MFA enrolment, MFA management, account read model and connected accounts are
 *   settings flows, not sign-in attempts. They may coexist, and each has an explicit
 *   open/restart/close lifetime. Opening one is refused unless a subject is
 *   authenticated, and while it is live or a temporary auth flow is; a temporary flow
 *   opened afterwards (a re-authentication prompt, OAuth start or link) does not retire
 *   them, and neither do `cancelSignIn`, a restart of a temporary flow or a same-subject
 *   handoff. Any change of the authenticated subject — an account switch, an expiry to
 *   anonymous — retires all settings flows, as do close, restart, `dismiss()`, `logout`
 *   and a parent removing the feature; each aborts pending requests and drops late results.
 * - Their outcomes are reported in `mfaOutcome`, a one-reduction pulse, only
 *   for a transition admitted in that reduction: the enrolment's
 *   acknowledgement once per owner, and each management result the
 *   management reducer accepted. Enrolment is never acknowledged or removed
 *   on success.
 * - OAuth start is one temporary flow like the others, opened, restarted and
 *   closed explicitly. It has no outcome: success is the page navigating to the
 *   provider, with the nonce, intent and safe `returnTo` parked in
 *   `pendingOAuth` (per-tab `sessionStorage` by default) so they survive it.
 * - The OAuth callback is the returning page's temporary flow. Its managed
 *   view starts the exchange once per owner; the feature admits a result only
 *   when this reduction moved the flow out of `exchanging`, so a replayed or
 *   premature result reports nothing. A sign-in uses the shared handoff and
 *   reports `oauthOutcome` `signedIn` with the safe `returnTo`, only when the
 *   session accepted it; a link reports `linkCompleted` and never touches the
 *   session; both retire the callback. `mfa_required` retires it and presents
 *   the challenge, reporting `mfaRequired`. Any other failure stays presented
 *   with its terminal panel and reports `failed`; its "Start again" retires it
 *   and presents a sign-in.
 * - Magic-link request and sign-in are two flows in two page loads, like
 *   password recovery and OAuth. Magic-link request is opened, restarted and
 *   closed explicitly; when the backend accepts it, the parent reads
 *   `magicLinkOutcome` `requestSent` and the form stays editable.
 * - Magic-link sign-in is a separate page load; its token is never spent on
 *   mount or GET, only when a user presses the button. A missing token or
 *   expired token presents the offer for a new link; clicking "Send me a new
 *   link" transitions to magic-link request (`requestNewLinkRequested`), and
 *   "Sign in another way" transitions to password sign-in (`startOverRequested`).
 *   An accepted sign-in uses the shared handoff and reports `magicLinkOutcome`
 *   `signedIn` only when the session accepted it. An `mfa_required` failure
 *   retires the flow, presents the managed MFA challenge, and reports
 *   `mfaRequired`. A replayed or premature result is refused and reports nothing.
 * - `logout` removes every flow, even from an anonymous session, so a result
 *   landing during `loggingOut` or after `loggedOut` is dropped with its owner,
 *   retiring pending begin/confirm/disable/regenerate and temporary flow requests.
 * - `cancelSignIn` and a view's `dismiss()` remove flows. Where the user goes
 *   next is the containing application's decision; the feature has no route.
 *
 * The feature reports a finished handoff in `handoff`, a one-reduction output.
 */

import { Effect, scope, type PresentationAction, type Reducer, type Clock, createSystemClock } from '@composable-svelte/core';
import {
	ManagedIntegrationBuilder,
	optionalSlot,
	type ManagedComposition,
	type PresentationSlotHandle,
	type SlotSchema
} from '@composable-svelte/core/application';

import { isMfaRequired, isReauthenticationRequired } from '../errors/helpers.js';
import { createInitialLoginState, loginReducer } from '../flows/login/reducer.js';
import type { LoginAction, LoginDependencies, LoginState } from '../flows/login/types.js';
import {
	createInitialMfaChallengeState,
	mfaChallengeReducer
} from '../flows/mfa-challenge/reducer.js';
import type {
	MfaChallengeAction,
	MfaChallengeDependencies,
	MfaChallengeState
} from '../flows/mfa-challenge/types.js';
import { createInitialSignupState, signupReducer } from '../flows/signup/reducer.js';
import type { SignupAction, SignupDependencies, SignupState } from '../flows/signup/types.js';
import { createInitialForgotPasswordState, forgotPasswordReducer } from '../flows/forgot-password/reducer.js';
import type { ForgotPasswordAction, ForgotPasswordDependencies, ForgotPasswordState } from '../flows/forgot-password/types.js';
import { createInitialResetPasswordState, resetPasswordReducer } from '../flows/reset-password/reducer.js';
import type { ResetPasswordAction, ResetPasswordDependencies, ResetPasswordState } from '../flows/reset-password/types.js';
import { createInitialEmailVerificationState, emailVerificationReducer } from '../flows/email-verification/reducer.js';
import type { EmailVerificationAction, EmailVerificationDependencies, EmailVerificationState } from '../flows/email-verification/types.js';
import { createInitialMfaEnrolmentState, mfaEnrolmentReducer } from '../flows/mfa-enrolment/reducer.js';
import type { MfaEnrolmentAction, MfaEnrolmentDependencies, MfaEnrolmentState } from '../flows/mfa-enrolment/types.js';
import { createInitialMfaManagementState, mfaManagementReducer } from '../flows/mfa-management/reducer.js';
import type { MfaManagementAction, MfaManagementDependencies, MfaManagementState, MfaOperation } from '../flows/mfa-management/types.js';
import { createInitialAccountState, accountReducer } from '../flows/account/reducer.js';
import type { AccountAction, AccountDependencies, AccountState } from '../flows/account/types.js';
import {
	createInitialConnectedAccountsState,
	connectedAccountsReducer
} from '../flows/connected-accounts/reducer.js';
import type {
	ConnectedAccountsAction,
	ConnectedAccountsDependencies,
	ConnectedAccountsState
} from '../flows/connected-accounts/types.js';
import type { AuthDependencies, MfaMethod } from '../deps.js';
import type { AuthError } from '../errors/types.js';
import type { OAuthIntent, OAuthProvider } from '../flows/oauth-pending.js';
import { createInitialOAuthStartState, oauthStartReducer } from '../flows/oauth-start/reducer.js';
import type {
	OAuthStartAction,
	OAuthStartDependencies,
	OAuthStartState
} from '../flows/oauth-start/types.js';
import { createBrowserRedirect, type Redirect } from '../flows/oauth-start/redirect.js';
import {
	createInitialOAuthCallbackState,
	oauthCallbackReducer
} from '../flows/oauth-callback/reducer.js';
import type {
	OAuthCallbackAction,
	OAuthCallbackDependencies,
	OAuthCallbackState
} from '../flows/oauth-callback/types.js';
import { createPendingOAuthStorage, normaliseReturnTo, type PendingOAuthStorage } from '../flows/oauth-pending.js';
import {
	createInitialMagicLinkRequestState,
	magicLinkRequestReducer
} from '../flows/magic-link-request/reducer.js';
import type {
	MagicLinkRequestAction,
	MagicLinkRequestDependencies,
	MagicLinkRequestState
} from '../flows/magic-link-request/types.js';
import {
	createInitialMagicLinkSignInState,
	magicLinkSignInReducer
} from '../flows/magic-link-signin/reducer.js';
import type {
	MagicLinkSignInAction,
	MagicLinkSignInDependencies,
	MagicLinkSignInState
} from '../flows/magic-link-signin/types.js';
import {
	createInitialChangeEmailState,
	changeEmailReducer
} from '../flows/change-email/reducer.js';
import type {
	ChangeEmailAction,
	ChangeEmailDependencies,
	ChangeEmailState
} from '../flows/change-email/types.js';
import {
	createInitialChangeEmailConfirmState,
	changeEmailConfirmReducer
} from '../flows/change-email-confirm/reducer.js';
import type {
	ChangeEmailConfirmAction,
	ChangeEmailConfirmDependencies,
	ChangeEmailConfirmState
} from '../flows/change-email-confirm/types.js';
import {
	createInitialChangePasswordState,
	changePasswordReducer
} from '../flows/change-password/reducer.js';
import type {
	ChangePasswordAction,
	ChangePasswordDependencies,
	ChangePasswordState
} from '../flows/change-password/types.js';
import {
	createInitialDeleteAccountState,
	deleteAccountReducer
} from '../flows/delete-account/reducer.js';
import type {
	DeleteAccountAction,
	DeleteAccountDependencies,
	DeleteAccountState
} from '../flows/delete-account/types.js';
import {
	createInitialSessionRefreshState,
	sessionRefreshReducer,
	DEFAULT_LEAD_MS,
	DEFAULT_TICK_MS
} from '../flows/session-refresh/reducer.js';
import type {
	SessionRefreshAction,
	SessionRefreshDependencies,
	SessionRefreshState
} from '../flows/session-refresh/types.js';
import { decideSessionEstablished } from '../session/establish.js';
import { createInitialSessionState, sessionReducer } from '../session/reducer.js';
import type { SessionAction, SessionDependencies, SessionState } from '../session/types.js';
import { anonymousSubject } from '../subject/helpers.js';
import type { SessionSnapshot } from '../subject/types.js';

/** The flow whose result was handed to the session. */
export type AuthHandoffSource =
	| 'login'
	| 'mfa'
	| 'signup'
	| 'resetPassword'
	| 'emailVerification'
	| 'oauthCallback'
	| 'magicLinkSignIn'
	| 'changePassword';
/** Why a completed flow's session was refused. */
export type AuthHandoffRefusalReason = 'loggingOut';

/**
 * What the last auth reduction did with a completed sign-in.
 *
 * `accepted`: the session now holds `session`. `refused`: the session kept its
 * state, for `reason` (a sign-out was in flight). Either way the flows are gone.
 * The outcome is the session decision's own discriminant — never inferred from
 * the session status, which stays `authenticated` when a switch of account is
 * refused.
 */
export type AuthHandoff =
	| { readonly kind: 'accepted'; readonly source: AuthHandoffSource; readonly session: SessionSnapshot }
	| {
			readonly kind: 'refused';
			readonly source: AuthHandoffSource;
			readonly reason: AuthHandoffRefusalReason;
	  };

/**
 * What the last auth reduction confirmed about an MFA settings owner.
 *
 * Set only when the routed child action matches what the live owner recorded
 * in the same reduction, so a refused acknowledgement, a result for another
 * operation or a retired owner's late feedback (dropped before any reducer)
 * reports nothing. `disabled` and `recoveryCodesRegenerated` are the points to
 * re-read the account; `reauthenticationRequired` says which operation to
 * retry after the parent's prompt. The backend remains the authority.
 */
export type AuthMfaOutcome =
	| { readonly kind: 'enrolmentAcknowledged' }
	| { readonly kind: 'disabled' }
	| { readonly kind: 'recoveryCodesRegenerated' }
	| {
			readonly kind: 'reauthenticationRequired';
			readonly operation: MfaOperation;
			readonly methods: readonly ('password' | 'totp' | 'recovery_code')[];
	  };

/**
 * What the last auth reduction confirmed about an OAuth callback.
 *
 * A one-reduction pulse like `handoff`: cleared on every action the feature
 * reduces, and set only by the reduction that admitted the callback's result.
 * `returnTo` is the same-origin path recovered from the pending record, or
 * `null`; it never comes from the callback URL.
 *
 * - `signedIn`: the session accepted the OAuth sign-in (`handoff` is
 *   `accepted` in the same reduction). A refused handoff reports no outcome.
 * - `linkCompleted`: the provider was attached; the session did not change.
 * - `mfaRequired`: the backend wants a second factor; the feature has
 *   presented the challenge.
 * - `failed`: terminal. The callback stays presented with its panel and a way
 *   to start again. `intent` is `null` when the pending record could not be
 *   read or did not match.
 */
export type AuthOAuthOutcome =
	| { readonly kind: 'signedIn'; readonly returnTo: string | null }
	| { readonly kind: 'linkCompleted'; readonly returnTo: string | null }
	| {
			readonly kind: 'mfaRequired';
			readonly challengeId: string;
			readonly methods: readonly MfaMethod[];
	  }
	| { readonly kind: 'failed'; readonly intent: OAuthIntent | null; readonly error: AuthError };

/**
 * What the last auth reduction confirmed about a magic-link request or sign-in.
 *
 * A one-reduction pulse like `handoff`: cleared on every action the feature
 * reduces, set only by the reduction that confirmed a magic link outcome.
 *
 * - `requestSent`: the backend accepted a magic-link request for `email`.
 * - `signedIn`: the session accepted the magic-link sign-in (`handoff` is
 *   `accepted` in the same reduction).
 * - `mfaRequired`: the backend wants a second factor; the feature has
 *   presented the challenge.
 */
export type AuthMagicLinkOutcome =
	| { readonly kind: 'requestSent'; readonly email: string }
	| { readonly kind: 'signedIn' }
	| {
			readonly kind: 'mfaRequired';
			readonly challengeId: string;
			readonly methods: readonly MfaMethod[];
	  };

/**
 * What the last auth reduction confirmed about a connected-accounts unlink operation.
 *
 * A one-reduction pulse like `handoff`: cleared on every action the feature
 * reduces, and set only by the reduction that confirmed an unlink success or
 * a backend reauthentication demand.
 *
 * - `unlinked`: the backend accepted detaching `provider`. The parent can
 *   re-read the account via `accountStore.dispatch({ type: 'reloadRequested' })`.
 * - `reauthenticationRequired`: the backend requires recent verification of
 *   `methods` before permitting unlink of `provider`. The parent can route to
 *   a re-authentication challenge.
 */
export type AuthConnectedAccountsOutcome =
	| { readonly kind: 'unlinked'; readonly provider: string }
	| {
			readonly kind: 'reauthenticationRequired';
			readonly provider: string;
			readonly methods: readonly ('password' | 'totp' | 'recovery_code')[];
	  };

/**
 * What the last auth reduction confirmed about an email-change request or resend.
 *
 * A one-reduction pulse like `handoff`: cleared on every action the feature
 * reduces, set only by the reduction that confirmed an email change request outcome.
 *
 * - `requested`: the backend accepted an email change request for `email`.
 * - `resent`: the backend resent the confirmation link for the pending email change.
 * - `reauthenticationRequired`: the backend requires recent verification of
 *   `methods` before permitting an email change.
 */
export type AuthChangeEmailOutcome =
	| { readonly kind: 'requested'; readonly email: string }
	| { readonly kind: 'resent' }
	| {
			readonly kind: 'reauthenticationRequired';
			readonly methods: readonly ('password' | 'totp' | 'recovery_code')[];
	  };

/**
 * What the last auth reduction confirmed about an email-change confirmation.
 *
 * A one-reduction pulse like `handoff`: cleared on every action the feature
 * reduces, set only by the reduction that confirmed an email change confirmation outcome.
 *
 * - `confirmed`: the backend accepted the token and moved the account to `email`.
 * - `failed`: terminal confirmation error (e.g. token expired, invalid credentials).
 */
export type AuthChangeEmailConfirmOutcome =
	| { readonly kind: 'confirmed'; readonly email: string }
	| { readonly kind: 'failed'; readonly error: AuthError };

/**
 * What the last auth reduction confirmed about a password change.
 *
 * A one-reduction pulse like `handoff`: cleared on every action the feature
 * reduces, set only by the reduction that confirmed a change-password outcome.
 *
 * - `changed`: the backend accepted the new password. If a rotated session was
 *   issued, `session` holds it (`handoff` is `accepted` in the same reduction);
 *   if the existing session was retained, `session` is `null`.
 * - `reauthenticationRequired`: the backend requires recent verification of
 *   `methods` before permitting a password change.
 */
export type AuthChangePasswordOutcome =
	| { readonly kind: 'changed'; readonly session: SessionSnapshot | null }
	| {
			readonly kind: 'reauthenticationRequired';
			readonly methods: readonly ('password' | 'totp' | 'recovery_code')[];
	  }
	| {
			readonly kind: 'rejected';
			readonly reason: 'subjectMismatch';
			readonly session: SessionSnapshot;
			readonly error: AuthError;
	  };

/**
 * What the last auth reduction confirmed about an account deletion.
 *
 * A one-reduction pulse like `handoff`: cleared on every action the feature
 * reduces, set only by the reduction that confirmed an account deletion outcome.
 *
 * - `deleted`: the backend accepted deleting the account. The session has
 *   transitioned to anonymous and all flows are retired.
 * - `reauthenticationRequired`: the backend requires recent verification of
 *   `methods` before permitting account deletion.
 */
export type AuthDeleteAccountOutcome =
	| { readonly kind: 'deleted' }
	| {
			readonly kind: 'reauthenticationRequired';
			readonly methods: readonly ('password' | 'totp' | 'recovery_code')[];
	  };

/**
 * What the last auth reduction confirmed about a session refresh attempt.
 *
 * A one-reduction pulse like `handoff`: cleared on every action the feature
 * reduces, set only by the reduction that confirmed a session refresh outcome.
 *
 * - `refreshed`: the session expiry was extended and updated truthfully.
 * - `ended`: backend reported `invalid_credentials`; session resolution initiated.
 * - `failed`: transient refresh error (e.g. network); valid session is preserved.
 */
export type AuthSessionRefreshOutcome =
	| { readonly kind: 'refreshed'; readonly expiresAt: string | null }
	| { readonly kind: 'ended'; readonly error: AuthError }
	| { readonly kind: 'failed'; readonly error: AuthError };

export interface AuthFeatureState {
	/** Persistent for the feature's lifetime; not a slot, never retired. */
	session: SessionState;
	/** One sign-in attempt, present only while it is presented. */
	login: LoginState | null;
	/** One second-factor challenge, present only while it is presented. */
	mfa: MfaChallengeState | null;
	/**
	 * One create-account attempt, present only while it is presented — including
	 * its terminal "check your email" state, which establishes no session.
	 */
	signup: SignupState | null;
	/** A reset-link request; its sent message stays beside the editable form. */
	forgotPassword: ForgotPasswordState | null;
	/** A password reset from a link, including its terminal no-session result. */
	resetPassword: ResetPasswordState | null;
	/** Link confirmation, with independent verification and resend operations. */
	emailVerification: EmailVerificationState | null;
	/**
	 * One MFA enrolment attempt, present only while it is presented. A settings
	 * flow: it may coexist with `mfaManagement` and with a temporary flow opened
	 * after it (a re-authentication prompt), and only logout, `closeMfaEnrolment`,
	 * `restartMfaEnrolment` or a view's `dismiss()` retires it.
	 */
	mfaEnrolment: MfaEnrolmentState | null;
	/** One MFA management panel, with the same settings lifetime as `mfaEnrolment`. */
	mfaManagement: MfaManagementState | null;
	/**
	 * One OAuth sign-in or link initiation: the provider buttons. A temporary
	 * flow; its success is a full-page navigation away.
	 */
	oauthStart: OAuthStartState | null;
	/**
	 * One OAuth callback exchange on the returning page. A temporary flow,
	 * retired when its sign-in, link or second-factor branch is admitted.
	 */
	oauthCallback: OAuthCallbackState | null;
	/**
	 * A magic-link request; its sent message stays beside the editable form.
	 */
	magicLinkRequest: MagicLinkRequestState | null;
	/**
	 * One magic-link sign-in attempt, present only while it is presented.
	 */
	magicLinkSignIn: MagicLinkSignInState | null;
	/**
	 * One account read model, present while open. A settings slot: opening is refused
	 * while unauthenticated or a temporary auth flow is live, but survives a temporary
	 * flow opened after it.
	 */
	account: AccountState | null;
	/**
	 * One connected-accounts panel (unlink flow), present while open. A settings slot:
	 * opening is refused while unauthenticated or a temporary auth flow is live, but
	 * survives a temporary flow opened after it.
	 */
	connectedAccounts: ConnectedAccountsState | null;
	/**
	 * One email-change request form, present while open. A settings slot: opening
	 * is refused while unauthenticated or a temporary auth flow is live, but
	 * survives a temporary flow opened after it.
	 */
	changeEmail: ChangeEmailState | null;
	/**
	 * One email-change confirmation attempt on the landing page. A temporary flow.
	 */
	changeEmailConfirm: ChangeEmailConfirmState | null;
	/**
	 * One change-password form, present while open. A settings slot: opening
	 * is refused while unauthenticated or a temporary auth flow is live, but
	 * survives a temporary flow opened after it.
	 */
	changePassword: ChangePasswordState | null;
	/**
	 * One delete-account panel, present while open. A settings slot: opening
	 * is refused while unauthenticated or a temporary auth flow is live, but
	 * survives a temporary flow opened after it.
	 */
	deleteAccount: DeleteAccountState | null;
	/**
	 * One session refresh watcher, present while open. A settings slot: opening
	 * is refused while unauthenticated or a temporary auth flow is live, but
	 * survives a temporary flow opened after it.
	 */
	sessionRefresh: SessionRefreshState | null;
	/**
	 * A one-reduction pulse like `handoff`: cleared on every action the feature
	 * reduces, set only by the reduction that confirms an MFA settings outcome.
	 */
	mfaOutcome: AuthMfaOutcome | null;
	/**
	 * A one-reduction pulse like `handoff`: cleared on every action the feature
	 * reduces, set only by the reduction that confirms an OAuth callback outcome.
	 */
	oauthOutcome: AuthOAuthOutcome | null;
	/**
	 * A one-reduction pulse like `handoff`: cleared on every action the feature
	 * reduces, set only by the reduction that confirms a magic-link outcome.
	 */
	magicLinkOutcome: AuthMagicLinkOutcome | null;
	/**
	 * A one-reduction pulse like `handoff`: cleared on every action the feature
	 * reduces, set only by the reduction that confirms an unlink outcome.
	 */
	connectedAccountsOutcome: AuthConnectedAccountsOutcome | null;
	/**
	 * A one-reduction pulse like `handoff`: cleared on every action the feature
	 * reduces, set only by the reduction that confirms an email-change request outcome.
	 */
	changeEmailOutcome: AuthChangeEmailOutcome | null;
	/**
	 * A one-reduction pulse like `handoff`: cleared on every action the feature
	 * reduces, set only by the reduction that confirms an email-change confirmation outcome.
	 */
	changeEmailConfirmOutcome: AuthChangeEmailConfirmOutcome | null;
	/**
	 * A one-reduction pulse like `handoff`: cleared on every action the feature
	 * reduces, set only by the reduction that confirms a change-password outcome.
	 */
	changePasswordOutcome: AuthChangePasswordOutcome | null;
	/**
	 * A one-reduction pulse like `handoff`: cleared on every action the feature
	 * reduces, set only by the reduction that confirms an account deletion outcome.
	 */
	deleteAccountOutcome: AuthDeleteAccountOutcome | null;
	/**
	 * A one-reduction pulse like `handoff`: cleared on every action the feature
	 * reduces, set only by the reduction that confirms a session refresh outcome.
	 */
	sessionRefreshOutcome: AuthSessionRefreshOutcome | null;
	/**
	 * A one-reduction pulse. Cleared on every action the feature reduces and set
	 * only by the reduction that hands a login, MFA, signup, reset or verification session to the session. A
	 * parent reads it after its auth child, on an auth-routed action only; on
	 * any other action it is the previous auth reduction's output.
	 */
	handoff: AuthHandoff | null;
}

export type AuthFeatureAction =
	| { type: 'session'; action: SessionAction }
	| { type: 'login'; action: PresentationAction<LoginAction> }
	| { type: 'mfa'; action: PresentationAction<MfaChallengeAction> }
	| { type: 'signup'; action: PresentationAction<SignupAction> }
	| { type: 'forgotPassword'; action: PresentationAction<ForgotPasswordAction> }
	| { type: 'resetPassword'; action: PresentationAction<ResetPasswordAction> }
	| { type: 'emailVerification'; action: PresentationAction<EmailVerificationAction> }
	| { type: 'mfaEnrolment'; action: PresentationAction<MfaEnrolmentAction> }
	| { type: 'mfaManagement'; action: PresentationAction<MfaManagementAction> }
	| { type: 'oauthStart'; action: PresentationAction<OAuthStartAction> }
	| { type: 'oauthCallback'; action: PresentationAction<OAuthCallbackAction> }
	| { type: 'magicLinkRequest'; action: PresentationAction<MagicLinkRequestAction> }
	| { type: 'magicLinkSignIn'; action: PresentationAction<MagicLinkSignInAction> }
	| { type: 'account'; action: PresentationAction<AccountAction> }
	| { type: 'connectedAccounts'; action: PresentationAction<ConnectedAccountsAction> }
	| { type: 'changeEmail'; action: PresentationAction<ChangeEmailAction> }
	| { type: 'changeEmailConfirm'; action: PresentationAction<ChangeEmailConfirmAction> }
	| { type: 'changePassword'; action: PresentationAction<ChangePasswordAction> }
	| { type: 'deleteAccount'; action: PresentationAction<DeleteAccountAction> }
	| { type: 'sessionRefresh'; action: PresentationAction<SessionRefreshAction> }
	/** Present a sign-in flow. Refused while any temporary auth flow is live. */
	| { type: 'openLogin' }
	/** Replace any live flow with a fresh sign-in, retiring the old owners. */
	| { type: 'restartLogin' }
	/** Present a signup flow. Refused while any temporary auth flow is live. */
	| { type: 'openSignup' }
	/** Replace any live flow with a fresh signup, retiring the old owners. */
	| { type: 'restartSignup' }
	| { type: 'openForgotPassword' }
	| { type: 'restartForgotPassword' }
	| { type: 'openResetPassword'; token: string | null }
	| { type: 'restartResetPassword'; token: string | null }
	| { type: 'openEmailVerification'; email?: string | null }
	| { type: 'restartEmailVerification'; email?: string | null }
	/** Present an enrolment. Refused while one is live or a temporary flow is. */
	| { type: 'openMfaEnrolment' }
	/** Replace any enrolment with a fresh owner, which starts a new enrolment. */
	| { type: 'restartMfaEnrolment' }
	/** Remove the enrolment, retiring its owner and any pending start or confirm. */
	| { type: 'closeMfaEnrolment' }
	/** Present the management panel. Refused while one is live or a temporary flow is. */
	| { type: 'openMfaManagement' }
	/** Replace any management panel with a fresh owner. */
	| { type: 'restartMfaManagement' }
	/** Remove the panel, retiring its owner and any pending disable or regenerate. */
	| { type: 'closeMfaManagement' }
	/** Present the OAuth provider buttons. Refused while any temporary auth flow is live. */
	| { type: 'openOAuthStart' }
	/** Replace any live temporary flow with fresh provider buttons. */
	| { type: 'restartOAuthStart' }
	/**
	 * Initiate OAuth provider linking for the authenticated account.
	 * Reuses the oauthStart slot with intent: 'link'. Refused if unauthenticated.
	 * Replaces any live temporary flow.
	 */
	| { type: 'startOAuthLink'; provider: OAuthProvider; returnTo?: string | null | undefined }
	/** Remove the provider buttons, retiring the owner and any pending start. */
	| { type: 'closeOAuthStart' }
	/** Present the callback exchange. Refused while any temporary auth flow is live. */
	| { type: 'openOAuthCallback' }
	/** Replace any live temporary flow with a fresh callback owner. */
	| { type: 'restartOAuthCallback' }
	/** Remove the callback, retiring its owner; a late exchange result is dropped. */
	| { type: 'closeOAuthCallback' }
	| { type: 'openMagicLinkRequest' }
	| { type: 'restartMagicLinkRequest' }
	| { type: 'closeMagicLinkRequest' }
	| { type: 'openMagicLinkSignIn'; token?: string | null | undefined }
	| { type: 'restartMagicLinkSignIn'; token?: string | null | undefined }
	| { type: 'closeMagicLinkSignIn' }
	/** Present the account read model. Refused while not authenticated or a temporary auth flow is live. */
	| { type: 'openAccount' }
	/** Replace any account owner with a fresh owner. */
	| { type: 'restartAccount' }
	/** Remove the account read model, retiring its owner and any pending read. */
	| { type: 'closeAccount' }
	/** Present the connected-accounts panel. Refused while not authenticated or a temporary auth flow is live. */
	| { type: 'openConnectedAccounts' }
	/** Replace any connected-accounts owner with a fresh owner. */
	| { type: 'restartConnectedAccounts' }
	/** Remove the connected-accounts panel, retiring its owner and any pending unlink. */
	| { type: 'closeConnectedAccounts' }
	| { type: 'openChangeEmail' }
	| { type: 'restartChangeEmail' }
	| { type: 'closeChangeEmail' }
	| { type: 'openChangeEmailConfirm'; token?: string | null | undefined }
	| { type: 'restartChangeEmailConfirm'; token?: string | null | undefined }
	| { type: 'closeChangeEmailConfirm' }
	| { type: 'openChangePassword' }
	| { type: 'restartChangePassword' }
	| { type: 'closeChangePassword' }
	| { type: 'openDeleteAccount' }
	| { type: 'restartDeleteAccount' }
	| { type: 'closeDeleteAccount' }
	| { type: 'openSessionRefresh' }
	| { type: 'restartSessionRefresh' }
	| { type: 'closeSessionRefresh' }
	/** Remove every flow, retiring their owners. */
	| { type: 'cancelSignIn' };

/** What the feature calls: the session's and its flows', and nothing else. */
export type AuthFeatureDependencies = SessionDependencies &
	LoginDependencies &
	MfaChallengeDependencies &
	SignupDependencies &
	ForgotPasswordDependencies &
	ResetPasswordDependencies &
	EmailVerificationDependencies &
	MfaEnrolmentDependencies &
	MfaManagementDependencies &
	MagicLinkRequestDependencies &
	MagicLinkSignInDependencies &
	AccountDependencies &
	ConnectedAccountsDependencies &
	ChangeEmailDependencies &
	ChangeEmailConfirmDependencies &
	ChangePasswordDependencies &
	DeleteAccountDependencies & {
		refreshSession: AuthDependencies['refreshSession'];
		clock?: Clock | undefined;
		leadMs?: number | undefined;
		tickMs?: number | undefined;
		beginOAuth: AuthDependencies['beginOAuth'];
		completeOAuth: AuthDependencies['completeOAuth'];
		/** Optional, as for `OAuthCallbackDependencies`: a link without it fails, and says so. */
		linkOAuthProvider?: AuthDependencies['linkOAuthProvider'] | undefined;
		/** Where the OAuth nonce survives the redirect. Defaults to this tab's `sessionStorage`. */
		pendingOAuth?: PendingOAuthStorage | undefined;
		/** How the browser leaves for the provider. Defaults to `window.location.assign`, http(s) only. */
		redirect?: Redirect | undefined;
	};

export type AuthFeatureCatalog = Record<'login', SlotSchema<LoginState, LoginAction, {}, true>> &
	Record<'mfa', SlotSchema<MfaChallengeState, MfaChallengeAction, {}, true>> &
	Record<'signup', SlotSchema<SignupState, SignupAction, {}, true>> &
	Record<'forgotPassword', SlotSchema<ForgotPasswordState, ForgotPasswordAction, {}, true>> &
	Record<'resetPassword', SlotSchema<ResetPasswordState, ResetPasswordAction, {}, true>> &
	Record<'emailVerification', SlotSchema<EmailVerificationState, EmailVerificationAction, {}, true>> &
	Record<'mfaEnrolment', SlotSchema<MfaEnrolmentState, MfaEnrolmentAction, {}, true>> &
	Record<'mfaManagement', SlotSchema<MfaManagementState, MfaManagementAction, {}, true>> &
	Record<'oauthStart', SlotSchema<OAuthStartState, OAuthStartAction, {}, true>> &
	Record<'oauthCallback', SlotSchema<OAuthCallbackState, OAuthCallbackAction, {}, true>> &
	Record<'magicLinkRequest', SlotSchema<MagicLinkRequestState, MagicLinkRequestAction, {}, true>> &
	Record<'magicLinkSignIn', SlotSchema<MagicLinkSignInState, MagicLinkSignInAction, {}, true>> &
	Record<'account', SlotSchema<AccountState, AccountAction, {}, true>> &
	Record<'connectedAccounts', SlotSchema<ConnectedAccountsState, ConnectedAccountsAction, {}, true>> &
	Record<'changeEmail', SlotSchema<ChangeEmailState, ChangeEmailAction, {}, true>> &
	Record<'changeEmailConfirm', SlotSchema<ChangeEmailConfirmState, ChangeEmailConfirmAction, {}, true>> &
	Record<'changePassword', SlotSchema<ChangePasswordState, ChangePasswordAction, {}, true>> &
	Record<'deleteAccount', SlotSchema<DeleteAccountState, DeleteAccountAction, {}, true>> &
	Record<'sessionRefresh', SlotSchema<SessionRefreshState, SessionRefreshAction, {}, true>>;

export interface AuthFeature {
	readonly composition: ManagedComposition<
		AuthFeatureState,
		AuthFeatureAction,
		AuthFeatureDependencies,
		AuthFeatureCatalog
	>;
	/** This composition's own login slot, for `composition.bind` or `nestedSlot`. */
	readonly loginSlot: PresentationSlotHandle<AuthFeatureState, AuthFeatureAction, LoginState, LoginAction>;
	/** This composition's own MFA slot, for `composition.bind` or `nestedSlot`. */
	readonly mfaSlot: PresentationSlotHandle<
		AuthFeatureState,
		AuthFeatureAction,
		MfaChallengeState,
		MfaChallengeAction
	>;
	/** This composition's own signup slot, for `composition.bind` or `nestedSlot`. */
	readonly signupSlot: PresentationSlotHandle<AuthFeatureState, AuthFeatureAction, SignupState, SignupAction>;
	readonly forgotPasswordSlot: PresentationSlotHandle<AuthFeatureState, AuthFeatureAction, ForgotPasswordState, ForgotPasswordAction>;
	readonly resetPasswordSlot: PresentationSlotHandle<AuthFeatureState, AuthFeatureAction, ResetPasswordState, ResetPasswordAction>;
	readonly emailVerificationSlot: PresentationSlotHandle<AuthFeatureState, AuthFeatureAction, EmailVerificationState, EmailVerificationAction>;
	readonly mfaEnrolmentSlot: PresentationSlotHandle<AuthFeatureState, AuthFeatureAction, MfaEnrolmentState, MfaEnrolmentAction>;
	readonly mfaManagementSlot: PresentationSlotHandle<AuthFeatureState, AuthFeatureAction, MfaManagementState, MfaManagementAction>;
	readonly oauthStartSlot: PresentationSlotHandle<AuthFeatureState, AuthFeatureAction, OAuthStartState, OAuthStartAction>;
	readonly oauthCallbackSlot: PresentationSlotHandle<AuthFeatureState, AuthFeatureAction, OAuthCallbackState, OAuthCallbackAction>;
	readonly magicLinkRequestSlot: PresentationSlotHandle<
		AuthFeatureState,
		AuthFeatureAction,
		MagicLinkRequestState,
		MagicLinkRequestAction
	>;
	readonly magicLinkSignInSlot: PresentationSlotHandle<
		AuthFeatureState,
		AuthFeatureAction,
		MagicLinkSignInState,
		MagicLinkSignInAction
	>;
	readonly accountSlot: PresentationSlotHandle<
		AuthFeatureState,
		AuthFeatureAction,
		AccountState,
		AccountAction
	>;
	readonly connectedAccountsSlot: PresentationSlotHandle<
		AuthFeatureState,
		AuthFeatureAction,
		ConnectedAccountsState,
		ConnectedAccountsAction
	>;
	readonly changeEmailSlot: PresentationSlotHandle<
		AuthFeatureState,
		AuthFeatureAction,
		ChangeEmailState,
		ChangeEmailAction
	>;
	readonly changeEmailConfirmSlot: PresentationSlotHandle<
		AuthFeatureState,
		AuthFeatureAction,
		ChangeEmailConfirmState,
		ChangeEmailConfirmAction
	>;
	readonly changePasswordSlot: PresentationSlotHandle<
		AuthFeatureState,
		AuthFeatureAction,
		ChangePasswordState,
		ChangePasswordAction
	>;
	readonly deleteAccountSlot: PresentationSlotHandle<
		AuthFeatureState,
		AuthFeatureAction,
		DeleteAccountState,
		DeleteAccountAction
	>;
	readonly sessionRefreshSlot: PresentationSlotHandle<
		AuthFeatureState,
		AuthFeatureAction,
		SessionRefreshState,
		SessionRefreshAction
	>;
	/** A fresh state: unresolved session, no flow, no handoff. */
	initialState(): AuthFeatureState;
}

/**
 * The OAuth flows' own dependencies, from the feature's. `pendingOAuth` and
 * `redirect` default to the browser implementations, built when needed: on a
 * server the pending storage is inert and effects are deferred anyway.
 */
const oauthStartChildReducer: Reducer<OAuthStartState, OAuthStartAction, AuthFeatureDependencies> = (
	state,
	action,
	deps
) => {
	const startDeps: OAuthStartDependencies = {
		beginOAuth: deps.beginOAuth,
		pendingOAuth: deps.pendingOAuth ?? createPendingOAuthStorage(),
		redirect: deps.redirect ?? createBrowserRedirect()
	};
	return oauthStartReducer(state, action, startDeps);
};

const oauthCallbackChildReducer: Reducer<OAuthCallbackState, OAuthCallbackAction, AuthFeatureDependencies> = (
	state,
	action,
	deps
) => {
	const callbackDeps: OAuthCallbackDependencies = {
		completeOAuth: deps.completeOAuth,
		linkOAuthProvider: deps.linkOAuthProvider,
		pendingOAuth: deps.pendingOAuth ?? createPendingOAuthStorage()
	};
	return oauthCallbackReducer(state, action, callbackDeps);
};

const sessionRefreshSettledMarkers = new WeakMap<SessionRefreshState, 'refreshed' | 'ended' | 'failed'>();

const sessionRefreshChildReducer: Reducer<
	SessionRefreshState,
	SessionRefreshAction,
	AuthFeatureDependencies
> = (state, action, deps) => {
	// Clear any marker from incoming state before processing to prevent marker survival
	sessionRefreshSettledMarkers.delete(state);

	// Defensive wrapper guards for managed mode:
	// Parent owns expiry in managed mode; direct child expiryObserved is ignored.
	if (action.type === 'expiryObserved') {
		return [{ ...state }, Effect.none()];
	}
	// Forged or stale refresh feedback when not actively refreshing is ignored.
	if (
		(action.type === 'refreshSucceeded' || action.type === 'refreshFailed') &&
		state.status !== 'refreshing'
	) {
		return [{ ...state }, Effect.none()];
	}

	const wasRefreshing = state.status === 'refreshing';
	const refreshDeps: SessionRefreshDependencies = {
		refreshSession: deps.refreshSession,
		clock: deps.clock ?? createSystemClock(),
		leadMs: deps.leadMs ?? DEFAULT_LEAD_MS,
		tickMs: deps.tickMs ?? DEFAULT_TICK_MS
	};
	const [nextChildState, effect] = sessionRefreshReducer(state, action, refreshDeps);
	if (wasRefreshing) {
		if (action.type === 'refreshSucceeded') {
			sessionRefreshSettledMarkers.set(nextChildState, 'refreshed');
		} else if (action.type === 'refreshFailed') {
			sessionRefreshSettledMarkers.set(
				nextChildState,
				action.error.code === 'invalid_credentials' ? 'ended' : 'failed'
			);
		}
	}
	return [nextChildState, effect];
};

/**
 * Create the managed auth feature.
 *
 * Each call mints its own slots and composition. Use the returned slots only
 * with the returned composition. When constructing a store directly, pass
 * both `composition.reducer` and `composition.execution`: the reducer alone
 * is the feature core and does not run its managed flow children.
 *
 * @example
 * ```ts
 * import { createStore } from '@composable-svelte/core';
 * import { createAuthFeature } from '@composable-svelte/auth/application';
 * import { createMockAuthDeps } from '@composable-svelte/auth/testing';
 *
 * const auth = createAuthFeature();
 * const store = createStore({
 * 	initialState: auth.initialState(),
 * 	reducer: auth.composition.reducer,
 * 	execution: auth.composition.execution,
 * 	dependencies: createMockAuthDeps()
 * });
 * store.dispatch({ type: 'openLogin' });
 * const login = auth.composition.bind(store, auth.loginSlot);
 * ```
 */
export function createAuthFeature(): AuthFeature {
	const loginSlot = optionalSlot<AuthFeatureState, AuthFeatureAction>()('login');
	const mfaSlot = optionalSlot<AuthFeatureState, AuthFeatureAction>()('mfa');
	const signupSlot = optionalSlot<AuthFeatureState, AuthFeatureAction>()('signup');
	const forgotPasswordSlot = optionalSlot<AuthFeatureState, AuthFeatureAction>()('forgotPassword');
	const resetPasswordSlot = optionalSlot<AuthFeatureState, AuthFeatureAction>()('resetPassword');
	const emailVerificationSlot = optionalSlot<AuthFeatureState, AuthFeatureAction>()('emailVerification');
	const mfaEnrolmentSlot = optionalSlot<AuthFeatureState, AuthFeatureAction>()('mfaEnrolment');
	const mfaManagementSlot = optionalSlot<AuthFeatureState, AuthFeatureAction>()('mfaManagement');
	const oauthStartSlot = optionalSlot<AuthFeatureState, AuthFeatureAction>()('oauthStart');
	const oauthCallbackSlot = optionalSlot<AuthFeatureState, AuthFeatureAction>()('oauthCallback');
	const magicLinkRequestSlot = optionalSlot<AuthFeatureState, AuthFeatureAction>()('magicLinkRequest');
	const magicLinkSignInSlot = optionalSlot<AuthFeatureState, AuthFeatureAction>()('magicLinkSignIn');
	const accountSlot = optionalSlot<AuthFeatureState, AuthFeatureAction>()('account');
	const connectedAccountsSlot = optionalSlot<AuthFeatureState, AuthFeatureAction>()('connectedAccounts');
	const changeEmailSlot = optionalSlot<AuthFeatureState, AuthFeatureAction>()('changeEmail');
	const changeEmailConfirmSlot = optionalSlot<AuthFeatureState, AuthFeatureAction>()('changeEmailConfirm');
	const changePasswordSlot = optionalSlot<AuthFeatureState, AuthFeatureAction>()('changePassword');
	const deleteAccountSlot = optionalSlot<AuthFeatureState, AuthFeatureAction>()('deleteAccount');
	const sessionRefreshSlot = optionalSlot<AuthFeatureState, AuthFeatureAction>()('sessionRefresh');
	const composition = new ManagedIntegrationBuilder(authFeatureCore)
		.with(loginSlot, loginReducer, { replaceOn: loginReplaced })
		.with(mfaSlot, mfaChallengeReducer, { replaceOn: mfaReplaced })
		.with(signupSlot, signupReducer, { replaceOn: signupReplaced })
		.with(forgotPasswordSlot, forgotPasswordReducer, { replaceOn: forgotPasswordReplaced })
		.with(resetPasswordSlot, resetPasswordReducer, { replaceOn: resetPasswordReplaced })
		.with(emailVerificationSlot, emailVerificationReducer, { replaceOn: emailVerificationReplaced })
		.with(mfaEnrolmentSlot, mfaEnrolmentReducer, { replaceOn: mfaEnrolmentReplaced })
		.with(mfaManagementSlot, mfaManagementReducer, { replaceOn: mfaManagementReplaced })
		.with(oauthStartSlot, oauthStartChildReducer, { replaceOn: oauthStartReplaced })
		.with(oauthCallbackSlot, oauthCallbackChildReducer, { replaceOn: oauthCallbackReplaced })
		.with(magicLinkRequestSlot, magicLinkRequestReducer, { replaceOn: magicLinkRequestReplaced })
		.with(magicLinkSignInSlot, magicLinkSignInReducer, { replaceOn: magicLinkSignInReplaced })
		.with(accountSlot, accountReducer, { replaceOn: accountReplaced })
		.with(connectedAccountsSlot, connectedAccountsReducer, { replaceOn: connectedAccountsReplaced })
		.with(changeEmailSlot, changeEmailReducer, { replaceOn: changeEmailReplaced })
		.with(changeEmailConfirmSlot, changeEmailConfirmReducer, { replaceOn: changeEmailConfirmReplaced })
		.with(changePasswordSlot, changePasswordReducer, { replaceOn: changePasswordReplaced, dismissal: 'deferred' })
		.with(deleteAccountSlot, deleteAccountReducer, { replaceOn: deleteAccountReplaced, dismissal: 'deferred' })
		.with(sessionRefreshSlot, sessionRefreshChildReducer, { replaceOn: sessionRefreshReplaced })
		.build();
	return Object.freeze({
		composition,
		loginSlot,
		mfaSlot,
		signupSlot,
		forgotPasswordSlot,
		resetPasswordSlot,
		emailVerificationSlot,
		mfaEnrolmentSlot,
		mfaManagementSlot,
		oauthStartSlot,
		oauthCallbackSlot,
		magicLinkRequestSlot,
		magicLinkSignInSlot,
		accountSlot,
		connectedAccountsSlot,
		changeEmailSlot,
		changeEmailConfirmSlot,
		changePasswordSlot,
		deleteAccountSlot,
		sessionRefreshSlot,
		initialState: createInitialAuthFeatureState
	});
}

function createInitialAuthFeatureState(): AuthFeatureState {
	return {
		session: createInitialSessionState(),
		login: null,
		mfa: null,
		signup: null,
		forgotPassword: null,
		resetPassword: null,
		emailVerification: null,
		mfaEnrolment: null,
		mfaManagement: null,
		oauthStart: null,
		oauthCallback: null,
		magicLinkRequest: null,
		magicLinkSignIn: null,
		account: null,
		connectedAccounts: null,
		changeEmail: null,
		changeEmailConfirm: null,
		changePassword: null,
		deleteAccount: null,
		sessionRefresh: null,
		handoff: null,
		mfaOutcome: null,
		oauthOutcome: null,
		magicLinkOutcome: null,
		connectedAccountsOutcome: null,
		changeEmailOutcome: null,
		changeEmailConfirmOutcome: null,
		changePasswordOutcome: null,
		deleteAccountOutcome: null,
		sessionRefreshOutcome: null
	};
}

/** The session is a scoped child, not a slot: its effects carry the feature's authority. */
const sessionSlice: Reducer<AuthFeatureState, AuthFeatureAction, AuthFeatureDependencies> = scope<
	AuthFeatureState,
	AuthFeatureAction,
	SessionState,
	SessionAction,
	AuthFeatureDependencies
>(
	(state) => state.session,
	(state, session) => ({ ...state, session }),
	(action) => (action.type === 'session' ? action.action : null),
	(action) => ({ type: 'session', action }),
	sessionReducer
);

type Result = [AuthFeatureState, Effect<AuthFeatureAction>];

const unchanged = (state: AuthFeatureState): Result => [state, Effect.none()];

/** Temporary sign-in flows removed: their owners retire and in-flight results are dropped. */
const noFlows = {
	login: null,
	mfa: null,
	signup: null,
	forgotPassword: null,
	resetPassword: null,
	emailVerification: null,
	oauthStart: null,
	oauthCallback: null,
	magicLinkRequest: null,
	magicLinkSignIn: null,
	changeEmailConfirm: null
} as const;

/** Every flow removed on logout: retires settings and temporary owners alike. */
const allFlowsNull = {
	...noFlows,
	mfaEnrolment: null,
	mfaManagement: null,
	account: null,
	connectedAccounts: null,
	changeEmail: null,
	changePassword: null,
	deleteAccount: null,
	sessionRefresh: null
} as const;

const hasLiveTemporaryFlow = (state: AuthFeatureState): boolean =>
	state.login !== null ||
	state.mfa !== null ||
	state.signup !== null ||
	state.forgotPassword !== null ||
	state.resetPassword !== null ||
	state.emailVerification !== null ||
	state.oauthStart !== null ||
	state.oauthCallback !== null ||
	state.magicLinkRequest !== null ||
	state.magicLinkSignIn !== null ||
	state.changeEmailConfirm !== null;

const authenticatedId = (state: AuthFeatureState): string | null =>
	state.session.subject.kind === 'authenticated' ? state.session.subject.id : null;

/** Settings open for a signed-in subject, and not beside a sign-in attempt. */
const canOpenSettings = (state: AuthFeatureState): boolean =>
	authenticatedId(state) !== null && !hasLiveTemporaryFlow(state);

/**
 * The feature's own reducer, with the settings rule applied to its result.
 *
 * MFA settings belong to the account that opened them: they open only while a
 * subject is authenticated, so that subject is their owner. A
 * re-authentication of the same subject keeps them — that is how a parent
 * retries after a `reauthentication_required` prompt — but any change of the
 * authenticated subject (a handoff to a different account, a restored or
 * refreshed session for someone else, an expiry to anonymous, a resolution
 * from unresolved to anyone) retires the account's secret, recovery codes and
 * pending operations with their owners. The session is not a slot, so
 * `previous.session` is still the session before this action. The backend
 * still enforces who may do what; this only stops a client from showing one
 * account's secrets to another.
 */
const authFeatureCore: Reducer<AuthFeatureState, AuthFeatureAction, AuthFeatureDependencies> = (
	previous,
	action,
	deps
) => {
	const [next, effect] = reduceAuthFeatureCore(previous, action, deps);
	if (authenticatedId(previous) === authenticatedId(next)) return [next, effect];
	const keepEndedRefresh = next.sessionRefresh?.status === 'ended' && authenticatedId(next) === null;
	if (
		next.mfaEnrolment === null &&
		next.mfaManagement === null &&
		next.account === null &&
		next.connectedAccounts === null &&
		next.changeEmail === null &&
		next.changePassword === null &&
		next.deleteAccount === null &&
		(next.sessionRefresh === null || keepEndedRefresh)
	) {
		return [next, effect];
	}
	return [
		{
			...next,
			mfaEnrolment: null,
			mfaManagement: null,
			mfaOutcome: null,
			account: null,
			connectedAccounts: null,
			connectedAccountsOutcome: null,
			changeEmail: null,
			changeEmailOutcome: null,
			changePassword: null,
			changePasswordOutcome: null,
			deleteAccount: null,
			deleteAccountOutcome: null,
			sessionRefresh: keepEndedRefresh ? next.sessionRefresh : null,
			sessionRefreshOutcome: keepEndedRefresh ? next.sessionRefreshOutcome : null
		},
		effect
	];
};

/**
 * The feature's own reducer. Runs after every temporary flow slot, over their
 * result. Clears the previous `handoff` first, so every auth reduction starts
 * with none and only a handoff made in this reduction is visible after it.
 */
const reduceAuthFeatureCore: Reducer<AuthFeatureState, AuthFeatureAction, AuthFeatureDependencies> = (
	previous,
	action,
	deps
) => {
	const state =
		previous.handoff === null &&
		previous.mfaOutcome === null &&
		previous.oauthOutcome === null &&
		previous.magicLinkOutcome === null &&
		previous.connectedAccountsOutcome === null &&
		previous.changeEmailOutcome === null &&
		previous.changeEmailConfirmOutcome === null &&
		previous.changePasswordOutcome === null &&
		previous.deleteAccountOutcome === null &&
		previous.sessionRefreshOutcome === null
			? previous
			: {
					...previous,
					handoff: null,
					mfaOutcome: null,
					oauthOutcome: null,
					magicLinkOutcome: null,
					connectedAccountsOutcome: null,
					changeEmailOutcome: null,
					changeEmailConfirmOutcome: null,
					changePasswordOutcome: null,
					deleteAccountOutcome: null,
					sessionRefreshOutcome: null
			  };
	switch (action.type) {
		case 'session': {
			const [next, effect] = sessionSlice(state, action, deps);
			const isAcceptedSameSubject =
				action.action.type !== 'loginFailed' &&
				state.session.status !== 'authenticated' &&
				next.session.status === 'authenticated' &&
				authenticatedId(state) !== null &&
				authenticatedId(next) === authenticatedId(state);
			const withRefresh = updateSessionRefreshOnSessionChange(state, next, isAcceptedSameSubject);
			// Logout is the exit hatch even from an anonymous session: it ends every
			// sign-in attempt under way and every settings operation. Removing the
			// flows retires their owners, so a result that lands later is dropped
			// before any reducer sees it — after `loggedOut` an anonymous session
			// would otherwise accept it. A flow opened after this point is new intent
			// and stays live.
			return action.action.type === 'logout' ? [{ ...withRefresh, ...allFlowsNull }, effect] : [withRefresh, effect];
		}

		case 'openLogin':
			if (hasLiveTemporaryFlow(state)) return unchanged(state);
			return [{ ...state, login: createInitialLoginState() }, Effect.none()];

		case 'restartLogin':
			return [{ ...state, ...noFlows, login: createInitialLoginState() }, Effect.none()];

		case 'openSignup':
			if (hasLiveTemporaryFlow(state)) return unchanged(state);
			return [{ ...state, signup: createInitialSignupState() }, Effect.none()];

		case 'restartSignup':
			return [{ ...state, ...noFlows, signup: createInitialSignupState() }, Effect.none()];

		case 'openForgotPassword':
			if (hasLiveTemporaryFlow(state)) return unchanged(state);
			return [{ ...state, forgotPassword: createInitialForgotPasswordState() }, Effect.none()];

		case 'restartForgotPassword':
			return [{ ...state, ...noFlows, forgotPassword: createInitialForgotPasswordState() }, Effect.none()];

		case 'openResetPassword':
			if (hasLiveTemporaryFlow(state)) return unchanged(state);
			return [{ ...state, resetPassword: createInitialResetPasswordState(action.token) }, Effect.none()];

		case 'restartResetPassword':
			return [{ ...state, ...noFlows, resetPassword: createInitialResetPasswordState(action.token) }, Effect.none()];

		case 'openEmailVerification':
			if (hasLiveTemporaryFlow(state)) return unchanged(state);
			return [{ ...state, emailVerification: createInitialEmailVerificationState(action.email ?? null) }, Effect.none()];

		case 'restartEmailVerification':
			return [{ ...state, ...noFlows, emailVerification: createInitialEmailVerificationState(action.email ?? null) }, Effect.none()];

		case 'openMfaEnrolment':
			if (!canOpenSettings(state) || state.mfaEnrolment !== null) return unchanged(state);
			return [{ ...state, mfaEnrolment: createInitialMfaEnrolmentState() }, Effect.none()];

		case 'restartMfaEnrolment':
			if (authenticatedId(state) === null) return unchanged(state);
			return [{ ...state, mfaEnrolment: createInitialMfaEnrolmentState() }, Effect.none()];

		case 'closeMfaEnrolment':
			if (state.mfaEnrolment === null) return unchanged(state);
			return [{ ...state, mfaEnrolment: null }, Effect.none()];

		case 'openMfaManagement':
			if (!canOpenSettings(state) || state.mfaManagement !== null) return unchanged(state);
			return [{ ...state, mfaManagement: createInitialMfaManagementState() }, Effect.none()];

		case 'restartMfaManagement':
			if (authenticatedId(state) === null) return unchanged(state);
			return [{ ...state, mfaManagement: createInitialMfaManagementState() }, Effect.none()];

		case 'closeMfaManagement':
			if (state.mfaManagement === null) return unchanged(state);
			return [{ ...state, mfaManagement: null }, Effect.none()];

		case 'openOAuthStart':
			if (hasLiveTemporaryFlow(state)) return unchanged(state);
			return [{ ...state, oauthStart: createInitialOAuthStartState() }, Effect.none()];

		case 'restartOAuthStart':
			return [{ ...state, ...noFlows, oauthStart: createInitialOAuthStartState() }, Effect.none()];

		case 'startOAuthLink': {
			if (authenticatedId(state) === null) return unchanged(state);
			return [
				{ ...state, ...noFlows, oauthStart: createInitialOAuthStartState() },
				Effect.run<AuthFeatureAction>((dispatch) => {
					dispatch({
						type: 'oauthStart',
						action: {
							type: 'presented',
							action: {
								type: 'authorizationRequested',
								provider: action.provider,
								intent: 'link',
								returnTo: action.returnTo ?? null
							}
						}
					});
				})
			];
		}

		case 'closeOAuthStart':
			if (state.oauthStart === null) return unchanged(state);
			return [{ ...state, oauthStart: null }, Effect.none()];

		case 'openOAuthCallback':
			if (hasLiveTemporaryFlow(state)) return unchanged(state);
			return [{ ...state, oauthCallback: createInitialOAuthCallbackState() }, Effect.none()];

		case 'restartOAuthCallback':
			return [{ ...state, ...noFlows, oauthCallback: createInitialOAuthCallbackState() }, Effect.none()];

		case 'closeOAuthCallback':
			if (state.oauthCallback === null) return unchanged(state);
			return [{ ...state, oauthCallback: null }, Effect.none()];

		case 'openMagicLinkRequest':
			if (hasLiveTemporaryFlow(state)) return unchanged(state);
			return [{ ...state, magicLinkRequest: createInitialMagicLinkRequestState() }, Effect.none()];

		case 'restartMagicLinkRequest':
			return [{ ...state, ...noFlows, magicLinkRequest: createInitialMagicLinkRequestState() }, Effect.none()];

		case 'closeMagicLinkRequest':
			if (state.magicLinkRequest === null) return unchanged(state);
			return [{ ...state, magicLinkRequest: null }, Effect.none()];

		case 'openMagicLinkSignIn':
			if (hasLiveTemporaryFlow(state)) return unchanged(state);
			return [{ ...state, magicLinkSignIn: createInitialMagicLinkSignInState(action.token ?? null) }, Effect.none()];

		case 'restartMagicLinkSignIn':
			return [{ ...state, ...noFlows, magicLinkSignIn: createInitialMagicLinkSignInState(action.token ?? null) }, Effect.none()];

		case 'closeMagicLinkSignIn':
			if (state.magicLinkSignIn === null) return unchanged(state);
			return [{ ...state, magicLinkSignIn: null }, Effect.none()];

		case 'openAccount':
			if (!canOpenSettings(state) || state.account !== null) return unchanged(state);
			return [{ ...state, account: createInitialAccountState() }, Effect.none()];

		case 'restartAccount':
			if (authenticatedId(state) === null) return unchanged(state);
			return [{ ...state, account: createInitialAccountState() }, Effect.none()];

		case 'closeAccount':
			if (state.account === null) return unchanged(state);
			return [{ ...state, account: null }, Effect.none()];

		case 'openConnectedAccounts':
			if (!canOpenSettings(state) || state.connectedAccounts !== null) return unchanged(state);
			return [{ ...state, connectedAccounts: createInitialConnectedAccountsState() }, Effect.none()];

		case 'restartConnectedAccounts':
			if (authenticatedId(state) === null) return unchanged(state);
			return [{ ...state, connectedAccounts: createInitialConnectedAccountsState() }, Effect.none()];

		case 'closeConnectedAccounts':
			if (state.connectedAccounts === null) return unchanged(state);
			return [{ ...state, connectedAccounts: null }, Effect.none()];

		case 'openChangeEmail':
			if (!canOpenSettings(state) || state.changeEmail !== null) return unchanged(state);
			return [{ ...state, changeEmail: createInitialChangeEmailState() }, Effect.none()];

		case 'restartChangeEmail':
			if (authenticatedId(state) === null) return unchanged(state);
			return [{ ...state, changeEmail: createInitialChangeEmailState() }, Effect.none()];

		case 'closeChangeEmail':
			if (state.changeEmail === null) return unchanged(state);
			return [{ ...state, changeEmail: null }, Effect.none()];

		case 'openChangeEmailConfirm':
			if (hasLiveTemporaryFlow(state)) return unchanged(state);
			return [
				{
					...state,
					changeEmailConfirm: createInitialChangeEmailConfirmState(action.token ?? null)
				},
				Effect.none()
			];

		case 'restartChangeEmailConfirm':
			return [
				{
					...state,
					...noFlows,
					changeEmailConfirm: createInitialChangeEmailConfirmState(action.token ?? null)
				},
				Effect.none()
			];

		case 'closeChangeEmailConfirm':
			if (state.changeEmailConfirm === null) return unchanged(state);
			return [{ ...state, changeEmailConfirm: null }, Effect.none()];

		case 'openChangePassword':
			if (!canOpenSettings(state) || state.changePassword !== null) return unchanged(state);
			return [{ ...state, changePassword: createInitialChangePasswordState() }, Effect.none()];

		case 'restartChangePassword':
			if (authenticatedId(state) === null || state.changePassword?.status === 'submitting') return unchanged(state);
			return [{ ...state, changePassword: createInitialChangePasswordState() }, Effect.none()];

		case 'closeChangePassword':
			if (state.changePassword === null || state.changePassword.status === 'submitting') return unchanged(state);
			return [{ ...state, changePassword: null }, Effect.none()];

		case 'openDeleteAccount':
			if (!canOpenSettings(state) || state.deleteAccount !== null) return unchanged(state);
			return [{ ...state, deleteAccount: createInitialDeleteAccountState() }, Effect.none()];

		case 'restartDeleteAccount':
			if (authenticatedId(state) === null || state.deleteAccount?.status === 'deleting') return unchanged(state);
			return [{ ...state, deleteAccount: createInitialDeleteAccountState() }, Effect.none()];

		case 'closeDeleteAccount':
			if (state.deleteAccount === null || state.deleteAccount.status === 'deleting') return unchanged(state);
			return [{ ...state, deleteAccount: null }, Effect.none()];

		case 'openSessionRefresh':
			if (!canOpenSettings(state) || state.sessionRefresh !== null) return unchanged(state);
			return [{ ...state, sessionRefresh: createInitialSessionRefreshState(state.session.expiresAt) }, Effect.none()];

		case 'restartSessionRefresh':
			if (authenticatedId(state) === null) return unchanged(state);
			return [{ ...state, sessionRefresh: createInitialSessionRefreshState(state.session.expiresAt) }, Effect.none()];

		case 'closeSessionRefresh':
			if (state.sessionRefresh === null) return unchanged(state);
			return [{ ...state, sessionRefresh: null }, Effect.none()];

		case 'cancelSignIn':
			if (!hasLiveTemporaryFlow(state)) return unchanged(state);
			return [{ ...state, ...noFlows }, Effect.none()];

		case 'login':
			return reduceLoginResult(state, action.action);

		case 'mfa':
			return reduceMfaResult(state, action.action);

		case 'signup':
			return reduceSignupResult(state, action.action);

		case 'forgotPassword':
			return reduceForgotPasswordResult(state, action.action);

		case 'resetPassword':
			return reduceResetPasswordResult(state, action.action);

		case 'emailVerification':
			return reduceEmailVerificationResult(state, action.action);

		case 'mfaEnrolment':
			return reduceMfaEnrolmentResult(state, action.action);

		case 'mfaManagement':
			return reduceMfaManagementResult(state, action.action);

		case 'oauthStart':
			return reduceOAuthStartResult(state, action.action);

		case 'oauthCallback':
			return reduceOAuthCallbackResult(state, action.action);

		case 'magicLinkRequest':
			return reduceMagicLinkRequestResult(state, action.action);

		case 'magicLinkSignIn':
			return reduceMagicLinkSignInResult(state, action.action);

		case 'account':
			return reduceAccountResult(state, action.action);

		case 'connectedAccounts':
			return reduceConnectedAccountsResult(state, action.action);

		case 'changeEmail':
			return reduceChangeEmailResult(state, action.action);

		case 'changeEmailConfirm':
			return reduceChangeEmailConfirmResult(state, action.action);

		case 'changePassword':
			return reduceChangePasswordResult(state, action.action);

		case 'deleteAccount':
			return reduceDeleteAccountResult(state, action.action);

		case 'sessionRefresh':
			return reduceSessionRefreshResult(state, action.action, deps);

		default: {
			const _exhaustive: never = action;
			void _exhaustive;
			return unchanged(state);
		}
	}
};

function reduceLoginResult(state: AuthFeatureState, action: PresentationAction<LoginAction>): Result {
	// A dismissal already removed the slot; a root result addressed to an
	// absent flow is ignored.
	if (action.type !== 'presented' || state.login === null) return unchanged(state);
	const child = action.action;
	const flow = state.login;
	// The flow stores the action's snapshot. This is not request correlation:
	// owner gating and the fixed cancellable ID protect effect feedback, while
	// a manually dispatched root result has root authority.
	if (child.type === 'loginSucceeded' && flow.status === 'succeeded' && flow.session === child.session) {
		return [handOver(state, 'login', child.session), Effect.none()];
	}
	if (child.type === 'loginFailed' && isMfaRequired(flow.error)) {
		const mfa = createInitialMfaChallengeState(flow.error.challengeId, flow.error.methods);
		return [{ ...state, login: null, mfa }, Effect.none()];
	}
	return unchanged(state);
}

function reduceMfaResult(state: AuthFeatureState, action: PresentationAction<MfaChallengeAction>): Result {
	if (action.type !== 'presented' || state.mfa === null) return unchanged(state);
	const child = action.action;
	const flow = state.mfa;
	// Compare the action's snapshot with what the challenge stored. A stale
	// stamped result into an already-succeeded flow leaves its earlier snapshot
	// in place; an unstamped result has root authority and may be accepted.
	if (child.type === 'challengeSucceeded' && flow.status === 'succeeded' && flow.session === child.session) {
		return [handOver(state, 'mfa', child.session), Effect.none()];
	}
	if (child.type === 'startOverRequested') {
		return [{ ...state, login: createInitialLoginState(), mfa: null }, Effect.none()];
	}
	return unchanged(state);
}

function reduceSignupResult(state: AuthFeatureState, action: PresentationAction<SignupAction>): Result {
	if (action.type !== 'presented' || state.signup === null) return unchanged(state);
	const child = action.action;
	const flow = state.signup;
	// As for login: the stored snapshot must be the action's own.
	if (child.type === 'signupSucceeded' && flow.status === 'succeeded' && flow.session === child.session) {
		return [handOver(state, 'signup', child.session), Effect.none()];
	}
	// `verificationRequired` is deliberately not handled: the flow keeps its
	// terminal state and `pendingEmail`, and there is no session to hand over.
	if (child.type === 'signInRequested') {
		return [{ ...state, ...noFlows, login: createInitialLoginState() }, Effect.none()];
	}
	return unchanged(state);
}

function reduceResetPasswordResult(state: AuthFeatureState, action: PresentationAction<ResetPasswordAction>): Result {
	if (action.type !== 'presented' || state.resetPassword === null) return unchanged(state);
	const child = action.action;
	const flow = state.resetPassword;
	if (child.type === 'resetSucceeded' && child.session !== null && flow.status === 'reset' && flow.session === child.session) {
		return [handOver(state, 'resetPassword', child.session), Effect.none()];
	}
	// A successful reset without a session stays terminal. The parent can route
	// from the matching routed action and status; no auth handoff occurred.
	if (child.type === 'requestNewLinkRequested') {
		return [{ ...state, ...noFlows, forgotPassword: createInitialForgotPasswordState() }, Effect.none()];
	}
	if (child.type === 'signInRequested') {
		return [{ ...state, ...noFlows, login: createInitialLoginState() }, Effect.none()];
	}
	return unchanged(state);
}

function reduceForgotPasswordResult(state: AuthFeatureState, action: PresentationAction<ForgotPasswordAction>): Result {
	if (action.type !== 'presented' || state.forgotPassword === null) return unchanged(state);
	if (action.action.type === 'signInRequested') {
		return [{ ...state, ...noFlows, login: createInitialLoginState() }, Effect.none()];
	}
	return unchanged(state);
}

function reduceEmailVerificationResult(state: AuthFeatureState, action: PresentationAction<EmailVerificationAction>): Result {
	if (action.type !== 'presented' || state.emailVerification === null) return unchanged(state);
	const child = action.action;
	const flow = state.emailVerification;
	if (child.type === 'verificationSucceeded' && child.session !== null && flow.status === 'verified' && flow.session === child.session) {
		return [handOver(state, 'emailVerification', child.session), Effect.none()];
	}
	// No-session verification and resend stay visible; the parent routes from
	// their matching routed result and the child state, once per reduction.
	if (child.type === 'signInRequested') {
		return [{ ...state, ...noFlows, login: createInitialLoginState() }, Effect.none()];
	}
	return unchanged(state);
}

/**
 * The feature admits the acknowledgement itself, once per owner: only from an
 * owner that actually showed codes (`enrolled`, codes recorded) and has not
 * been acknowledged. The enrolment reducer leaves this action alone, so the
 * `acknowledged` read here is the value before this action — a repeat click
 * or a replay finds it `true` and reports nothing. The codes stay presented;
 * leaving is the parent's decision, made on this outcome.
 */
function reduceMfaEnrolmentResult(state: AuthFeatureState, action: PresentationAction<MfaEnrolmentAction>): Result {
	if (action.type !== 'presented' || state.mfaEnrolment === null) return unchanged(state);
	const flow = state.mfaEnrolment;
	if (action.action.type !== 'recoveryCodesAcknowledged') return unchanged(state);
	if (flow.status !== 'enrolled' || flow.recoveryCodes === null || flow.acknowledged) return unchanged(state);
	return [
		{ ...state, mfaEnrolment: { ...flow, acknowledged: true }, mfaOutcome: { kind: 'enrolmentAcknowledged' } },
		Effect.none()
	];
}

/**
 * Report only a result the management reducer accepted in this reduction.
 * `settled` is that reducer's one-reduction output: set by the arm that
 * accepted a disable or regenerate result, cleared by every other action. A
 * refused result — for an operation not in flight, or the same action object
 * replayed — leaves it `null`, so nothing is reported twice.
 */
function reduceMfaManagementResult(state: AuthFeatureState, action: PresentationAction<MfaManagementAction>): Result {
	if (action.type !== 'presented' || state.mfaManagement === null) return unchanged(state);
	const flow = state.mfaManagement;
	if (flow.settled === null) return unchanged(state);
	const report = (mfaOutcome: AuthMfaOutcome): Result => [{ ...state, mfaOutcome }, Effect.none()];
	if (flow.error === null) {
		return report(flow.settled === 'disable' ? { kind: 'disabled' } : { kind: 'recoveryCodesRegenerated' });
	}
	if (isReauthenticationRequired(flow.error)) {
		return report({ kind: 'reauthenticationRequired', operation: flow.settled, methods: flow.error.methods });
	}
	return unchanged(state);
}

/**
 * The start has no parent outcome: success is the page leaving, and a failure
 * stays in the flow beside its buttons.
 */
function reduceOAuthStartResult(state: AuthFeatureState, _action: PresentationAction<OAuthStartAction>): Result {
	return unchanged(state);
}

/**
 * Report only an outcome the callback reducer accepted in this reduction.
 * `settled` is that reducer's one-reduction output: set by the arm that
 * accepted an exchange result while `exchanging`, cleared before every other action.
 * A refused result — for an operation not in flight, a repeated action object,
 * or a result arriving before `callbackReceived` — leaves it `null`, so nothing
 * is reported twice.
 */
function reduceOAuthCallbackResult(
	state: AuthFeatureState,
	action: PresentationAction<OAuthCallbackAction>
): Result {
	if (action.type !== 'presented' || state.oauthCallback === null) return unchanged(state);
	const child = action.action;
	const flow = state.oauthCallback;

	if (flow.settled === 'succeeded' && child.type === 'exchangeSucceeded' && flow.status === 'completed') {
		if (flow.intent === 'link' && child.intent === 'link') {
			// Never the session: linking adds a way into the account already in use.
			return [
				{ ...state, oauthCallback: null, oauthOutcome: { kind: 'linkCompleted', returnTo: normaliseReturnTo(flow.returnTo) } },
				Effect.none()
			];
		}
		if (flow.intent === 'signIn' && flow.session !== null && flow.session === child.session) {
			const next = handOver(state, 'oauthCallback', flow.session);
			const oauthOutcome: AuthOAuthOutcome | null =
				next.handoff?.kind === 'accepted' ? { kind: 'signedIn', returnTo: normaliseReturnTo(flow.returnTo) } : null;
			return [{ ...next, oauthOutcome }, Effect.none()];
		}
		return unchanged(state);
	}

	if (flow.settled === 'failed' && child.type === 'exchangeFailed' && flow.status === 'failed') {
		const error = flow.error ?? child.error;
		// Only sign-in intent may take the MFA challenge route. A link failure
		// must stay visibly failed with a usable start-over route, never
		// presenting the MFA challenge or establishing/replacing a session.
		if (flow.intent === 'signIn' && isMfaRequired(error)) {
			const { challengeId, methods } = error;
			return [
				{
					...state,
					...noFlows,
					mfa: createInitialMfaChallengeState(challengeId, methods),
					oauthOutcome: { kind: 'mfaRequired', challengeId, methods }
				},
				Effect.none()
			];
		}
		return [
			{ ...state, oauthOutcome: { kind: 'failed', intent: flow.intent, error } },
			Effect.none()
		];
	}

	// "Start again" from a terminal failure, or "Back to sign in" from a page
	// reached with nothing to finish, or Continue from a completed panel that
	// a parent left mounted. Never while exchanging.
	if (child.type === 'startOverRequested' && (flow.status === 'failed' || flow.status === 'idle' || flow.status === 'completed')) {
		return [{ ...state, ...noFlows, login: createInitialLoginState() }, Effect.none()];
	}

	return unchanged(state);
}

/**
 * Report only an outcome the magic-link request reducer accepted in this reduction.
 * `settled` is that reducer's one-reduction output: set by the arm that
 * accepted a requestSent result while `submitting`, cleared before every other action.
 */
function reduceMagicLinkRequestResult(
	state: AuthFeatureState,
	action: PresentationAction<MagicLinkRequestAction>
): Result {
	if (action.type !== 'presented' || state.magicLinkRequest === null) return unchanged(state);
	const child = action.action;
	const flow = state.magicLinkRequest;

	if (flow.settled === 'sent' && child.type === 'requestSent' && flow.status === 'sent') {
		return [
			{ ...state, magicLinkOutcome: { kind: 'requestSent', email: flow.requestedFor ?? child.email } },
			Effect.none()
		];
	}

	if (child.type === 'signInRequested') {
		return [{ ...state, ...noFlows, login: createInitialLoginState() }, Effect.none()];
	}

	return unchanged(state);
}

/**
 * Report only an outcome the magic-link sign-in reducer accepted in this reduction.
 * `settled` is that reducer's one-reduction output: set by the arm that
 * accepted a sign-in result while `submitting`, cleared before every other action.
 */
function reduceMagicLinkSignInResult(
	state: AuthFeatureState,
	action: PresentationAction<MagicLinkSignInAction>
): Result {
	if (action.type !== 'presented' || state.magicLinkSignIn === null) return unchanged(state);
	const child = action.action;
	const flow = state.magicLinkSignIn;

	if (flow.settled === 'succeeded' && child.type === 'signInSucceeded' && flow.status === 'succeeded' && flow.session === child.session) {
		const next = handOver(state, 'magicLinkSignIn', flow.session);
		const magicLinkOutcome: AuthMagicLinkOutcome | null =
			next.handoff?.kind === 'accepted' ? { kind: 'signedIn' } : null;
		return [{ ...next, magicLinkOutcome }, Effect.none()];
	}

	if (flow.settled === 'failed' && child.type === 'signInFailed') {
		const error = flow.error ?? child.error;
		if (isMfaRequired(error)) {
			const { challengeId, methods } = error;
			return [
				{
					...state,
					...noFlows,
					mfa: createInitialMfaChallengeState(challengeId, methods),
					magicLinkOutcome: { kind: 'mfaRequired', challengeId, methods }
				},
				Effect.none()
			];
		}
		return unchanged(state);
	}

	// "Send me a new link" from missing or expired token, or "Start again" /
	// "Sign in another way" to return to sign in. Never while submitting.
	if (child.type === 'requestNewLinkRequested') {
		if (flow.status === 'submitting') return unchanged(state);
		return [{ ...state, ...noFlows, magicLinkRequest: createInitialMagicLinkRequestState() }, Effect.none()];
	}

	if (child.type === 'startOverRequested') {
		if (flow.status === 'submitting') return unchanged(state);
		return [{ ...state, ...noFlows, login: createInitialLoginState() }, Effect.none()];
	}

	return unchanged(state);
}

function reduceAccountResult(
	state: AuthFeatureState,
	_action: PresentationAction<AccountAction>
): Result {
	return unchanged(state);
}

/**
 * Report only an outcome the connected accounts reducer accepted in this reduction.
 * `settled` is that reducer's one-reduction output: set by the arm that
 * accepted an unlink result, cleared before every other action.
 * A refused result — for an operation not in flight, a repeated action object,
 * or mismatched provider — leaves it `null`, so nothing is reported twice.
 */
function reduceConnectedAccountsResult(
	state: AuthFeatureState,
	action: PresentationAction<ConnectedAccountsAction>
): Result {
	if (action.type !== 'presented' || state.connectedAccounts === null) return unchanged(state);
	const flow = state.connectedAccounts;
	if (flow.settled !== 'unlink') return unchanged(state);
	const child = action.action;

	if (child.type === 'unlinkSucceeded') {
		return [
			{
				...state,
				connectedAccountsOutcome: { kind: 'unlinked', provider: child.provider }
			},
			Effect.none()
		];
	}

	if (child.type === 'unlinkFailed' && isReauthenticationRequired(flow.error)) {
		return [
			{
				...state,
				connectedAccountsOutcome: {
					kind: 'reauthenticationRequired',
					provider: child.provider,
					methods: flow.error.methods
				}
			},
			Effect.none()
		];
	}

	return unchanged(state);
}

/**
 * Report only an outcome the change email reducer accepted in this reduction.
 * `settled` is that reducer's one-reduction output: set by the arm that
 * accepted a request or resend result, cleared before every other action.
 * A refused result — for an operation not in flight or a repeated action
 * object — leaves it `null`, so nothing is reported twice.
 */
function reduceChangeEmailResult(
	state: AuthFeatureState,
	action: PresentationAction<ChangeEmailAction>
): Result {
	if (action.type !== 'presented' || state.changeEmail === null) return unchanged(state);
	const flow = state.changeEmail;
	if (flow.settled === null) return unchanged(state);
	const child = action.action;

	if (child.type === 'changeRequestSucceeded') {
		return [
			{
				...state,
				changeEmailOutcome: { kind: 'requested', email: child.email }
			},
			Effect.none()
		];
	}

	if (child.type === 'resendSucceeded') {
		return [
			{
				...state,
				changeEmailOutcome: { kind: 'resent' }
			},
			Effect.none()
		];
	}

	if (
		(child.type === 'changeRequestFailed' || child.type === 'resendFailed') &&
		isReauthenticationRequired(child.error)
	) {
		return [
			{
				...state,
				changeEmailOutcome: {
					kind: 'reauthenticationRequired',
					methods: child.error.methods
				}
			},
			Effect.none()
		];
	}

	return unchanged(state);
}

/**
 * Report only an outcome the change email confirmation reducer accepted in this reduction.
 * `settled` is that reducer's one-reduction output: set by the arm that
 * accepted a confirmation success or failure, cleared before every other action.
 * Clicking "Sign in" dispatches `signInRequested`, presenting login.
 */
function reduceChangeEmailConfirmResult(
	state: AuthFeatureState,
	action: PresentationAction<ChangeEmailConfirmAction>
): Result {
	if (action.type !== 'presented' || state.changeEmailConfirm === null) return unchanged(state);
	const child = action.action;
	const flow = state.changeEmailConfirm;

	if (child.type === 'signInRequested') {
		return [{ ...state, ...noFlows, login: createInitialLoginState() }, Effect.none()];
	}

	if (flow.settled === null) return unchanged(state);

	if (child.type === 'confirmationSucceeded' && flow.status === 'confirmed' && flow.email !== null) {
		return [
			{
				...state,
				changeEmailConfirmOutcome: { kind: 'confirmed', email: flow.email }
			},
			Effect.none()
		];
	}

	if (child.type === 'confirmationFailed' && flow.settled === 'failed' && flow.error !== null) {
		return [
			{
				...state,
				changeEmailConfirmOutcome: { kind: 'failed', error: flow.error }
			},
			Effect.none()
		];
	}

	return unchanged(state);
}

/**
 * Report only an outcome the change password reducer accepted in this reduction.
 * `settled` is that reducer's one-reduction output: set by the arm that
 * accepted a password change success or failure, cleared before every other action.
 */
function reduceChangePasswordResult(
	state: AuthFeatureState,
	action: PresentationAction<ChangePasswordAction>
): Result {
	if (state.changePassword === null) return unchanged(state);
	if (action.type === 'dismiss') {
		if (state.changePassword.status === 'submitting') return unchanged(state);
		return [{ ...state, changePassword: null }, Effect.none()];
	}
	if (action.type !== 'presented') return unchanged(state);
	const flow = state.changePassword;
	if (flow.settled === null) return unchanged(state);
	const child = action.action;

	if (child.type === 'changeSucceeded' && flow.status === 'changed') {
		if (child.session !== null) {
			const currentSubjectId = authenticatedId(state);
			if (currentSubjectId !== null && child.session.subject_id !== currentSubjectId) {
				const mismatchError: AuthError = {
					code: 'unknown',
					message: 'Rotated session subject does not match authenticated user.'
				};
				return [
					{
						...state,
						changePassword: {
							...flow,
							session: null,
							error: mismatchError
						},
						changePasswordOutcome: {
							kind: 'rejected',
							reason: 'subjectMismatch',
							session: child.session,
							error: mismatchError
						}
					},
					Effect.none()
				];
			}
			const next = handOver(state, 'changePassword', child.session);
			const changePasswordOutcome: AuthChangePasswordOutcome | null =
				next.handoff?.kind === 'accepted'
					? { kind: 'changed', session: child.session }
					: null;
			return [{ ...next, changePasswordOutcome }, Effect.none()];
		}
		return [
			{
				...state,
				changePasswordOutcome: { kind: 'changed', session: null }
			},
			Effect.none()
		];
	}

	if (child.type === 'changeFailed' && flow.settled === 'failed' && flow.error !== null) {
		if (isReauthenticationRequired(flow.error)) {
			return [
				{
					...state,
					changePasswordOutcome: {
						kind: 'reauthenticationRequired',
						methods: flow.error.methods
					}
				},
				Effect.none()
			];
		}
	}

	return unchanged(state);
}

/**
 * Report only an outcome the delete account reducer accepted in this reduction.
 * `settled` is that reducer's one-reduction output: set by the arm that
 * accepted a deletion success or failure, cleared before every other action.
 *
 * On deletion success, transitions to anonymous session, retires all flows,
 * and pulses deleteAccountOutcome: { kind: 'deleted' }.
 */
function reduceDeleteAccountResult(
	state: AuthFeatureState,
	action: PresentationAction<DeleteAccountAction>
): Result {
	if (state.deleteAccount === null) return unchanged(state);
	if (action.type === 'dismiss') {
		if (state.deleteAccount.status === 'deleting') return unchanged(state);
		return [{ ...state, deleteAccount: null }, Effect.none()];
	}
	if (action.type !== 'presented') return unchanged(state);
	const flow = state.deleteAccount;
	if (flow.settled === null) return unchanged(state);
	const child = action.action;

	if (child.type === 'deletionSucceeded' && flow.status === 'deleted') {
		return [
			{
				...state,
				...allFlowsNull,
				session: {
					status: 'anonymous',
					subject: anonymousSubject,
					error: null,
					epoch: state.session.epoch + 1,
					expiresAt: null
				},
				deleteAccountOutcome: { kind: 'deleted' }
			},
			Effect.none()
		];
	}

	if (child.type === 'deletionFailed' && flow.settled === 'failed' && flow.error !== null) {
		if (isReauthenticationRequired(flow.error)) {
			return [
				{
					...state,
					deleteAccountOutcome: {
						kind: 'reauthenticationRequired',
						methods: flow.error.methods
					}
				},
				Effect.none()
			];
		}
	}

	return unchanged(state);
}

/**
 * Report only an outcome the session refresh reducer accepted in this reduction.
 *
 * Admitted only when the flow was actively refreshing before this reduction,
 * guarding against stale or replayed results.
 *
 * On refresh success, updates session expiry truthfully if authenticated,
 * and pulses sessionRefreshOutcome: { kind: 'refreshed', expiresAt }.
 *
 * On refresh failure with invalid_credentials, initiates resolveSession
 * reconciliation and pulses sessionRefreshOutcome: { kind: 'ended', error }.
 *
 * On transient failure, leaves session intact and pulses
 * sessionRefreshOutcome: { kind: 'failed', error }.
 */
function reduceSessionRefreshResult(
	state: AuthFeatureState,
	action: PresentationAction<SessionRefreshAction>,
	deps: AuthFeatureDependencies
): Result {
	if (state.sessionRefresh === null) return unchanged(state);
	if (action.type === 'dismiss') {
		return [{ ...state, sessionRefresh: null }, Effect.none()];
	}
	if (action.type !== 'presented') return unchanged(state);
	const flow = state.sessionRefresh;
	const settled = sessionRefreshSettledMarkers.get(flow);
	if (!settled) return unchanged(state);
	sessionRefreshSettledMarkers.delete(flow);
	const child = action.action;

	if (settled === 'refreshed' && child.type === 'refreshSucceeded') {
		// Parent owns session: update expiry truthfully only if currently authenticated
		if (state.session.subject.kind === 'authenticated') {
			return [
				{
					...state,
					session: {
						...state.session,
						expiresAt: child.expiresAt
					},
					sessionRefreshOutcome: {
						kind: 'refreshed',
						expiresAt: child.expiresAt
					}
				},
				Effect.none()
			];
		}
		return unchanged(state);
	}

	if (settled === 'ended' && child.type === 'refreshFailed') {
		// Reconciliation via resolveSession semantics (not unconditional logout)
		const [nextSessionState, sessionEffect] = sessionSlice(
			state,
			{ type: 'session', action: { type: 'resolveSession' } },
			deps
		);
		return [
			{
				...nextSessionState,
				sessionRefreshOutcome: {
					kind: 'ended',
					error: child.error
				}
			},
			sessionEffect
		];
	}

	if (settled === 'failed' && child.type === 'refreshFailed') {
		// Transient failure: keep valid session intact
		return [
			{
				...state,
				sessionRefreshOutcome: {
					kind: 'failed',
					error: child.error
				}
			},
			Effect.none()
		];
	}

	return unchanged(state);
}

function updateSessionRefreshOnSessionChange(
	previous: AuthFeatureState,
	next: AuthFeatureState,
	isAcceptedSameSubject: boolean
): AuthFeatureState {
	if (next.sessionRefresh === null) return next;
	const current = next.sessionRefresh;

	if (current.status === 'ended') {
		// Recover ended on an accepted transition into authenticated for the same subject
		if (isAcceptedSameSubject) {
			return {
				...next,
				sessionRefresh: {
					...current,
					status: 'idle',
					expiresAt: next.session.expiresAt,
					error: null
				}
			};
		}
		// While reconciliation is pending or for any other session action, leave ended slot alone
		return next;
	}

	// When not ended, keep expiry synchronized with parent session
	if (current.expiresAt !== next.session.expiresAt) {
		return {
			...next,
			sessionRefresh: {
				...current,
				expiresAt: next.session.expiresAt
			}
		};
	}

	return next;
}

/**
 * Hand a completed flow's snapshot to the session: one decision, read once.
 * The flows are finished either way; a refused result must not linger as a
 * `succeeded` flow.
 */
function handOver(state: AuthFeatureState, source: AuthHandoffSource, session: SessionSnapshot): AuthFeatureState {
	const decision = decideSessionEstablished(state.session, session);
	const handoff: AuthHandoff =
		decision.kind === 'accepted'
			? { kind: 'accepted', source, session }
			: { kind: 'refused', source, reason: decision.reason };
	const next = { ...state, ...noFlows, session: decision.state, handoff };
	const isAcceptedSameSubject =
		decision.kind === 'accepted' &&
		decision.state.subject.kind === 'authenticated' &&
		authenticatedId(state) !== null &&
		decision.state.subject.id === authenticatedId(state);
	return updateSessionRefreshOnSessionChange(state, next, isAcceptedSameSubject);
}

/**
 * The feature wrote a fresh sign-in over a live one: `restartLogin`, a
 * challenge's start-over, or a signup's "Sign in instead". Core replaces only
 * an owner live on both sides, so this is a replacement exactly when a sign-in
 * was already live; otherwise the fresh flow is simply created.
 */
function loginReplaced(action: AuthFeatureAction, before: AuthFeatureState, after: AuthFeatureState): boolean {
	if (action.type === 'restartLogin') return true;
	return (
		(isMfaStartOver(action) ||
			isSignupSignIn(action) ||
			isRecoverySignIn(action) ||
			isVerificationSignIn(action) ||
			isOAuthStartOver(action) ||
			isMagicLinkRequestSignIn(action) ||
			isMagicLinkSignInStartOver(action) ||
			isChangeEmailConfirmSignIn(action)) &&
		after.login !== before.login
	);
}

function isChangeEmailConfirmSignIn(action: AuthFeatureAction): boolean {
	return (
		action.type === 'changeEmailConfirm' &&
		action.action.type === 'presented' &&
		action.action.action.type === 'signInRequested'
	);
}

function isMagicLinkRequestSignIn(action: AuthFeatureAction): boolean {
	return (
		action.type === 'magicLinkRequest' &&
		action.action.type === 'presented' &&
		action.action.action.type === 'signInRequested'
	);
}

function isMagicLinkSignInStartOver(action: AuthFeatureAction): boolean {
	return (
		action.type === 'magicLinkSignIn' &&
		action.action.type === 'presented' &&
		action.action.action.type === 'startOverRequested'
	);
}

function isOAuthStartOver(action: AuthFeatureAction): boolean {
	return action.type === 'oauthCallback' && action.action.type === 'presented' && action.action.action.type === 'startOverRequested';
}

function isVerificationSignIn(action: AuthFeatureAction): boolean {
	return action.type === 'emailVerification' && action.action.type === 'presented' && action.action.action.type === 'signInRequested';
}

function isRecoverySignIn(action: AuthFeatureAction): boolean {
	return (action.type === 'forgotPassword' || action.type === 'resetPassword') &&
		action.action.type === 'presented' && action.action.action.type === 'signInRequested';
}

function isSignupSignIn(action: AuthFeatureAction): boolean {
	return (
		action.type === 'signup' &&
		action.action.type === 'presented' &&
		action.action.action.type === 'signInRequested'
	);
}

/**
 * The feature wrote a fresh signup over a live one. Only `restartSignup` does;
 * a `signup` action changes the flow through the child itself.
 */
function signupReplaced(action: AuthFeatureAction): boolean {
	return action.type === 'restartSignup';
}

function forgotPasswordReplaced(action: AuthFeatureAction): boolean {
	return action.type === 'restartForgotPassword' || isResetRequestNewLink(action);
}

function resetPasswordReplaced(action: AuthFeatureAction): boolean {
	return action.type === 'restartResetPassword';
}

function emailVerificationReplaced(action: AuthFeatureAction): boolean {
	return action.type === 'restartEmailVerification';
}

function isResetRequestNewLink(action: AuthFeatureAction): boolean {
	return action.type === 'resetPassword' && action.action.type === 'presented' && action.action.action.type === 'requestNewLinkRequested';
}

function isMfaStartOver(action: AuthFeatureAction): boolean {
	return (
		action.type === 'mfa' &&
		action.action.type === 'presented' &&
		action.action.action.type === 'startOverRequested'
	);
}

/**
 * The feature wrote a fresh challenge over a live one. A `login` action never
 * reaches the MFA child, so a changed `mfa` under one is the MFA branch's
 * write. An `mfa` action changes `mfa` through the child itself and is not a
 * replacement, and replacing on every `login` action would retire a live
 * challenge on each keystroke in the sign-in form.
 */
function mfaReplaced(action: AuthFeatureAction, before: AuthFeatureState, after: AuthFeatureState): boolean {
	return (
		(action.type === 'login' || action.type === 'oauthCallback' || action.type === 'magicLinkSignIn') &&
		after.mfa !== before.mfa
	);
}

function mfaEnrolmentReplaced(action: AuthFeatureAction): boolean {
	return action.type === 'restartMfaEnrolment';
}

function mfaManagementReplaced(action: AuthFeatureAction): boolean {
	return action.type === 'restartMfaManagement';
}

function oauthStartReplaced(action: AuthFeatureAction): boolean {
	return action.type === 'restartOAuthStart' || action.type === 'startOAuthLink';
}

function oauthCallbackReplaced(action: AuthFeatureAction): boolean {
	return action.type === 'restartOAuthCallback';
}

function magicLinkRequestReplaced(action: AuthFeatureAction): boolean {
	return action.type === 'restartMagicLinkRequest' || isMagicLinkSignInRequestNewLink(action);
}

function isMagicLinkSignInRequestNewLink(action: AuthFeatureAction): boolean {
	return (
		action.type === 'magicLinkSignIn' &&
		action.action.type === 'presented' &&
		action.action.action.type === 'requestNewLinkRequested'
	);
}

function magicLinkSignInReplaced(action: AuthFeatureAction): boolean {
	return action.type === 'restartMagicLinkSignIn';
}

function accountReplaced(action: AuthFeatureAction): boolean {
	return action.type === 'restartAccount';
}

function connectedAccountsReplaced(action: AuthFeatureAction): boolean {
	return action.type === 'restartConnectedAccounts';
}

function changeEmailReplaced(action: AuthFeatureAction): boolean {
	return action.type === 'restartChangeEmail';
}

function changeEmailConfirmReplaced(action: AuthFeatureAction): boolean {
	return action.type === 'restartChangeEmailConfirm';
}

function changePasswordReplaced(
	action: AuthFeatureAction,
	before: AuthFeatureState
): boolean {
	return action.type === 'restartChangePassword' && authenticatedId(before) !== null && before.changePassword?.status !== 'submitting';
}

function deleteAccountReplaced(
	action: AuthFeatureAction,
	before: AuthFeatureState
): boolean {
	return action.type === 'restartDeleteAccount' && before.deleteAccount?.status !== 'deleting';
}

function sessionRefreshReplaced(
	action: AuthFeatureAction,
	before: AuthFeatureState
): boolean {
	return action.type === 'restartSessionRefresh' && authenticatedId(before) !== null;
}
