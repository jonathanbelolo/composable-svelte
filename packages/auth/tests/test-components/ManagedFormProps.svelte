<script lang="ts">
	/**
	 * Compile-only: the managed/standalone props of `LoginForm`,
	 * `MfaChallengeForm` and `SignupForm`. Never mounted.
	 *
	 * A `.svelte` file on purpose. Plain `tsc` resolves a `.svelte` import to a
	 * loose shim, so `ComponentProps` of one is `Record<string, any>` there and
	 * every `@ts-expect-error` below would be unused. svelte-check compiles the
	 * real props, and an unused directive fails it — so each expected error is
	 * also this file's proof that it is being checked at all.
	 *
	 * Managed values come from `PresentationFeatureViewProps`, the type
	 * `defineViews` hands a content snippet; nothing is cast.
	 */
	import type { ComponentProps, Snippet } from 'svelte';
	import type { Store } from '@composable-svelte/core';
	import type {
		PresentationFeatureViewProps,
		PresentationView,
		ViewDeclarations
	} from '@composable-svelte/core/application';

	import LoginForm from '../../src/lib/components/LoginForm.svelte';
	import MfaChallengeForm from '../../src/lib/components/MfaChallengeForm.svelte';
	import SignupForm from '../../src/lib/components/SignupForm.svelte';
	import ForgotPasswordForm from '../../src/lib/components/ForgotPasswordForm.svelte';
	import ResetPasswordForm from '../../src/lib/components/ResetPasswordForm.svelte';
	import EmailVerification from '../../src/lib/components/EmailVerification.svelte';
	import MfaEnrolment from '../../src/lib/components/MfaEnrolment.svelte';
	import MfaManagementPanel from '../../src/lib/components/MfaManagementPanel.svelte';
	import OAuthSignIn from '../../src/lib/components/OAuthSignIn.svelte';
	import OAuthCallback from '../../src/lib/components/OAuthCallback.svelte';
	import MagicLinkRequestForm from '../../src/lib/components/MagicLinkRequestForm.svelte';
	import MagicLinkSignIn from '../../src/lib/components/MagicLinkSignIn.svelte';
	import ConnectedAccountsPanel from '../../src/lib/components/ConnectedAccountsPanel.svelte';
	import ChangeEmailForm from '../../src/lib/components/ChangeEmailForm.svelte';
	import EmailChangeConfirmation from '../../src/lib/components/EmailChangeConfirmation.svelte';
	import ChangePasswordForm from '../../src/lib/components/ChangePasswordForm.svelte';
	import DeleteAccountPanel from '../../src/lib/components/DeleteAccountPanel.svelte';
	import SessionRefresh from '../../src/lib/components/SessionRefresh.svelte';
	import AuthGuard from '../../src/lib/components/AuthGuard.svelte';
	import RoleGate from '../../src/lib/components/RoleGate.svelte';
	import PasswordInput from '../../src/lib/components/PasswordInput.svelte';
	import PasswordCriteria from '../../src/lib/components/PasswordCriteria.svelte';
	import OneTimeCodeInput from '../../src/lib/components/OneTimeCodeInput.svelte';
	import type { AuthFeatureCatalog } from '../../src/lib/application/index.js';
	import type {
		LoginAction,
		LoginState,
		MfaChallengeAction,
		MfaChallengeState,
		SignupAction,
		SignupState,
		ForgotPasswordAction,
		ForgotPasswordState,
		ResetPasswordAction,
		ResetPasswordState,
		EmailVerificationAction,
		EmailVerificationState,
		MfaEnrolmentAction,
		MfaEnrolmentState,
		MfaManagementAction,
		MfaManagementState,
		OAuthStartAction,
		OAuthStartState,
		OAuthCallbackAction,
		OAuthCallbackState,
		MagicLinkRequestAction,
		MagicLinkRequestState,
		MagicLinkSignInAction,
		MagicLinkSignInState,
		AccountAction,
		AccountState,
		ConnectedAccountsAction,
		ConnectedAccountsState,
		ChangeEmailAction,
		ChangeEmailState,
		ChangeEmailConfirmAction,
		ChangeEmailConfirmState,
		ChangePasswordAction,
		ChangePasswordState,
		DeleteAccountAction,
		DeleteAccountState,
		SessionRefreshAction,
		SessionRefreshState
	} from '../../src/lib/flows/index.js';
	import type { SessionAction, SessionState } from '../../src/lib/session/index.js';

	type LoginProps = ComponentProps<typeof LoginForm>;
	type MfaProps = ComponentProps<typeof MfaChallengeForm>;
	type SignupProps = ComponentProps<typeof SignupForm>;
	type ForgotProps = ComponentProps<typeof ForgotPasswordForm>;
	type ResetProps = ComponentProps<typeof ResetPasswordForm>;
	type VerificationProps = ComponentProps<typeof EmailVerification>;
	type EnrolmentProps = ComponentProps<typeof MfaEnrolment>;
	type ManagementProps = ComponentProps<typeof MfaManagementPanel>;
	type OAuthStartProps = ComponentProps<typeof OAuthSignIn>;
	type OAuthCallbackProps = ComponentProps<typeof OAuthCallback>;
	type MagicLinkRequestProps = ComponentProps<typeof MagicLinkRequestForm>;
	type MagicLinkSignInProps = ComponentProps<typeof MagicLinkSignIn>;
	type ConnectedAccountsProps = ComponentProps<typeof ConnectedAccountsPanel>;
	type ChangeEmailProps = ComponentProps<typeof ChangeEmailForm>;
	type ChangeEmailConfirmProps = ComponentProps<typeof EmailChangeConfirmation>;
	type ChangePasswordProps = ComponentProps<typeof ChangePasswordForm>;
	type DeleteAccountProps = ComponentProps<typeof DeleteAccountPanel>;
	type SessionRefreshProps = ComponentProps<typeof SessionRefresh>;
	type Session = { dispatch(action: SessionAction): void };

	/** What `defineViews` passes each slot's content snippet, from the real catalog. */
	type ContentParameter<K extends keyof AuthFeatureCatalog> =
		Extract<ViewDeclarations<AuthFeatureCatalog>[K], { content: unknown }>['content'] extends
			| Snippet<[infer P]>
			| undefined
			? P
			: never;

	export function managed(
		login: ContentParameter<'login'>,
		mfa: ContentParameter<'mfa'>
	): [LoginProps, MfaProps] {
		const exact: [
			PresentationFeatureViewProps<LoginState, LoginAction>,
			PresentationFeatureViewProps<MfaChallengeState, MfaChallengeAction>
		] = [login, mfa];
		return [
			{ mode: 'managed', flowStore: exact[0].store, headingLevel: 1, submitLabel: 'Continue' },
			{ mode: 'managed', flowStore: mfa.store, footer: undefined }
		];
	}

	export function managedRefuses(
		login: PresentationView<LoginState, LoginAction>,
		mfa: PresentationView<MfaChallengeState, MfaChallengeAction>,
		session: Session
	): unknown[] {
		// @ts-expect-error — the feature performs the handoff.
		const a: LoginProps = { mode: 'managed', flowStore: login, sessionStore: session };
		const injected = { sessionStore: session };
		// @ts-expect-error — spread props cannot smuggle a second handoff into managed mode.
		const spread: LoginProps = { mode: 'managed', flowStore: login, ...injected };
		// @ts-expect-error — no success callback.
		const b: LoginProps = { mode: 'managed', flowStore: login, onSuccess: () => {} };
		// @ts-expect-error — the feature opens the challenge.
		const c: LoginProps = { mode: 'managed', flowStore: login, onMfaRequired: () => {} };
		// @ts-expect-error — the feature performs the handoff.
		const d: MfaProps = { mode: 'managed', flowStore: mfa, sessionStore: session };
		// @ts-expect-error — start over is `startOverRequested`, not a callback.
		const e: MfaProps = { mode: 'managed', flowStore: mfa, onStartOver: () => {} };
		// @ts-expect-error — no success callback.
		const f: MfaProps = { mode: 'managed', flowStore: mfa, onSuccess: () => {} };
		// @ts-expect-error — the feature seeds the challenge from `mfa_required`.
		const g: MfaProps = { mode: 'managed', flowStore: mfa, challenge: { challengeId: 'x', methods: ['totp'] } };
		return [a, spread, b, c, d, e, f, g];
	}

	export function branchesStayApart(
		login: PresentationView<LoginState, LoginAction>,
		mfa: PresentationView<MfaChallengeState, MfaChallengeAction>,
		loginStore: Store<LoginState, LoginAction>,
		session: Session
	): unknown[] {
		// @ts-expect-error — a retired view's state is `undefined`; standalone assumes it never is.
		const a: LoginProps = { flowStore: login, sessionStore: session };
		// @ts-expect-error — as above, for the challenge.
		const b: MfaProps = { flowStore: mfa, sessionStore: session, onStartOver: () => {} };
		// @ts-expect-error — `PresentationView` is nominal; a plain store is not one.
		const c: LoginProps = { mode: 'managed', flowStore: loginStore };
		return [a, b, c];
	}

	export function standalone(
		loginStore: Store<LoginState, LoginAction>,
		mfaStore: Store<MfaChallengeState, MfaChallengeAction>,
		session: Session
	): unknown[] {
		// @ts-expect-error — standalone must hand the session over somewhere.
		const a: LoginProps = { flowStore: loginStore };
		// @ts-expect-error — as above, with the explicit mode.
		const b: LoginProps = { mode: 'standalone', flowStore: loginStore };
		// @ts-expect-error — standalone "Back to sign in" needs somewhere to go.
		const c: MfaProps = { flowStore: mfaStore, sessionStore: session };
		// Existing call sites, unchanged.
		const ok: LoginProps = { flowStore: loginStore, sessionStore: session, onSuccess: () => {}, onMfaRequired: () => {} };
		const okMfa: MfaProps = { flowStore: mfaStore, sessionStore: session, onStartOver: () => {}, challenge: undefined };
		const explicit: MfaProps = { mode: 'standalone', flowStore: mfaStore, sessionStore: session, onStartOver: () => {} };
		return [a, b, c, ok, okMfa, explicit];
	}

	export function managedSignup(signup: ContentParameter<'signup'>): SignupProps[] {
		const exact: PresentationFeatureViewProps<SignupState, SignupAction> = signup;
		const verification: Snippet<[{ email: string }]> | undefined = undefined;
		return [
			{ mode: 'managed', flowStore: exact.store },
			{ mode: 'managed', flowStore: signup.store, headingLevel: 1, submitLabel: 'Join', verification }
		];
	}

	export function managedSignupRefuses(
		signup: PresentationView<SignupState, SignupAction>,
		signupStore: Store<SignupState, SignupAction>,
		session: Session
	): unknown[] {
		// @ts-expect-error — the feature performs the handoff.
		const a: SignupProps = { mode: 'managed', flowStore: signup, sessionStore: session };
		const injected = { sessionStore: session };
		// @ts-expect-error — spread props cannot smuggle a second handoff into managed mode.
		const spread: SignupProps = { mode: 'managed', flowStore: signup, ...injected };
		// @ts-expect-error — no success callback.
		const b: SignupProps = { mode: 'managed', flowStore: signup, onSuccess: () => {} };
		// @ts-expect-error — verification stays in the feature's state.
		const c: SignupProps = { mode: 'managed', flowStore: signup, onVerificationRequired: () => {} };
		// @ts-expect-error — "Sign in instead" is `signInRequested`, not a callback.
		const d: SignupProps = { mode: 'managed', flowStore: signup, onSignIn: () => {} };
		// @ts-expect-error — a retired view's state is `undefined`; standalone assumes it never is.
		const e: SignupProps = { flowStore: signup, sessionStore: session };
		// @ts-expect-error — `PresentationView` is nominal; a plain store is not one.
		const f: SignupProps = { mode: 'managed', flowStore: signupStore };
		return [a, spread, b, c, d, e, f];
	}

	export function standaloneSignup(signupStore: Store<SignupState, SignupAction>, session: Session): unknown[] {
		// @ts-expect-error — standalone must hand the session over somewhere.
		const a: SignupProps = { flowStore: signupStore };
		// Existing call sites, unchanged.
		const ok: SignupProps = {
			flowStore: signupStore,
			sessionStore: session,
			onSuccess: () => {},
			onVerificationRequired: () => {},
			onSignIn: () => {}
		};
		const explicit: SignupProps = { mode: 'standalone', flowStore: signupStore, sessionStore: session };
		return [a, ok, explicit];
	}

	export function managedRecovery(
		forgot: ContentParameter<'forgotPassword'>,
		reset: ContentParameter<'resetPassword'>,
		forgotStore: Store<ForgotPasswordState, ForgotPasswordAction>,
		resetStore: Store<ResetPasswordState, ResetPasswordAction>,
		session: Session
	): unknown[] {
		const exactForgot: PresentationFeatureViewProps<ForgotPasswordState, ForgotPasswordAction> = forgot;
		const exactReset: PresentationFeatureViewProps<ResetPasswordState, ResetPasswordAction> = reset;
		const a: ForgotProps = { mode: 'managed', flowStore: exactForgot.store };
		const b: ResetProps = { mode: 'managed', flowStore: exactReset.store };
		const injected = { sessionStore: session };
		// @ts-expect-error — the parent reads sent output after a routed action.
		const c: ForgotProps = { mode: 'managed', flowStore: forgot.store, onSent: () => {} };
		// @ts-expect-error — managed reset handoff belongs to the feature even through spreads.
		const d: ResetProps = { mode: 'managed', flowStore: reset.store, ...injected };
		// @ts-expect-error — managed new-link navigation uses a view action.
		const e: ResetProps = { mode: 'managed', flowStore: reset.store, onRequestNewLink: () => {} };
		// @ts-expect-error — the token belongs to the feature's open action.
		const f: ResetProps = { mode: 'managed', flowStore: reset.store, token: 'abc' };
		// @ts-expect-error — a managed view may be retired; standalone state may not.
		const g: ForgotProps = { flowStore: forgot.store };
		// @ts-expect-error — a plain store is not a presentation view.
		const h: ResetProps = { mode: 'managed', flowStore: resetStore };
		const standaloneForgot: ForgotProps = { flowStore: forgotStore, onSent: () => {} };
		const standaloneReset: ResetProps = { flowStore: resetStore, sessionStore: session, onRequestNewLink: () => {} };
		return [a, b, c, d, e, f, g, h, standaloneForgot, standaloneReset];
	}

	export function managedVerification(
		view: ContentParameter<'emailVerification'>,
		plain: Store<EmailVerificationState, EmailVerificationAction>,
		session: Session
	): unknown[] {
		const exact: PresentationFeatureViewProps<EmailVerificationState, EmailVerificationAction> = view;
		const ok: VerificationProps = { mode: 'managed', flowStore: exact.store, token: 'token' };
		const injected = { sessionStore: session };
		// @ts-expect-error — the feature performs the session handoff.
		const a: VerificationProps = { mode: 'managed', flowStore: view.store, ...injected };
		// @ts-expect-error — no managed success callback.
		const b: VerificationProps = { mode: 'managed', flowStore: view.store, onSuccess: () => {} };
		// @ts-expect-error — managed sign-in goes through the owned view.
		const c: VerificationProps = { mode: 'managed', flowStore: view.store, onSignIn: () => {} };
		// @ts-expect-error — a plain Store is not the genuine presentation view.
		const d: VerificationProps = { mode: 'managed', flowStore: plain };
		// @ts-expect-error — a retired view may have no state, which standalone cannot accept.
		const e: VerificationProps = { flowStore: view.store, sessionStore: session };
		// @ts-expect-error — standalone verification must provide a session handoff target.
		const f: VerificationProps = { flowStore: plain };
		const standalone: VerificationProps = { flowStore: plain, sessionStore: session, token: 'token' };
		return [ok, a, b, c, d, e, f, standalone];
	}

	export function managedMfaSettings(
		enrolment: ContentParameter<'mfaEnrolment'>,
		management: ContentParameter<'mfaManagement'>,
		enrolmentStore: Store<MfaEnrolmentState, MfaEnrolmentAction>,
		managementStore: Store<MfaManagementState, MfaManagementAction>
	): unknown[] {
		const exactEnrolment: PresentationFeatureViewProps<MfaEnrolmentState, MfaEnrolmentAction> = enrolment;
		const exactManagement: PresentationFeatureViewProps<MfaManagementState, MfaManagementAction> = management;
		const qr: Snippet<[{ otpauthUri: string; secret: string }]> | undefined = undefined;
		const ok: EnrolmentProps = { mode: 'managed', flowStore: exactEnrolment.store, qr, headingLevel: 1 };
		const okPanel: ManagementProps = { mode: 'managed', store: exactManagement.store, mfaEnabled: undefined };
		// @ts-expect-error — managed acknowledgement is `recoveryCodesAcknowledged`, not a callback.
		const a: EnrolmentProps = { mode: 'managed', flowStore: enrolment.store, onDone: () => {} };
		// @ts-expect-error — a plain Store is not the genuine presentation view.
		const b: EnrolmentProps = { mode: 'managed', flowStore: enrolmentStore };
		// @ts-expect-error — a retired view may have no state, which standalone cannot accept.
		const c: EnrolmentProps = { flowStore: enrolment.store };
		// @ts-expect-error — the feature reports successes as `mfaOutcome`.
		const d: ManagementProps = { mode: 'managed', store: management.store, onChanged: () => {} };
		// @ts-expect-error — the feature routes the demand as `mfaOutcome`.
		const e: ManagementProps = { mode: 'managed', store: management.store, onReauthenticationRequired: () => {} };
		// @ts-expect-error — a plain Store is not the genuine presentation view.
		const f: ManagementProps = { mode: 'managed', store: managementStore };
		// @ts-expect-error — a retired view may have no state, which standalone cannot accept.
		const g: ManagementProps = { store: management.store, mfaEnabled: true };
		// Existing call sites, unchanged.
		const standaloneEnrolment: EnrolmentProps = { flowStore: enrolmentStore, onDone: () => {}, qr };
		const standalonePanel: ManagementProps = {
			store: managementStore,
			mfaEnabled: true,
			onChanged: () => {},
			onReauthenticationRequired: ({ operation, methods }) => void [operation, methods]
		};
		return [ok, okPanel, a, b, c, d, e, f, g, standaloneEnrolment, standalonePanel];
	}

	export function managedOAuth(
		start: ContentParameter<'oauthStart'>,
		callback: ContentParameter<'oauthCallback'>,
		startStore: Store<OAuthStartState, OAuthStartAction>,
		callbackStore: Store<OAuthCallbackState, OAuthCallbackAction>,
		session: Session
	): unknown[] {
		const exactStart: PresentationFeatureViewProps<OAuthStartState, OAuthStartAction> = start;
		const exactCallback: PresentationFeatureViewProps<OAuthCallbackState, OAuthCallbackAction> = callback;
		const providers = [{ id: 'github', label: 'GitHub' }];
		const okStart: OAuthStartProps = { mode: 'managed', flowStore: exactStart.store, providers };
		const okCallback: OAuthCallbackProps = { mode: 'managed', flowStore: exactCallback.store };

		// @ts-expect-error — a plain Store is not the genuine presentation view.
		const a: OAuthStartProps = { mode: 'managed', flowStore: startStore, providers };
		// @ts-expect-error — a retired view may have no state, which standalone cannot accept.
		const b: OAuthStartProps = { flowStore: start.store, providers };
		// @ts-expect-error — sessionStore is never accepted in managed OAuthCallback.
		const c: OAuthCallbackProps = { mode: 'managed', flowStore: callback.store, sessionStore: session };
		// @ts-expect-error — onSuccess is never accepted in managed OAuthCallback.
		const d: OAuthCallbackProps = { mode: 'managed', flowStore: callback.store, onSuccess: () => {} };
		// @ts-expect-error — onStartOver is never accepted in managed OAuthCallback.
		const e: OAuthCallbackProps = { mode: 'managed', flowStore: callback.store, onStartOver: () => {} };
		// @ts-expect-error — onMfaRequired is never accepted in managed OAuthCallback.
		const f: OAuthCallbackProps = { mode: 'managed', flowStore: callback.store, onMfaRequired: () => {} };
		// @ts-expect-error — a plain Store is not the genuine presentation view.
		const g: OAuthCallbackProps = { mode: 'managed', flowStore: callbackStore };
		// @ts-expect-error — a retired view may have no state, which standalone cannot accept.
		const h: OAuthCallbackProps = { flowStore: callback.store, sessionStore: session, onSuccess: () => {}, onStartOver: () => {} };

		// Standalone call sites
		const standaloneStart: OAuthStartProps = { flowStore: startStore, providers };
		const standaloneCallback: OAuthCallbackProps = {
			flowStore: callbackStore,
			sessionStore: session,
			onSuccess: () => {},
			onStartOver: () => {}
		};

		return [okStart, okCallback, a, b, c, d, e, f, g, h, standaloneStart, standaloneCallback];
	}

	export function managedMagicLink(
		request: ContentParameter<'magicLinkRequest'>,
		signIn: ContentParameter<'magicLinkSignIn'>,
		requestStore: Store<MagicLinkRequestState, MagicLinkRequestAction>,
		signInStore: Store<MagicLinkSignInState, MagicLinkSignInAction>,
		session: Session
	): unknown[] {
		const exactRequest: PresentationFeatureViewProps<MagicLinkRequestState, MagicLinkRequestAction> = request;
		const exactSignIn: PresentationFeatureViewProps<MagicLinkSignInState, MagicLinkSignInAction> = signIn;
		const okRequest: MagicLinkRequestProps = { mode: 'managed', flowStore: exactRequest.store };
		const okSignIn: MagicLinkSignInProps = { mode: 'managed', flowStore: exactSignIn.store };

		// @ts-expect-error — a plain Store is not the genuine presentation view.
		const a: MagicLinkRequestProps = { mode: 'managed', flowStore: requestStore };
		// @ts-expect-error — onSent is not accepted in managed mode.
		const b: MagicLinkRequestProps = { mode: 'managed', flowStore: exactRequest.store, onSent: () => {} };
		// @ts-expect-error — a plain Store is not the genuine presentation view.
		const c: MagicLinkSignInProps = { mode: 'managed', flowStore: signInStore };
		// @ts-expect-error — sessionStore is never accepted in managed MagicLinkSignIn.
		const d: MagicLinkSignInProps = { mode: 'managed', flowStore: exactSignIn.store, sessionStore: session };
		// @ts-expect-error — onMfaRequired is never accepted in managed MagicLinkSignIn.
		const e: MagicLinkSignInProps = { mode: 'managed', flowStore: exactSignIn.store, onMfaRequired: () => {} };
		// @ts-expect-error — onRequestNewLink is never accepted in managed MagicLinkSignIn.
		const f: MagicLinkSignInProps = { mode: 'managed', flowStore: exactSignIn.store, onRequestNewLink: () => {} };
		// @ts-expect-error — onStartOver is never accepted in managed MagicLinkSignIn.
		const g: MagicLinkSignInProps = { mode: 'managed', flowStore: exactSignIn.store, onStartOver: () => {} };
		// @ts-expect-error — a retired view may have no state, which standalone cannot accept.
		const h: MagicLinkSignInProps = { flowStore: exactSignIn.store, sessionStore: session, onRequestNewLink: () => {} };

		// Standalone call sites
		const standaloneRequest: MagicLinkRequestProps = { flowStore: requestStore };
		const standaloneSignIn: MagicLinkSignInProps = {
			flowStore: signInStore,
			sessionStore: session,
			onRequestNewLink: () => {}
		};

		return [okRequest, okSignIn, a, b, c, d, e, f, g, h, standaloneRequest, standaloneSignIn];
	}

	export function managedConnectedAccounts(
		connected: ContentParameter<'connectedAccounts'>,
		account: ContentParameter<'account'>,
		oauthStart: ContentParameter<'oauthStart'>,
		connectedStore: Store<ConnectedAccountsState, ConnectedAccountsAction>,
		accountStore: Store<AccountState, AccountAction>
	): unknown[] {
		const exactConnected: PresentationFeatureViewProps<ConnectedAccountsState, ConnectedAccountsAction> = connected;
		const exactAccount: PresentationFeatureViewProps<AccountState, AccountAction> = account;
		const exactOAuth: PresentationFeatureViewProps<OAuthStartState, OAuthStartAction> = oauthStart;

		const okManaged: ConnectedAccountsProps = {
			mode: 'managed',
			store: exactConnected.store,
			accountStore: exactAccount.store,
			oauthStore: exactOAuth.store,
			onLink: (_provider) => {}
		};

		// @ts-expect-error — a plain Store is not the genuine presentation view.
		const a: ConnectedAccountsProps = { mode: 'managed', store: connectedStore };

		// @ts-expect-error — a plain Store is not accepted as managed accountStore.
		const b: ConnectedAccountsProps = { mode: 'managed', store: exactConnected.store, accountStore: accountStore };

		// @ts-expect-error — onUnlinked callback is forbidden in managed mode.
		const c: ConnectedAccountsProps = { mode: 'managed', store: exactConnected.store, onUnlinked: () => {} };

		// @ts-expect-error — onReauthenticationRequired callback is forbidden in managed mode.
		const d: ConnectedAccountsProps = { mode: 'managed', store: exactConnected.store, onReauthenticationRequired: () => {} };

		// Standalone call sites
		const standaloneOk: ConnectedAccountsProps = {
			store: connectedStore,
			accountStore: accountStore,
			onUnlinked: () => {},
			onReauthenticationRequired: () => {}
		};

		// @ts-expect-error — a retired view may have no state, which standalone cannot accept.
		const e: ConnectedAccountsProps = {
			store: exactConnected.store
		};

		return [okManaged, a, b, c, d, standaloneOk, e];
	}

	export function managedChangeEmail(
		changeEmail: ContentParameter<'changeEmail'>,
		changeEmailConfirm: ContentParameter<'changeEmailConfirm'>,
		changeEmailStore: Store<ChangeEmailState, ChangeEmailAction>,
		confirmStore: Store<ChangeEmailConfirmState, ChangeEmailConfirmAction>
	): unknown[] {
		const exactChangeEmail: PresentationFeatureViewProps<ChangeEmailState, ChangeEmailAction> = changeEmail;
		const exactConfirm: PresentationFeatureViewProps<ChangeEmailConfirmState, ChangeEmailConfirmAction> = changeEmailConfirm;

		const okRequest: ChangeEmailProps = {
			mode: 'managed',
			flowStore: exactChangeEmail.store,
			currentEmail: 'old@example.com',
			pendingEmail: 'new@example.com'
		};
		const okConfirm: ChangeEmailConfirmProps = {
			mode: 'managed',
			flowStore: exactConfirm.store,
			token: 'test-token'
		};

		// @ts-expect-error — a plain Store is not the genuine presentation view.
		const a: ChangeEmailProps = { mode: 'managed', flowStore: changeEmailStore };
		// @ts-expect-error — onChanged callback is forbidden in managed mode.
		const b: ChangeEmailProps = { mode: 'managed', flowStore: exactChangeEmail.store, onChanged: () => {} };
		// @ts-expect-error — onReauthenticationRequired callback is forbidden in managed mode.
		const c: ChangeEmailProps = { mode: 'managed', flowStore: exactChangeEmail.store, onReauthenticationRequired: () => {} };

		// @ts-expect-error — a plain Store is not the genuine presentation view.
		const d: ChangeEmailConfirmProps = { mode: 'managed', flowStore: confirmStore };
		// @ts-expect-error — onConfirmed callback is forbidden in managed mode.
		const e: ChangeEmailConfirmProps = { mode: 'managed', flowStore: exactConfirm.store, onConfirmed: () => {} };
		// @ts-expect-error — onSignIn callback is forbidden in managed mode.
		const h: ChangeEmailConfirmProps = { mode: 'managed', flowStore: exactConfirm.store, onSignIn: () => {} };

		// Standalone call sites
		const standaloneRequest: ChangeEmailProps = {
			flowStore: changeEmailStore,
			currentEmail: 'old@example.com',
			onChanged: () => {},
			onReauthenticationRequired: () => {}
		};
		const standaloneConfirm: ChangeEmailConfirmProps = {
			flowStore: confirmStore,
			token: 'test-token',
			onSignIn: () => {},
			onConfirmed: () => {}
		};

		// @ts-expect-error — standalone confirm requires onSignIn.
		const standaloneConfirmMissingSignIn: ChangeEmailConfirmProps = {
			flowStore: confirmStore,
			token: 'test-token'
		};

		// @ts-expect-error — a retired view may have no state, which standalone cannot accept.
		const f: ChangeEmailProps = { flowStore: exactChangeEmail.store };
		// @ts-expect-error — a retired view may have no state, which standalone cannot accept.
		const g: ChangeEmailConfirmProps = { flowStore: exactConfirm.store, onSignIn: () => {} };

		return [
			okRequest,
			okConfirm,
			a,
			b,
			c,
			d,
			e,
			h,
			standaloneRequest,
			standaloneConfirm,
			standaloneConfirmMissingSignIn,
			f,
			g
		];
	}

	export function passwordDelete(
		changePassword: ContentParameter<'changePassword'>,
		deleteAccount: ContentParameter<'deleteAccount'>,
		changePasswordStore: Store<ChangePasswordState, ChangePasswordAction>,
		deleteAccountStore: Store<DeleteAccountState, DeleteAccountAction>,
		session: Session
	): unknown[] {
		const exactChangePassword: PresentationFeatureViewProps<ChangePasswordState, ChangePasswordAction> = changePassword;
		const exactDeleteAccount: PresentationFeatureViewProps<DeleteAccountState, DeleteAccountAction> = deleteAccount;

		const okPassword: ChangePasswordProps = {
			mode: 'managed',
			flowStore: exactChangePassword.store,
			hasPassword: true
		};
		const okDelete: DeleteAccountProps = {
			mode: 'managed',
			store: exactDeleteAccount.store,
			email: 'ada@example.com'
		};

		// @ts-expect-error — a plain Store is not the genuine presentation view.
		const a: ChangePasswordProps = { mode: 'managed', flowStore: changePasswordStore };
		// @ts-expect-error — sessionStore is forbidden in managed mode.
		const b: ChangePasswordProps = { mode: 'managed', flowStore: exactChangePassword.store, sessionStore: session };
		// @ts-expect-error — onChanged callback is forbidden in managed mode.
		const c: ChangePasswordProps = { mode: 'managed', flowStore: exactChangePassword.store, onChanged: () => {} };
		// @ts-expect-error — onReauthenticationRequired callback is forbidden in managed mode.
		const d: ChangePasswordProps = { mode: 'managed', flowStore: exactChangePassword.store, onReauthenticationRequired: () => {} };

		// @ts-expect-error — a plain Store is not the genuine presentation view.
		const e: DeleteAccountProps = { mode: 'managed', store: deleteAccountStore };
		// @ts-expect-error — sessionStore is forbidden in managed mode.
		const f: DeleteAccountProps = { mode: 'managed', store: exactDeleteAccount.store, sessionStore: session };
		// @ts-expect-error — onDeleted callback is forbidden in managed mode.
		const g: DeleteAccountProps = { mode: 'managed', store: exactDeleteAccount.store, onDeleted: () => {} };
		// @ts-expect-error — onReauthenticationRequired callback is forbidden in managed mode.
		const h: DeleteAccountProps = { mode: 'managed', store: exactDeleteAccount.store, onReauthenticationRequired: () => {} };

		// Standalone call sites
		const standalonePassword: ChangePasswordProps = {
			flowStore: changePasswordStore,
			sessionStore: session,
			onChanged: () => {},
			onReauthenticationRequired: () => {}
		};
		const standaloneDelete: DeleteAccountProps = {
			store: deleteAccountStore,
			sessionStore: session,
			onDeleted: () => {},
			onReauthenticationRequired: () => {}
		};

		// @ts-expect-error — standalone password requires sessionStore.
		const standalonePasswordMissingSession: ChangePasswordProps = {
			flowStore: changePasswordStore
		};
		// @ts-expect-error — standalone delete requires sessionStore.
		const standaloneDeleteMissingSession: DeleteAccountProps = {
			store: deleteAccountStore
		};

		// @ts-expect-error — a retired view may have no state, which standalone cannot accept.
		const i: ChangePasswordProps = { flowStore: exactChangePassword.store, sessionStore: session };
		// @ts-expect-error — a retired view may have no state, which standalone cannot accept.
		const j: DeleteAccountProps = { store: exactDeleteAccount.store, sessionStore: session };

		return [
			okPassword,
			okDelete,
			a,
			b,
			c,
			d,
			e,
			f,
			g,
			h,
			standalonePassword,
			standaloneDelete,
			standalonePasswordMissingSession,
			standaloneDeleteMissingSession,
			i,
			j
		];
	}

	export function sessionRefreshProps(
		sessionRefresh: ContentParameter<'sessionRefresh'>,
		sessionRefreshStore: Store<SessionRefreshState, SessionRefreshAction>,
		session: { readonly state: SessionState; dispatch(action: SessionAction): void },
		endedSnippet: Snippet
	): unknown[] {
		const exact: PresentationFeatureViewProps<SessionRefreshState, SessionRefreshAction> = sessionRefresh;

		const okStore: SessionRefreshProps = {
			mode: 'managed',
			store: exact.store
		};
		const okFlowStore: SessionRefreshProps = {
			mode: 'managed',
			flowStore: exact.store,
			ended: endedSnippet
		};

		// @ts-expect-error — a plain Store is not the genuine presentation view.
		const a: SessionRefreshProps = { mode: 'managed', store: sessionRefreshStore };
		// @ts-expect-error — a plain Store is not the genuine presentation view.
		const b: SessionRefreshProps = { mode: 'managed', flowStore: sessionRefreshStore };
		// @ts-expect-error — sessionStore is forbidden in managed mode.
		const c: SessionRefreshProps = { mode: 'managed', store: exact.store, sessionStore: session };
		// @ts-expect-error — sessionStore is forbidden in managed mode.
		const d: SessionRefreshProps = { mode: 'managed', flowStore: exact.store, sessionStore: session };

		// Standalone call sites
		const standaloneOk: SessionRefreshProps = {
			flowStore: sessionRefreshStore,
			sessionStore: session,
			ended: endedSnippet
		};

		// @ts-expect-error — standalone requires sessionStore.
		const standaloneMissingSession: SessionRefreshProps = {
			flowStore: sessionRefreshStore
		};

		// @ts-expect-error — a retired view may have no state, which standalone cannot accept.
		const e: SessionRefreshProps = { flowStore: exact.store, sessionStore: session };

		return [
			okStore,
			okFlowStore,
			a,
			b,
			c,
			d,
			standaloneOk,
			standaloneMissingSession,
			e
		];
	}

	type AuthGuardProps = ComponentProps<typeof AuthGuard>;
	type RoleGateProps = ComponentProps<typeof RoleGate>;
	type PasswordInputProps = ComponentProps<typeof PasswordInput>;
	type PasswordCriteriaProps = ComponentProps<typeof PasswordCriteria>;
	type OneTimeCodeInputProps = ComponentProps<typeof OneTimeCodeInput>;

	export function gatingAndInputProps(
		sessionStore: { readonly state: SessionState }
	): unknown[] {
		const validGuard: AuthGuardProps = {
			store: sessionStore
		};
		const validRoleGate: RoleGateProps = {
			store: sessionStore,
			roles: ['admin']
		};
		const validPasswordInput: PasswordInputProps = {
			id: 'test-pass',
			value: 'secret',
			oninput: () => {}
		};
		const validPasswordCriteria: PasswordCriteriaProps = {
			password: 'secret'
		};
		const validOtp: OneTimeCodeInputProps = {
			id: 'otp-id',
			name: 'code',
			value: '123456',
			oninput: () => {}
		};

		// @ts-expect-error — missing store
		const illegalGuardMissingStore: AuthGuardProps = {};
		// @ts-expect-error — missing roles
		const illegalRoleGateMissingRoles: RoleGateProps = { store: sessionStore };
		// @ts-expect-error — missing oninput
		const illegalPasswordInputMissingOnInput: PasswordInputProps = { id: 'test-pass', value: 'secret' };
		// @ts-expect-error — missing password
		const illegalPasswordCriteriaMissingPassword: PasswordCriteriaProps = {};
		// @ts-expect-error — missing name
		const illegalOtpMissingName: OneTimeCodeInputProps = { id: 'otp-id', value: '123', oninput: () => {} };

		return [
			validGuard,
			validRoleGate,
			validPasswordInput,
			validPasswordCriteria,
			validOtp,
			illegalGuardMissingStore,
			illegalRoleGateMissingRoles,
			illegalPasswordInputMissingOnInput,
			illegalPasswordCriteriaMissingPassword,
			illegalOtpMissingName
		];
	}
</script>
