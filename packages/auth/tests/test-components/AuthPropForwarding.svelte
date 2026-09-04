<script lang="ts">
	import AuthGuard from '../../src/lib/components/AuthGuard.svelte';
	import RoleGate from '../../src/lib/components/RoleGate.svelte';
	import LoginForm from '../../src/lib/components/LoginForm.svelte';
	import PasswordInput from '../../src/lib/components/PasswordInput.svelte';
	import PasswordCriteria from '../../src/lib/components/PasswordCriteria.svelte';
	import SignupForm from '../../src/lib/components/SignupForm.svelte';
	import EmailVerification from '../../src/lib/components/EmailVerification.svelte';
	import ForgotPasswordForm from '../../src/lib/components/ForgotPasswordForm.svelte';
	import ResetPasswordForm from '../../src/lib/components/ResetPasswordForm.svelte';
	import MfaChallengeForm from '../../src/lib/components/MfaChallengeForm.svelte';
	import MfaManagementPanel from '../../src/lib/components/MfaManagementPanel.svelte';
	import ConnectedAccountsPanel from '../../src/lib/components/ConnectedAccountsPanel.svelte';
	import RecoveryCodes from '../../src/lib/components/RecoveryCodes.svelte';
	import ChangeEmailForm from '../../src/lib/components/ChangeEmailForm.svelte';
	import EmailChangeConfirmation from '../../src/lib/components/EmailChangeConfirmation.svelte';
	import DeleteAccountPanel from '../../src/lib/components/DeleteAccountPanel.svelte';
	import SessionRefresh from '../../src/lib/components/SessionRefresh.svelte';
	import MfaEnrolment from '../../src/lib/components/MfaEnrolment.svelte';
	import OneTimeCodeInput from '../../src/lib/components/OneTimeCodeInput.svelte';
	import ChangePasswordForm from '../../src/lib/components/ChangePasswordForm.svelte';
	import SignOutButton from '../../src/lib/components/SignOutButton.svelte';
	import MagicLinkRequestForm from '../../src/lib/components/MagicLinkRequestForm.svelte';
	import MagicLinkSignIn from '../../src/lib/components/MagicLinkSignIn.svelte';
	import OAuthSignIn from '../../src/lib/components/OAuthSignIn.svelte';
	import OAuthCallback from '../../src/lib/components/OAuthCallback.svelte';
	import type {
		MfaChallengeAction,
		MfaChallengeState
	} from '../../src/lib/flows/mfa-challenge/types.js';
	import type {
		MfaEnrolmentAction,
		MfaEnrolmentState
	} from '../../src/lib/flows/mfa-enrolment/types.js';
	import type { MfaMethod } from '../../src/lib/deps.js';
	import type {
		ForgotPasswordAction,
		ForgotPasswordState
	} from '../../src/lib/flows/forgot-password/types.js';
	import type {
		ResetPasswordAction,
		ResetPasswordState
	} from '../../src/lib/flows/reset-password/types.js';
	import type {
		EmailVerificationAction,
		EmailVerificationState
	} from '../../src/lib/flows/email-verification/types.js';
	import type { SignupAction, SignupState } from '../../src/lib/flows/signup/types.js';
	import type { AuthError } from '../../src/lib/errors/types.js';
	import type {
		ChangePasswordAction,
		ChangePasswordState
	} from '../../src/lib/flows/change-password/types.js';
	import type {
		MagicLinkRequestAction,
		MagicLinkRequestState
	} from '../../src/lib/flows/magic-link-request/types.js';
	import type {
		MagicLinkSignInAction,
		MagicLinkSignInState
	} from '../../src/lib/flows/magic-link-signin/types.js';
	import type {
		OAuthStartAction,
		OAuthStartState
	} from '../../src/lib/flows/oauth-start/types.js';
	import type {
		OAuthCallbackAction,
		OAuthCallbackParams,
		OAuthCallbackState
	} from '../../src/lib/flows/oauth-callback/types.js';
	import type { LoginAction, LoginState } from '../../src/lib/flows/login/types.js';
	import type { SessionAction, SessionState } from '../../src/lib/session/types.js';
	import type {
		MfaManagementAction,
		MfaManagementState
	} from '../../src/lib/flows/mfa-management/types.js';
	import type {
		ConnectedAccountsAction,
		ConnectedAccountsState
	} from '../../src/lib/flows/connected-accounts/types.js';
	import type {
		ChangeEmailAction,
		ChangeEmailState
	} from '../../src/lib/flows/change-email/types.js';
	import type {
		ChangeEmailConfirmAction,
		ChangeEmailConfirmState
	} from '../../src/lib/flows/change-email-confirm/types.js';
	import type {
		DeleteAccountAction,
		DeleteAccountState
	} from '../../src/lib/flows/delete-account/types.js';
	import type {
		SessionRefreshAction,
		SessionRefreshState
	} from '../../src/lib/flows/session-refresh/types.js';
	import type { Snippet } from 'svelte';

	/**
	 * A consumer forwarding its own `$props()` straight through.
	 *
	 * Nothing renders this — it exists to be **typechecked**. Under
	 * `exactOptionalPropertyTypes` an optional prop read from `$props()` is
	 * `T | undefined`, which cannot land on a bare `T?`, so every optional prop
	 * these components declare has to say `| undefined` or they cannot be
	 * wrapped at all.
	 *
	 * **This file's own props are deliberately bare.** That is the entire
	 * mechanism: they simulate the naïve consumer whose `$props()` yields
	 * `T | undefined`. A sweep that "fixes" them here would neutralise the
	 * fixture and nothing would go red. Every `tests` directory is out of scope
	 * for exactly this reason.
	 */
	let {
		store,
		onAnonymous,
		children,
		fallback,
		pending,
		roles,
		gateChildren,
		gateFallback,
		flowStore,
		sessionStore,
		onSuccess,
		header,
		footer,
		submitLabel,
		headingLevel,
		emailLabel,
		passwordLabel,
		rememberLabel,
		formClass,
		fieldId,
		fieldName,
		value,
		oninput,
		onblur,
		invalid,
		errorId,
		describedBy,
		autocomplete,
		placeholder,
		disabled,
		showLabel,
		hideLabel,
		inputClass,
		signupFlowStore,
		onVerificationRequired,
		onSignIn,
		verification,
		signupClass,
		confirmLabel,
		password,
		criteriaId,
		criteriaLabel,
		metLabel,
		unmetLabel,
		criteriaClass,
		verifyFlowStore,
		token,
		verified,
		verifyClass,
		forgotFlowStore,
		onSent,
		forgotClass,
		resetFlowStore,
		onRequestNewLink,
		done,
		resetClass,
		onMfaRequired,
		challengeFlowStore,
		challenge,
		onStartOver,
		challengeClass,
		enrolmentFlowStore,
		qr,
		onDone,
		enrolmentClass,
		changePasswordFlowStore,
		hasPassword,
		onChanged,
		onReauthenticationRequired,
		changePasswordClass,
		signOutStore,
		onSignedOut,
		signOutLabel,
		showFailure,
		signOutClass,
		magicRequestFlowStore,
		magicRequestClass,
		magicSignInFlowStore,
		magicToken,
		magicEmail,
		signedIn,
		magicSignInClass,
		startFlowStore,
		providers,
		returnTo,
		icon,
		signInClass,
		callbackFlowStore,
		params,
		onCallbackSuccess,
		completed,
		callbackClass,
		codeId,
		codeValue,
		codeOninput,
		oneTimeCode,
		maxlength,
		mfaManagementStore,
		mfaEnabled,
		enrol,
		mfaManagementClass,
		connectedStore,
		connectedOauthStore,
		connectedProviders,
		availableProviders,
		onUnlinked,
		onProviderReauthenticationRequired,
		connectedClass,
		codes,
		onAcknowledged,
		codesClass,
		changeEmailFlowStore,
		currentEmail,
		emailVerified,
		pendingEmail,
		changeEmailClass,
		confirmFlowStore,
		confirmToken,
		confirmOnSignIn,
		onConfirmed,
		confirmedSnippet,
		confirmClass,
		deleteStore,
		accountEmail,
		onDeleted,
		confirmSnippet,
		deleteClass,
		refreshSessionStore,
		refreshFlowStore,
		endedSnippet
	}: {
		store: { readonly state: SessionState };
		onAnonymous?: () => void;
		children?: Snippet<[{ isRevalidating: boolean }]>;
		fallback?: Snippet<[{ error: AuthError | null }]>;
		pending?: Snippet;
		roles: readonly string[];
		// `RoleGate`'s snippets take no parameters, so they get their own props
		// rather than sharing `AuthGuard`'s — otherwise the arity mismatch is
		// what fails and the `| undefined` question never gets asked.
		gateChildren?: Snippet;
		gateFallback?: Snippet;

		// LoginForm. `flowStore` and `sessionStore` are required, so they are the
		// one pair here that is not deliberately bare — a required prop cannot be
		// `undefined` and there is nothing to prove about it.
		flowStore: {
			readonly state: LoginState;
			dispatch(action: LoginAction): void;
			subscribe(listener: (state: LoginState) => void): () => void;
		};
		sessionStore: { dispatch(action: SessionAction): void };
		onSuccess?: () => void;
		header?: Snippet;
		footer?: Snippet;
		submitLabel?: string;
		headingLevel?: 1 | 2 | 3 | 4;
		emailLabel?: string;
		passwordLabel?: string;
		rememberLabel?: string;
		// `class` cannot be a binding name, so both components' class props are
		// renamed here and passed through explicitly below.
		formClass?: string;

		// PasswordInput.
		fieldId: string;
		fieldName?: string;
		value: string;
		oninput: (event: Event & { currentTarget: HTMLInputElement }) => void;
		onblur?: () => void;
		invalid?: boolean;
		errorId?: string;
		describedBy?: string;
		autocomplete?: 'current-password' | 'new-password';
		placeholder?: string;
		disabled?: boolean;
		showLabel?: string;
		hideLabel?: string;
		inputClass?: string;

		// SignupForm — shares LoginForm's optional props by name where they mean
		// the same thing, so only the ones unique to it are listed.
		signupFlowStore: {
			readonly state: SignupState;
			dispatch(action: SignupAction): void;
			subscribe(listener: (state: SignupState) => void): () => void;
		};
		onVerificationRequired?: (email: string) => void;
		onSignIn?: () => void;
		verification?: Snippet<[{ email: string }]>;
		signupClass?: string;
		confirmLabel?: string;

		// PasswordCriteria.
		password: string;
		criteriaId?: string;
		criteriaLabel?: string;
		metLabel?: string;
		unmetLabel?: string;
		criteriaClass?: string;

		// EmailVerification.
		verifyFlowStore: {
			readonly state: EmailVerificationState;
			dispatch(action: EmailVerificationAction): void;
		};
		token?: string | null;
		verified?: Snippet<[{ signedIn: boolean }]>;
		verifyClass?: string;

		// ForgotPasswordForm — one store, because asking for a link establishes
		// no session and a `sessionStore` prop would misrepresent that.
		forgotFlowStore: {
			readonly state: ForgotPasswordState;
			dispatch(action: ForgotPasswordAction): void;
			subscribe(listener: (state: ForgotPasswordState) => void): () => void;
		};
		onSent?: (email: string) => void;
		forgotClass?: string;

		// ResetPasswordForm.
		resetFlowStore: {
			readonly state: ResetPasswordState;
			dispatch(action: ResetPasswordAction): void;
			subscribe(listener: (state: ResetPasswordState) => void): () => void;
		};
		onRequestNewLink: () => void;
		done?: Snippet<[{ signedIn: boolean }]>;
		resetClass?: string;

		// LoginForm's MFA branch.
		onMfaRequired?: (challenge: { challengeId: string; methods: readonly MfaMethod[] }) => void;

		// MfaChallengeForm.
		challengeFlowStore: {
			readonly state: MfaChallengeState;
			dispatch(action: MfaChallengeAction): void;
			subscribe(listener: (state: MfaChallengeState) => void): () => void;
		};
		challenge?: { challengeId: string; methods: readonly MfaMethod[] };
		onStartOver: () => void;
		challengeClass?: string;

		// MfaEnrolment.
		enrolmentFlowStore: {
			readonly state: MfaEnrolmentState;
			dispatch(action: MfaEnrolmentAction): void;
			subscribe(listener: (state: MfaEnrolmentState) => void): () => void;
		};
		qr?: Snippet<[{ otpauthUri: string; secret: string }]>;
		onDone?: () => void;
		enrolmentClass?: string;

		// ChangePasswordForm.
		changePasswordFlowStore: {
			readonly state: ChangePasswordState;
			dispatch(action: ChangePasswordAction): void;
			subscribe(listener: (state: ChangePasswordState) => void): () => void;
		};
		hasPassword?: boolean;
		onChanged?: () => void;
		onReauthenticationRequired?: (demand: {
			methods: readonly ('password' | 'totp' | 'recovery_code')[];
		}) => void;
		changePasswordClass?: string;

		// SignOutButton. `store` is required and reads *and* dispatches, unlike
		// the guards above — so it cannot reuse their narrower `store` prop.
		signOutStore: {
			readonly state: SessionState;
			dispatch(action: SessionAction): void;
		};
		onSignedOut?: () => void;
		signOutLabel?: string;
		showFailure?: boolean;
		signOutClass?: string;
		mfaManagementStore: {
			readonly state: MfaManagementState;
			dispatch(action: MfaManagementAction): void;
		};
		mfaEnabled?: boolean;
		enrol?: Snippet;
		mfaManagementClass?: string;
		connectedStore: {
			readonly state: ConnectedAccountsState;
			dispatch(action: ConnectedAccountsAction): void;
		};
		connectedOauthStore: {
			readonly state: OAuthStartState;
			dispatch(action: OAuthStartAction): void;
		};
		connectedProviders?: readonly string[];
		availableProviders?: readonly { id: string; label: string }[];
		onUnlinked?: () => void;
		onProviderReauthenticationRequired?: (demand: {
			provider: string;
			methods: readonly ('password' | 'totp' | 'recovery_code')[];
		}) => void;
		connectedClass?: string;
		codes: readonly string[];
		onAcknowledged?: () => void;
		codesClass?: string;
		changeEmailFlowStore: {
			readonly state: ChangeEmailState;
			dispatch(action: ChangeEmailAction): void;
			subscribe(listener: (state: ChangeEmailState) => void): () => void;
		};
		currentEmail?: string;
		emailVerified?: boolean;
		pendingEmail?: string | null;
		changeEmailClass?: string;
		confirmFlowStore: {
			readonly state: ChangeEmailConfirmState;
			dispatch(action: ChangeEmailConfirmAction): void;
		};
		confirmToken?: string | null;
		confirmOnSignIn: () => void;
		onConfirmed?: (email: string) => void;
		confirmedSnippet?: Snippet<[{ email: string }]>;
		confirmClass?: string;
		deleteStore: {
			readonly state: DeleteAccountState;
			dispatch(action: DeleteAccountAction): void;
		};
		accountEmail?: string;
		onDeleted?: () => void;
		confirmSnippet?: Snippet<[{ confirm: () => void; cancel: () => void; busy: boolean }]>;
		deleteClass?: string;
		refreshSessionStore: {
			readonly state: SessionState;
			dispatch(action: SessionAction): void;
		};
		refreshFlowStore: {
			readonly state: SessionRefreshState;
			dispatch(action: SessionRefreshAction): void;
		};
		endedSnippet?: Snippet;

		// MagicLinkRequestForm.
		magicRequestFlowStore: {
			readonly state: MagicLinkRequestState;
			dispatch(action: MagicLinkRequestAction): void;
			subscribe(listener: (state: MagicLinkRequestState) => void): () => void;
		};
		magicRequestClass?: string;

		// MagicLinkSignIn. `onRequestNewLink` is shared with `ResetPasswordForm`
		// above — same type, same requiredness, same reason for being required.
		// `onSent` is shared with `ForgotPasswordForm`.
		magicSignInFlowStore: {
			readonly state: MagicLinkSignInState;
			dispatch(action: MagicLinkSignInAction): void;
		};
		magicToken?: string | null;
		magicEmail?: string | null;
		signedIn?: Snippet;
		magicSignInClass?: string;

		// OAuthSignIn.
		startFlowStore: {
			readonly state: OAuthStartState;
			dispatch(action: OAuthStartAction): void;
		};
		providers: readonly { id: string; label: string }[];
		returnTo?: string | null;
		icon?: Snippet<[{ provider: { id: string; label: string } }]>;
		signInClass?: string;

		// OAuthCallback. `onCallbackSuccess` is required, so it is typed
		// non-optional: there is nothing to prove about a value that cannot be
		// `undefined`. `onStartOver` is shared with `MfaChallengeForm` above —
		// same type, same requiredness.
		callbackFlowStore: {
			readonly state: OAuthCallbackState;
			dispatch(action: OAuthCallbackAction): void;
		};
		params?: OAuthCallbackParams | null;
		onCallbackSuccess: (result: { returnTo: string | null }) => void;
		completed?: Snippet<[{ returnTo: string | null }]>;
		callbackClass?: string;

		// OneTimeCodeInput.
		codeId: string;
		codeValue: string;
		codeOninput: (event: Event & { currentTarget: HTMLInputElement }) => void;
		oneTimeCode?: boolean;
		maxlength?: number;
	} = $props();
</script>

<AuthGuard {store} {onAnonymous} {children} {fallback} {pending} />
<RoleGate {store} {roles} children={gateChildren} fallback={gateFallback} {pending} />
<LoginForm
	{flowStore}
	{sessionStore}
	{onSuccess}
	{onMfaRequired}
	{header}
	{footer}
	{submitLabel}
	{headingLevel}
	{emailLabel}
	{passwordLabel}
	{rememberLabel}
	class={formClass}
/>
<PasswordInput
	id={fieldId}
	name={fieldName}
	{value}
	{oninput}
	{onblur}
	{invalid}
	{errorId}
	{describedBy}
	{autocomplete}
	{placeholder}
	{disabled}
	{showLabel}
	{hideLabel}
	class={inputClass}
/>
<SignupForm
	flowStore={signupFlowStore}
	{sessionStore}
	{onSuccess}
	{onVerificationRequired}
	{onSignIn}
	{header}
	{footer}
	{verification}
	{submitLabel}
	{headingLevel}
	{emailLabel}
	{passwordLabel}
	{confirmLabel}
	class={signupClass}
/>
<PasswordCriteria
	{password}
	id={criteriaId}
	label={criteriaLabel}
	{metLabel}
	{unmetLabel}
	class={criteriaClass}
/>
<EmailVerification
	flowStore={verifyFlowStore}
	{sessionStore}
	{token}
	{onSuccess}
	{onSignIn}
	{headingLevel}
	{verified}
	class={verifyClass}
/>
<ForgotPasswordForm
	flowStore={forgotFlowStore}
	{onSent}
	{header}
	{footer}
	{submitLabel}
	{headingLevel}
	{emailLabel}
	class={forgotClass}
/>
<ResetPasswordForm
	flowStore={resetFlowStore}
	{sessionStore}
	{token}
	{onSuccess}
	{onSignIn}
	{onRequestNewLink}
	{headingLevel}
	{submitLabel}
	{passwordLabel}
	{confirmLabel}
	{done}
	class={resetClass}
/>
<MfaChallengeForm
	flowStore={challengeFlowStore}
	{sessionStore}
	{challenge}
	{onSuccess}
	{onStartOver}
	{headingLevel}
	{submitLabel}
	{footer}
	class={challengeClass}
/>
<MfaEnrolment
	flowStore={enrolmentFlowStore}
	{qr}
	{onDone}
	{headingLevel}
	{submitLabel}
	class={enrolmentClass}
/>
<OneTimeCodeInput
	name="code"
	id={codeId}
	value={codeValue}
	oninput={codeOninput}
	{onblur}
	{invalid}
	{errorId}
	{describedBy}
	{oneTimeCode}
	{maxlength}
	{placeholder}
	{disabled}
	class={inputClass}
/>
<OAuthSignIn
	flowStore={startFlowStore}
	{providers}
	{returnTo}
	{icon}
	{header}
	{headingLevel}
	class={signInClass}
/>
<OAuthCallback
	flowStore={callbackFlowStore}
	{sessionStore}
	{params}
	onSuccess={onCallbackSuccess}
	{onStartOver}
	{onMfaRequired}
	{headingLevel}
	{completed}
	{footer}
	class={callbackClass}
/>
<MagicLinkRequestForm
	flowStore={magicRequestFlowStore}
	{onSent}
	{header}
	{footer}
	{submitLabel}
	{headingLevel}
	{emailLabel}
	class={magicRequestClass}
/>
<MagicLinkSignIn
	flowStore={magicSignInFlowStore}
	{sessionStore}
	token={magicToken}
	email={magicEmail}
	{onSuccess}
	{onRequestNewLink}
	{onMfaRequired}
	{headingLevel}
	{submitLabel}
	{signedIn}
	{footer}
	class={magicSignInClass}
/>
<ChangePasswordForm
	flowStore={changePasswordFlowStore}
	{sessionStore}
	{hasPassword}
	{onChanged}
	{onReauthenticationRequired}
	{headingLevel}
	{submitLabel}
	{footer}
	class={changePasswordClass}
/>
<SignOutButton
	store={signOutStore}
	{onSignedOut}
	label={signOutLabel}
	{showFailure}
	class={signOutClass}
/>
<MfaManagementPanel
	store={mfaManagementStore}
	{mfaEnabled}
	{onChanged}
	{onReauthenticationRequired}
	{enrol}
	{headingLevel}
	{footer}
	class={mfaManagementClass}
/>
<ConnectedAccountsPanel
	store={connectedStore}
	oauthStore={connectedOauthStore}
	providers={connectedProviders}
	available={availableProviders}
	{hasPassword}
	{returnTo}
	{onUnlinked}
	onReauthenticationRequired={onProviderReauthenticationRequired}
	{headingLevel}
	{footer}
	class={connectedClass}
/>
<RecoveryCodes {codes} {onAcknowledged} {headingLevel} class={codesClass} />
<ChangeEmailForm
	flowStore={changeEmailFlowStore}
	{currentEmail}
	{emailVerified}
	{pendingEmail}
	{onChanged}
	{onReauthenticationRequired}
	{headingLevel}
	{submitLabel}
	{emailLabel}
	{footer}
	class={changeEmailClass}
/>
<EmailChangeConfirmation
	flowStore={confirmFlowStore}
	token={confirmToken}
	onSignIn={confirmOnSignIn}
	{onConfirmed}
	{headingLevel}
	confirmed={confirmedSnippet}
	class={confirmClass}
/>
<DeleteAccountPanel
	store={deleteStore}
	{sessionStore}
	email={accountEmail}
	{onDeleted}
	{onReauthenticationRequired}
	confirm={confirmSnippet}
	{headingLevel}
	{footer}
	class={deleteClass}
/>
<SessionRefresh flowStore={refreshFlowStore} sessionStore={refreshSessionStore} ended={endedSnippet} />
