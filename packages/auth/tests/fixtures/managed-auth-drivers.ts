/**
 * Drivers for the managed auth shell: dependencies whose requests stay in
 * flight until the test settles them, and the input a user would type.
 *
 * Input goes through `authShell.bind(...)` — the managed child view a
 * component would receive — so it carries the child owner, exactly as a
 * mounted form's dispatches would. Nothing is mounted.
 */

import { vi } from 'vitest';
import type { Store } from '@composable-svelte/core';
import type { PresentationView } from '@composable-svelte/core/application';

import type { LoginCredentials, MfaMethod, SignupCredentials, SignupOutcome, MfaEnrolmentStart, MfaEnrolmentResult, OAuthStart, AccountSnapshot, SessionLifetime } from '../../src/lib/deps.js';
import type { SignupDependencies } from '../../src/lib/flows/index.js';
import {
	createMemoryPendingOAuthStorage,
	createPendingOAuthStorage
} from '../../src/lib/flows/index.js';
import type {
	ForgotPasswordDependencies,
	ResetPasswordDependencies,
	EmailVerificationDependencies,
	MfaEnrolmentDependencies,
	MfaManagementDependencies,
	MagicLinkRequestDependencies,
	MagicLinkSignInDependencies,
	AccountDependencies,
	ConnectedAccountsDependencies,
	ChangeEmailDependencies,
	ChangeEmailConfirmDependencies,
	ChangePasswordDependencies,
	DeleteAccountDependencies,
	ChangePasswordState,
	ChangePasswordAction,
	DeleteAccountState,
	DeleteAccountAction,
	SessionRefreshState,
	SessionRefreshAction,
	PendingOAuthStorage
} from '../../src/lib/flows/index.js';
import type { SessionSnapshot } from '../../src/lib/subject/index.js';
import {
	authShell,
	loginSlot,
	mfaSlot,
	type AuthShellAction,
	type AuthShellDependencies,
	type AuthShellState
} from './managed-auth-shell.js';

export type AuthShellStore = Store<AuthShellState, AuthShellAction>;

interface Pending<T> {
	readonly promise: Promise<T>;
	resolve(value: T): void;
	reject(reason: unknown): void;
}

function pending<T>(): Pending<T> {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

export interface LoginRequest extends Pending<SessionSnapshot> {
	readonly credentials: LoginCredentials;
	readonly signal: AbortSignal | undefined;
}
export interface ChallengeRequest extends Pending<SessionSnapshot> {
	readonly challengeId: string;
	readonly code: string;
	readonly method: MfaMethod;
	readonly signal: AbortSignal | undefined;
}
export interface SignupRequest extends Pending<SignupOutcome> {
	readonly credentials: SignupCredentials;
	readonly signal: AbortSignal | undefined;
}
export interface LogoutRequest extends Pending<void> {
	readonly signal: AbortSignal | undefined;
}
export interface ForgotPasswordRequest extends Pending<void> {
	readonly email: string;
	readonly signal: AbortSignal | undefined;
}
export interface ResetPasswordRequest extends Pending<SessionSnapshot | null> {
	readonly token: string;
	readonly password: string;
	readonly signal: AbortSignal | undefined;
}
export interface VerifyEmailRequest extends Pending<SessionSnapshot | null> {
	readonly token: string;
	readonly signal: AbortSignal | undefined;
}
export interface ResendVerificationRequest extends Pending<void> {
	readonly email: string;
	readonly signal: AbortSignal | undefined;
}
export interface BeginEnrolmentRequest extends Pending<MfaEnrolmentStart> {
	readonly signal: AbortSignal | undefined;
}
export interface ConfirmEnrolmentRequest extends Pending<MfaEnrolmentResult> {
	readonly enrolmentId: string;
	readonly code: string;
	readonly signal: AbortSignal | undefined;
}
export interface DisableMfaRequest extends Pending<void> {
	readonly signal: AbortSignal | undefined;
}
export interface RegenerateCodesRequest extends Pending<MfaEnrolmentResult> {
	readonly signal: AbortSignal | undefined;
}
export interface BeginOAuthRequest extends Pending<OAuthStart> {
	readonly provider: string;
	readonly signal: AbortSignal | undefined;
}
export interface CompleteOAuthRequest extends Pending<SessionSnapshot> {
	readonly provider: string;
	readonly code: string;
	readonly state: string;
	readonly signal: AbortSignal | undefined;
}
export interface LinkOAuthRequest extends Pending<void> {
	readonly provider: string;
	readonly code: string;
	readonly state: string;
	readonly signal: AbortSignal | undefined;
}
export interface RequestMagicLinkRequest extends Pending<void> {
	readonly email: string;
	readonly signal: AbortSignal | undefined;
}
export interface SignInWithMagicLinkRequest extends Pending<SessionSnapshot> {
	readonly token: string;
	readonly signal: AbortSignal | undefined;
}
export interface FetchAccountRequest extends Pending<AccountSnapshot> {
	readonly signal: AbortSignal | undefined;
}
export interface UnlinkOAuthRequest extends Pending<void> {
	readonly provider: string;
	readonly signal: AbortSignal | undefined;
}
export interface RequestEmailChangeRequest extends Pending<void> {
	readonly newEmail: string;
	readonly signal: AbortSignal | undefined;
}
export interface ResendEmailChangeRequest extends Pending<void> {
	readonly signal: AbortSignal | undefined;
}
export interface ConfirmEmailChangeRequest extends Pending<string> {
	readonly token: string;
	readonly signal: AbortSignal | undefined;
}
export interface ChangePasswordRequest extends Pending<SessionSnapshot | null> {
	readonly password: string;
	readonly signal: AbortSignal | undefined;
}
export interface DeleteAccountRequest extends Pending<void> {
	readonly signal: AbortSignal | undefined;
}
export interface SessionRefreshRequest extends Pending<SessionLifetime> {
	readonly signal: AbortSignal | undefined;
}

export function controlledAuthDeps() {
	const logins: LoginRequest[] = [];
	const challenges: ChallengeRequest[] = [];
	const logouts: LogoutRequest[] = [];
	const signups: SignupRequest[] = [];
	const forgotPasswords: ForgotPasswordRequest[] = [];
	const resetPasswords: ResetPasswordRequest[] = [];
	const verifications: VerifyEmailRequest[] = [];
	const resends: ResendVerificationRequest[] = [];
	const beginEnrolments: BeginEnrolmentRequest[] = [];
	const confirmEnrolments: ConfirmEnrolmentRequest[] = [];
	const disableMfas: DisableMfaRequest[] = [];
	const regenerateCodes: RegenerateCodesRequest[] = [];
	const beginOAuths: BeginOAuthRequest[] = [];
	const completeOAuths: CompleteOAuthRequest[] = [];
	const linkOAuths: LinkOAuthRequest[] = [];
	const requestMagicLinks: RequestMagicLinkRequest[] = [];
	const signInWithMagicLinks: SignInWithMagicLinkRequest[] = [];
	const fetchAccounts: FetchAccountRequest[] = [];
	const unlinkOAuths: UnlinkOAuthRequest[] = [];
	const requestEmailChanges: RequestEmailChangeRequest[] = [];
	const resendEmailChanges: ResendEmailChangeRequest[] = [];
	const confirmEmailChanges: ConfirmEmailChangeRequest[] = [];
	const changePasswords: ChangePasswordRequest[] = [];
	const deleteAccounts: DeleteAccountRequest[] = [];
	const sessionRefreshes: SessionRefreshRequest[] = [];
	const redirects: string[] = [];
	const pendingOAuth = createMemoryPendingOAuthStorage();
	// `signup` is for `createAuthFeature`; the shell ignores it.
	const deps: AuthShellDependencies &
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
			refreshSession: (signal?: AbortSignal | undefined) => Promise<SessionLifetime>;
			beginOAuth: (provider: string, signal?: AbortSignal | undefined) => Promise<OAuthStart>;
			completeOAuth: (provider: string, code: string, state: string, signal?: AbortSignal | undefined) => Promise<SessionSnapshot>;
			linkOAuthProvider: (provider: string, code: string, state: string, signal?: AbortSignal | undefined) => Promise<void>;
			redirect: (url: string) => void;
			pendingOAuth: PendingOAuthStorage;
		} = {
		login: (credentials, signal) => {
			const request = { ...pending<SessionSnapshot>(), credentials, signal };
			logins.push(request);
			return request.promise;
		},
		verifyMfaChallenge: (challengeId, code, method, signal) => {
			const request = { ...pending<SessionSnapshot>(), challengeId, code, method, signal };
			challenges.push(request);
			return request.promise;
		},
		fetchLogout: (signal) => {
			const request = { ...pending<void>(), signal };
			logouts.push(request);
			return request.promise;
		},
		signup: (credentials, signal) => {
			const request = { ...pending<SignupOutcome>(), credentials, signal };
			signups.push(request);
			return request.promise;
		},
		requestPasswordReset: (email, signal) => {
			const request = { ...pending<void>(), email, signal };
			forgotPasswords.push(request);
			return request.promise;
		},
		resetPassword: (token, password, signal) => {
			const request = { ...pending<SessionSnapshot | null>(), token, password, signal };
			resetPasswords.push(request);
			return request.promise;
		},
		verifyEmail: (token, signal) => {
			const request = { ...pending<SessionSnapshot | null>(), token, signal };
			verifications.push(request);
			return request.promise;
		},
		resendVerification: (email, signal) => {
			const request = { ...pending<void>(), email, signal };
			resends.push(request);
			return request.promise;
		},
		beginMfaEnrolment: (signal) => {
			const request = { ...pending<MfaEnrolmentStart>(), signal };
			beginEnrolments.push(request);
			return request.promise;
		},
		confirmMfaEnrolment: (enrolmentId, code, signal) => {
			const request = { ...pending<MfaEnrolmentResult>(), enrolmentId, code, signal };
			confirmEnrolments.push(request);
			return request.promise;
		},
		disableMfa: (signal) => {
			const request = { ...pending<void>(), signal };
			disableMfas.push(request);
			return request.promise;
		},
		regenerateRecoveryCodes: (signal) => {
			const request = { ...pending<MfaEnrolmentResult>(), signal };
			regenerateCodes.push(request);
			return request.promise;
		},
		beginOAuth: (provider, signal) => {
			const request = { ...pending<OAuthStart>(), provider, signal };
			beginOAuths.push(request);
			return request.promise;
		},
		completeOAuth: (provider, code, state, signal) => {
			const request = { ...pending<SessionSnapshot>(), provider, code, state, signal };
			completeOAuths.push(request);
			return request.promise;
		},
		linkOAuthProvider: (provider, code, state, signal) => {
			const request = { ...pending<void>(), provider, code, state, signal };
			linkOAuths.push(request);
			return request.promise;
		},
		requestMagicLink: (email, signal) => {
			const request = { ...pending<void>(), email, signal };
			requestMagicLinks.push(request);
			return request.promise;
		},
		signInWithMagicLink: (token, signal) => {
			const request = { ...pending<SessionSnapshot>(), token, signal };
			signInWithMagicLinks.push(request);
			return request.promise;
		},
		fetchAccount: (signal) => {
			const request = { ...pending<AccountSnapshot>(), signal };
			fetchAccounts.push(request);
			return request.promise;
		},
		unlinkOAuthProvider: (provider, signal) => {
			const request = { ...pending<void>(), provider, signal };
			unlinkOAuths.push(request);
			return request.promise;
		},
		requestEmailChange: (newEmail, signal) => {
			const request = { ...pending<void>(), newEmail, signal };
			requestEmailChanges.push(request);
			return request.promise;
		},
		resendEmailChange: (signal) => {
			const request = { ...pending<void>(), signal };
			resendEmailChanges.push(request);
			return request.promise;
		},
		confirmEmailChange: (token, signal) => {
			const request = { ...pending<string>(), token, signal };
			confirmEmailChanges.push(request);
			return request.promise;
		},
		changePassword: (password, signal) => {
			const request = { ...pending<SessionSnapshot | null>(), password, signal };
			changePasswords.push(request);
			return request.promise;
		},
		deleteAccount: (signal) => {
			const request = { ...pending<void>(), signal };
			deleteAccounts.push(request);
			return request.promise;
		},
		refreshSession: (signal) => {
			const request = { ...pending<SessionLifetime>(), signal };
			sessionRefreshes.push(request);
			return request.promise;
		},
		redirect: (url: string) => {
			redirects.push(url);
		},
		pendingOAuth,
		fetchSession: async (signal) => {
			if (customFetchSession) return customFetchSession(signal);
			return null;
		},
		fetchLogin: async () => {
			throw new Error('seeded login is not part of this proof');
		}
	};
	let customFetchSession: ((signal?: AbortSignal) => Promise<SessionSnapshot | null>) | null = null;
	return {
		deps,
		logins,
		challenges,
		logouts,
		signups,
		forgotPasswords,
		resetPasswords,
		verifications,
		resends,
		beginEnrolments,
		confirmEnrolments,
		disableMfas,
		regenerateCodes,
		beginOAuths,
		completeOAuths,
		linkOAuths,
		requestMagicLinks,
		signInWithMagicLinks,
		fetchAccounts,
		unlinkOAuths,
		requestEmailChanges,
		resendEmailChanges,
		confirmEmailChanges,
		changePasswords,
		deleteAccounts,
		sessionRefreshes,
		setFetchSession: (fn: (signal?: AbortSignal) => Promise<SessionSnapshot | null>) => {
			customFetchSession = fn;
		},
		waitForRefresh: async () => {
			await vi.waitFor(() => {
				if (sessionRefreshes.length === 0) throw new Error('no refresh requested yet');
			});
			return sessionRefreshes[sessionRefreshes.length - 1]!;
		},
		redirects,
		pendingOAuth
	};
}

export function snapshot(subjectId: string, displayName: string): SessionSnapshot {
	return { subject_id: subjectId, display_name: displayName, roles: ['member'] };
}

/** Let effects, validation and settled promises drain. */
export async function settle(): Promise<void> {
	for (let turn = 0; turn < 4; turn++) await new Promise<void>((done) => setTimeout(done, 0));
}

/** Type and submit credentials into the live login slot, then wait for the request. */
export async function submitLogin(
	store: AuthShellStore,
	requests: readonly LoginRequest[],
	email = 'ada@example.com',
	password = 'correct-horse'
): Promise<LoginRequest> {
	const view = authShell.bind(store, loginSlot);
	if (view === undefined) throw new Error('no live login flow');
	const before = requests.length;
	view.dispatch({ type: 'form', action: { type: 'fieldChanged', field: 'email', value: email } });
	view.dispatch({ type: 'form', action: { type: 'fieldChanged', field: 'password', value: password } });
	view.dispatch({ type: 'form', action: { type: 'submitTriggered' } });
	await vi.waitFor(() => {
		if (requests.length !== before + 1) throw new Error('login request not started');
	});
	return requests[before]!;
}

/** Type and submit a code into the live MFA slot, then wait for the request. */
export async function submitCode(
	store: AuthShellStore,
	requests: readonly ChallengeRequest[],
	code: string
): Promise<ChallengeRequest> {
	const view = authShell.bind(store, mfaSlot);
	if (view === undefined) throw new Error('no live MFA flow');
	const before = requests.length;
	// The flow stamps its form generation on its own effects; user input from
	// the current form carries the current one.
	const generation = view.state?.formGeneration ?? 0;
	view.dispatch({ type: 'form', generation, action: { type: 'fieldChanged', field: 'code', value: code } });
	view.dispatch({ type: 'form', generation, action: { type: 'submitTriggered' } });
	await vi.waitFor(() => {
		if (requests.length !== before + 1) throw new Error('MFA request not started');
	});
	return requests[before]!;
}

/** Every action the root reduced, in order. Dropped feedback never appears here. */
export function recordActions(store: AuthShellStore): AuthShellAction[] {
	const seen: AuthShellAction[] = [];
	store.subscribeToActions?.((action) => {
		seen.push(action);
	});
	return seen;
}

/** Child results addressed to a slot, as the parent core would see them. */
export function presented(actions: readonly AuthShellAction[], slot: 'login' | 'mfa', type: string) {
	return actions.filter(
		(action) =>
			action.type === slot &&
			action.action.type === 'presented' &&
			action.action.action.type === type
	);
}

/** Type and submit into the live change-password slot, then wait for the request. */
export async function submitChangePassword(
	view: PresentationView<ChangePasswordState, ChangePasswordAction>,
	requests: readonly ChangePasswordRequest[],
	password = 'new-password-123'
): Promise<ChangePasswordRequest> {
	const before = requests.length;
	view.dispatch({ type: 'form', action: { type: 'fieldChanged', field: 'password', value: password } });
	view.dispatch({ type: 'form', action: { type: 'fieldChanged', field: 'confirmPassword', value: password } });
	view.dispatch({ type: 'form', action: { type: 'submitTriggered' } });
	await vi.waitFor(() => {
		if (requests.length !== before + 1) throw new Error('changePassword request not started');
	});
	return requests[before]!;
}

/** Request deletion from the live delete-account slot, moving to confirming. */
export function requestDeletion(
	view: PresentationView<DeleteAccountState, DeleteAccountAction>
): void {
	view.dispatch({ type: 'confirmationRequested' });
}

/** Confirm deletion from the confirming state, then wait for the request. */
export async function confirmDeletion(
	view: PresentationView<DeleteAccountState, DeleteAccountAction>,
	requests: readonly DeleteAccountRequest[]
): Promise<DeleteAccountRequest> {
	const before = requests.length;
	view.dispatch({ type: 'deletionRequested' });
	await vi.waitFor(() => {
		if (requests.length !== before + 1) throw new Error('deleteAccount request not started');
	});
	return requests[before]!;
}

/** Request a session refresh directly from the view, then wait for the request. */
export async function submitRefresh(
	view: PresentationView<SessionRefreshState, SessionRefreshAction>,
	requests: readonly SessionRefreshRequest[]
): Promise<SessionRefreshRequest> {
	const before = requests.length;
	view.dispatch({ type: 'refreshRequested' });
	await vi.waitFor(() => {
		if (requests.length !== before + 1) throw new Error('refreshSession request not started');
	});
	return requests[before]!;
}
