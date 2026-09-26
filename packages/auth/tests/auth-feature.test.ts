/**
 * `createAuthFeature`: the package-owned managed auth feature.
 *
 * Headless throughout — nothing is mounted. Input goes through
 * `composition.bind(store, slot)`, the managed view a component would receive,
 * so it carries the child owner exactly as a mounted form's dispatches would.
 * Requests stay pending until a test settles them (`controlledAuthDeps`).
 *
 * Every "never reduced" assertion has a positive control in the same test: the
 * same action shape recorded from a live owner, so an empty list means dropped
 * rather than never observable.
 */

import { describe, it, expect, expectTypeOf, afterEach, vi } from 'vitest';
import { createStore, Effect, type PresentationAction, type Reducer, type Store, type Clock } from '@composable-svelte/core';
import {
	ManagedIntegrationBuilder,
	nestedSlot,
	optionalSlot,
	type ManagedComposition,
	type PresentationView,
	type SlotHandle,
	type ViewDeclarations
} from '@composable-svelte/core/application';

import * as root from '../src/lib/index.js';
import {
	createAuthFeature,
	type AuthFeature,
	type AuthFeatureAction,
	type AuthFeatureCatalog,
	type AuthFeatureDependencies,
	type AuthFeatureState,
	type AuthHandoff
} from '../src/lib/application/index.js';
import type { AuthDependencies } from '../src/lib/deps.js';
import {
	createInitialLoginState,
	createInitialMfaChallengeState,
	createInitialSignupState,
	createInitialForgotPasswordState,
	createInitialResetPasswordState,
	createInitialEmailVerificationState,
	mfaChallengeReducer,
	signupReducer,
	type LoginAction,
	type LoginDependencies,
	type LoginState,
	type MfaChallengeAction,
	type MfaChallengeDependencies,
	type MfaChallengeState,
	type SignupAction,
	type SignupDependencies,
	type SignupState,
	type ForgotPasswordAction,
	type ForgotPasswordDependencies,
	type ForgotPasswordState,
	type ResetPasswordAction,
	type ResetPasswordDependencies,
	type ResetPasswordState,
	type EmailVerificationAction,
	type EmailVerificationDependencies,
	type EmailVerificationState,
	type MfaEnrolmentAction,
	type MfaEnrolmentDependencies,
	type MfaEnrolmentState,
	type MfaManagementAction,
	type MfaManagementDependencies,
	type MfaManagementState,
	type OAuthStartAction,
	type OAuthStartState,
	type OAuthCallbackAction,
	type OAuthCallbackState,
	type MagicLinkRequestAction,
	type MagicLinkRequestDependencies,
	type MagicLinkRequestState,
	type MagicLinkSignInAction,
	type MagicLinkSignInDependencies,
	type MagicLinkSignInState,
	type AccountAction,
	type AccountDependencies,
	type AccountState,
	type ConnectedAccountsAction,
	type ConnectedAccountsDependencies,
	type ConnectedAccountsState,
	type ChangeEmailAction,
	type ChangeEmailDependencies,
	type ChangeEmailState,
	type ChangeEmailConfirmAction,
	type ChangeEmailConfirmDependencies,
	type ChangeEmailConfirmState,
	type ChangePasswordAction,
	type ChangePasswordDependencies,
	type ChangePasswordState,
	type DeleteAccountAction,
	type DeleteAccountDependencies,
	type DeleteAccountState,
	type SessionRefreshAction,
	type SessionRefreshState,
	type PendingOAuthStorage,
	type Redirect
} from '../src/lib/flows/index.js';
import { decideSessionEstablished } from '../src/lib/session/establish.js';
import {
	createInitialSessionState,
	type SessionDependencies,
	type SessionState,
	type SessionStatus
} from '../src/lib/session/index.js';
import { subjectFromSession } from '../src/lib/subject/index.js';
import {
	controlledAuthDeps,
	settle,
	snapshot,
	type ChallengeRequest,
	type LoginRequest,
	type SignupRequest,
	type ForgotPasswordRequest,
	type ResetPasswordRequest,
	type RequestMagicLinkRequest,
	type SignInWithMagicLinkRequest
} from './fixtures/managed-auth-drivers.js';

const ada = snapshot('aaaaaaaa-0000-0000-0000-000000000001', 'Ada');
const bob = snapshot('bbbbbbbb-0000-0000-0000-000000000002', 'Bob');
const mallory = snapshot('dddddddd-0000-0000-0000-000000000004', 'Mallory');
const mfaRequired = (challengeId: string) => ({
	code: 'mfa_required',
	message: 'Enter your second factor.',
	challengeId,
	methods: ['totp']
});

type AuthStore = Store<AuthFeatureState, AuthFeatureAction>;

const stores: Array<{ destroy(): void }> = [];
afterEach(() => {
	for (const store of stores.splice(0)) store.destroy();
});

function createAuthStore(
	auth: AuthFeature,
	deps: AuthFeatureDependencies,
	initial: Partial<AuthFeatureState> = {}
): AuthStore {
	const store = createStore({
		initialState: { ...auth.initialState(), ...initial },
		reducer: auth.composition.reducer,
		execution: auth.composition.execution,
		dependencies: deps
	});
	stores.push(store);
	return store;
}

function signedInAs(who: typeof ada, status: SessionStatus = 'authenticated'): SessionState {
	return { ...createInitialSessionState(), status, subject: subjectFromSession(who) };
}

function subjectId(state: AuthFeatureState): string | null {
	return state.session.subject.kind === 'authenticated' ? state.session.subject.id : null;
}

interface Observed {
	readonly action: AuthFeatureAction;
	readonly handoff: AuthHandoff | null;
}

/** Every action the store reduced, with the `handoff` its reduction left behind. */
function observe(store: AuthStore): Observed[] {
	const seen: Observed[] = [];
	store.subscribeToActions?.((action) => {
		seen.push({ action, handoff: store.state.handoff });
	});
	return seen;
}

function presented(
	seen: readonly Observed[],
	slot:
		| 'login'
		| 'mfa'
		| 'signup'
		| 'forgotPassword'
		| 'resetPassword'
		| 'emailVerification'
		| 'magicLinkRequest'
		| 'magicLinkSignIn',
	type: string
): Observed[] {
	return seen.filter(
		({ action }) =>
			action.type === slot && action.action.type === 'presented' && action.action.action.type === type
	);
}

function loginView(auth: AuthFeature, store: AuthStore): PresentationView<LoginState, LoginAction> {
	const view = auth.composition.bind(store, auth.loginSlot);
	if (view === undefined) throw new Error('no live login flow');
	return view;
}

function mfaView(auth: AuthFeature, store: AuthStore): PresentationView<MfaChallengeState, MfaChallengeAction> {
	const view = auth.composition.bind(store, auth.mfaSlot);
	if (view === undefined) throw new Error('no live MFA flow');
	return view;
}

function signupView(auth: AuthFeature, store: AuthStore): PresentationView<SignupState, SignupAction> {
	const view = auth.composition.bind(store, auth.signupSlot);
	if (view === undefined) throw new Error('no live signup flow');
	return view;
}

function forgotView(auth: AuthFeature, store: AuthStore): PresentationView<ForgotPasswordState, ForgotPasswordAction> {
	const view = auth.composition.bind(store, auth.forgotPasswordSlot);
	if (view === undefined) throw new Error('no live forgot-password flow');
	return view;
}

function resetView(auth: AuthFeature, store: AuthStore): PresentationView<ResetPasswordState, ResetPasswordAction> {
	const view = auth.composition.bind(store, auth.resetPasswordSlot);
	if (view === undefined) throw new Error('no live reset-password flow');
	return view;
}

function verificationView(auth: AuthFeature, store: AuthStore): PresentationView<EmailVerificationState, EmailVerificationAction> {
	const view = auth.composition.bind(store, auth.emailVerificationSlot);
	if (view === undefined) throw new Error('no live email-verification flow');
	return view;
}

function magicRequestView(
	auth: AuthFeature,
	store: AuthStore
): PresentationView<MagicLinkRequestState, MagicLinkRequestAction> {
	const view = auth.composition.bind(store, auth.magicLinkRequestSlot);
	if (view === undefined) throw new Error('no live magic-link-request flow');
	return view;
}

function magicSignInView(
	auth: AuthFeature,
	store: AuthStore
): PresentationView<MagicLinkSignInState, MagicLinkSignInAction> {
	const view = auth.composition.bind(store, auth.magicLinkSignInSlot);
	if (view === undefined) throw new Error('no live magic-link-signin flow');
	return view;
}

async function submitMagicRequest(
	view: PresentationView<MagicLinkRequestState, MagicLinkRequestAction>,
	requests: readonly RequestMagicLinkRequest[],
	email = 'grace@example.com'
) {
	const before = requests.length;
	view.dispatch({ type: 'form', action: { type: 'fieldChanged', field: 'email', value: email } });
	view.dispatch({ type: 'form', action: { type: 'submitTriggered' } });
	await vi.waitFor(() => expect(requests).toHaveLength(before + 1));
	return requests[before]!;
}

async function submitMagicSignIn(
	view: PresentationView<MagicLinkSignInState, MagicLinkSignInAction>,
	requests: readonly SignInWithMagicLinkRequest[]
) {
	const before = requests.length;
	view.dispatch({ type: 'signInRequested' });
	await vi.waitFor(() => expect(requests).toHaveLength(before + 1));
	return requests[before]!;
}

async function submitForgot(view: PresentationView<ForgotPasswordState, ForgotPasswordAction>, requests: readonly ForgotPasswordRequest[], email = 'grace@example.com') {
	const before = requests.length;
	view.dispatch({ type: 'form', action: { type: 'fieldChanged', field: 'email', value: email } });
	view.dispatch({ type: 'form', action: { type: 'submitTriggered' } });
	await vi.waitFor(() => expect(requests).toHaveLength(before + 1));
	return requests[before]!;
}

async function submitReset(view: PresentationView<ResetPasswordState, ResetPasswordAction>, requests: readonly ResetPasswordRequest[]) {
	const before = requests.length;
	for (const field of ['password', 'confirmPassword'] as const) {
		view.dispatch({ type: 'form', action: { type: 'fieldChanged', field, value: 'correct-horse-battery-staple' } });
	}
	view.dispatch({ type: 'form', action: { type: 'submitTriggered' } });
	await vi.waitFor(() => expect(requests).toHaveLength(before + 1));
	return requests[before]!;
}

async function submitSignup(
	view: { dispatch(action: SignupAction): void },
	requests: readonly SignupRequest[],
	email = 'grace@example.com'
): Promise<SignupRequest> {
	const before = requests.length;
	const password = 'correct-horse-battery-staple';
	for (const [field, value] of [['email', email], ['password', password], ['confirmPassword', password]] as const) {
		view.dispatch({ type: 'form', action: { type: 'fieldChanged', field, value } });
	}
	view.dispatch({ type: 'form', action: { type: 'submitTriggered' } });
	await vi.waitFor(() => {
		if (requests.length !== before + 1) throw new Error('signup request not started');
	});
	return requests[before]!;
}

async function submitCredentials(
	view: { dispatch(action: LoginAction): void },
	requests: readonly LoginRequest[],
	email = 'ada@example.com'
): Promise<LoginRequest> {
	const before = requests.length;
	view.dispatch({ type: 'form', action: { type: 'fieldChanged', field: 'email', value: email } });
	view.dispatch({ type: 'form', action: { type: 'fieldChanged', field: 'password', value: 'correct-horse' } });
	view.dispatch({ type: 'form', action: { type: 'submitTriggered' } });
	await vi.waitFor(() => {
		if (requests.length !== before + 1) throw new Error('login request not started');
	});
	return requests[before]!;
}

async function submitCode(
	view: PresentationView<MfaChallengeState, MfaChallengeAction>,
	requests: readonly ChallengeRequest[],
	code: string
): Promise<ChallengeRequest> {
	const before = requests.length;
	const generation = view.state?.formGeneration ?? 0;
	view.dispatch({ type: 'form', generation, action: { type: 'fieldChanged', field: 'code', value: code } });
	view.dispatch({ type: 'form', generation, action: { type: 'submitTriggered' } });
	await vi.waitFor(() => {
		if (requests.length !== before + 1) throw new Error('MFA request not started');
	});
	return requests[before]!;
}

describe('the session-established decision', () => {
	const statuses: SessionStatus[] = ['unresolved', 'resolving', 'authenticated', 'anonymous', 'loggingIn', 'loginFailed'];

	it.each(statuses)('accepts a handed-over session while %s', (status) => {
		const state = { ...signedInAs(mallory), status, epoch: 7 };
		const decision = decideSessionEstablished(state, { ...bob, expires_at: '2030-01-01T00:00:00Z' });
		expect(decision.kind).toBe('accepted');
		expect(decision.state).toEqual({
			status: 'authenticated',
			subject: subjectFromSession(bob),
			error: null,
			epoch: 7,
			expiresAt: '2030-01-01T00:00:00Z'
		});
	});

	it('refuses while loggingOut, returning the state itself and the reason', () => {
		const state = signedInAs(ada, 'loggingOut');
		const decision = decideSessionEstablished(state, bob);
		expect(decision).toEqual({ kind: 'refused', state, reason: 'loggingOut' });
		expect(decision.state).toBe(state);
	});
});

describe('headless handoff', () => {
	it('hands a login result to the session and pulses accepted for that reduction only', async () => {
		const auth = createAuthFeature();
		const { deps, logins } = controlledAuthDeps();
		const store = createAuthStore(auth, deps);
		const seen = observe(store);

		store.dispatch({ type: 'openLogin' });
		const request = await submitCredentials(loginView(auth, store), logins);
		expect(seen.every(({ handoff }) => handoff === null), 'nothing handed over yet').toBe(true);

		request.resolve(ada);
		await settle();

		const [succeeded] = presented(seen, 'login', 'loginSucceeded');
		expect(succeeded?.handoff).toEqual({ kind: 'accepted', source: 'login', session: ada });
		expect(subjectId(store.state)).toBe(ada.subject_id);
		expect(store.state.login, 'the finished flow is retired').toBeNull();
		expect(auth.composition.bind(store, auth.loginSlot)).toBeUndefined();

		// The next auth reduction of any kind clears the pulse.
		store.dispatch({ type: 'cancelSignIn' });
		expect(store.state.handoff).toBeNull();
		expect(subjectId(store.state)).toBe(ada.subject_id);
	});

	it('opens the challenge on mfa_required and pulses accepted from the MFA source', async () => {
		const auth = createAuthFeature();
		const { deps, logins, challenges } = controlledAuthDeps();
		const store = createAuthStore(auth, deps);
		const seen = observe(store);

		store.dispatch({ type: 'openLogin' });
		(await submitCredentials(loginView(auth, store), logins)).reject(mfaRequired('chal-1'));
		await settle();

		expect(store.state.login).toBeNull();
		expect(store.state.mfa?.challengeId).toBe('chal-1');
		expect(store.state.handoff, 'a branch is not a handoff').toBeNull();
		expect(store.state.session.status).toBe('unresolved');

		const verification = await submitCode(mfaView(auth, store), challenges, '123456');
		expect(verification.challengeId).toBe('chal-1');
		verification.resolve(ada);
		await settle();

		const [succeeded] = presented(seen, 'mfa', 'challengeSucceeded');
		expect(succeeded?.handoff).toEqual({ kind: 'accepted', source: 'mfa', session: ada });
		expect(subjectId(store.state)).toBe(ada.subject_id);
		expect(store.state.mfa).toBeNull();
	});

	it('pulses refused with loggingOut when the session is signing out, from either source', async () => {
		const auth = createAuthFeature();
		const { deps, logins, challenges, logouts } = controlledAuthDeps();
		const store = createAuthStore(auth, deps, { session: signedInAs(ada) });
		const seen = observe(store);

		store.dispatch({ type: 'session', action: { type: 'logout' } });
		expect(store.state.session.status).toBe('loggingOut');
		// A flow opened after `logout` is new intent: live, and its result reduced.
		store.dispatch({ type: 'openLogin' });
		(await submitCredentials(loginView(auth, store), logins, 'bob@example.com')).resolve(bob);
		await settle();

		const [login] = presented(seen, 'login', 'loginSucceeded');
		expect(login?.handoff).toEqual({ kind: 'refused', source: 'login', reason: 'loggingOut' });
		expect(store.state.session.status).toBe('loggingOut');
		expect(subjectId(store.state), 'the session kept its state').toBe(ada.subject_id);
		expect(store.state.login, 'a refused result does not linger').toBeNull();

		store.dispatch({ type: 'openLogin' });
		expect(store.state.handoff).toBeNull();
		(await submitCredentials(loginView(auth, store), logins, 'bob@example.com')).reject(mfaRequired('chal-9'));
		await settle();
		(await submitCode(mfaView(auth, store), challenges, '654321')).resolve(bob);
		await settle();

		const [mfa] = presented(seen, 'mfa', 'challengeSucceeded');
		expect(mfa?.handoff).toEqual({ kind: 'refused', source: 'mfa', reason: 'loggingOut' });
		expect(store.state.mfa).toBeNull();

		logouts[0]!.resolve();
		await settle();
		expect(store.state.session.status).toBe('anonymous');
		expect(store.state.handoff).toBeNull();
	});
});

describe('the handoff pulse', () => {
	it('is cleared by every auth-routed reduction, including child input and session actions', async () => {
		const auth = createAuthFeature();
		const { deps, logins } = controlledAuthDeps();
		const accepted: AuthHandoff = { kind: 'accepted', source: 'login', session: mallory };

		const bySession = createAuthStore(auth, deps, { handoff: accepted });
		bySession.dispatch({ type: 'session', action: { type: 'resolveSession' } });
		expect(bySession.state.handoff).toBeNull();

		const byChild = createAuthStore(auth, deps, { login: createInitialLoginState(), handoff: accepted });
		loginView(auth, byChild).dispatch({ type: 'form', action: { type: 'fieldChanged', field: 'email', value: 'a' } });
		expect(byChild.state.handoff).toBeNull();

		// A refused open still clears it: the reduction ran.
		const byRefusedOpen = createAuthStore(auth, deps, { login: createInitialLoginState(), handoff: accepted });
		const before = byRefusedOpen.state.login;
		byRefusedOpen.dispatch({ type: 'openLogin' });
		expect(byRefusedOpen.state.login).toBe(before);
		expect(byRefusedOpen.state.handoff).toBeNull();

		// A restored pulse is never replayed as a new one; a genuine handoff still is.
		const restored = createAuthStore(auth, deps, { handoff: accepted });
		const seen = observe(restored);
		restored.dispatch({ type: 'openLogin' });
		expect(restored.state.handoff).toBeNull();
		expect(restored.state.session.status).toBe('unresolved');
		(await submitCredentials(loginView(auth, restored), logins)).resolve(ada);
		await settle();
		expect(presented(seen, 'login', 'loginSucceeded')[0]?.handoff).toEqual({
			kind: 'accepted',
			source: 'login',
			session: ada
		});
	});

	it('is not set by a root session handoff, which is not a login or MFA result', () => {
		const auth = createAuthFeature();
		const store = createAuthStore(auth, controlledAuthDeps().deps);
		store.dispatch({ type: 'session', action: { type: 'sessionEstablished', session: ada } });
		expect(subjectId(store.state)).toBe(ada.subject_id);
		expect(store.state.handoff).toBeNull();
	});
});

describe('flow lifetimes', () => {
	it('openLogin over a live attempt is idempotent: same owner, request alive, result lands', async () => {
		const auth = createAuthFeature();
		const { deps, logins } = controlledAuthDeps();
		const store = createAuthStore(auth, deps);

		store.dispatch({ type: 'openLogin' });
		const view = loginView(auth, store);
		const request = await submitCredentials(view, logins);
		const before = store.state;

		store.dispatch({ type: 'openLogin' });
		expect(store.state).toBe(before);
		expect(request.signal?.aborted).toBe(false);
		expect(auth.composition.bind(store, auth.loginSlot)).toBe(view);

		request.resolve(ada);
		await settle();
		expect(subjectId(store.state)).toBe(ada.subject_id);
	});

	it('openLogin over a live challenge is refused', () => {
		const auth = createAuthFeature();
		const store = createAuthStore(auth, controlledAuthDeps().deps, {
			mfa: createInitialMfaChallengeState('chal-1', ['totp'])
		});
		const before = store.state;
		store.dispatch({ type: 'openLogin' });
		expect(store.state).toBe(before);
	});

	it('restartLogin retires the live owners; their late results are dropped, the new flow lands', async () => {
		const auth = createAuthFeature();
		const { deps, logins } = controlledAuthDeps();
		const store = createAuthStore(auth, deps);
		const seen = observe(store);

		store.dispatch({ type: 'openLogin' });
		const oldView = loginView(auth, store);
		const old = await submitCredentials(oldView, logins, 'mallory@example.com');

		store.dispatch({ type: 'restartLogin' });
		expect(old.signal?.aborted).toBe(true);
		expect(oldView.state, 'the captured view is retired').toBeUndefined();
		expect(store.state.login?.status).toBe('idle');

		old.resolve(mallory);
		await settle();
		expect(presented(seen, 'login', 'loginSucceeded')).toHaveLength(0);
		expect(store.state.session.status).toBe('unresolved');

		const fresh = await submitCredentials(loginView(auth, store), logins);
		fresh.resolve(ada);
		await settle();
		expect(presented(seen, 'login', 'loginSucceeded'), 'control: the live owner is heard').toHaveLength(1);
		expect(subjectId(store.state)).toBe(ada.subject_id);
	});

	it('restartLogin from a challenge removes it and aborts its verification', async () => {
		const auth = createAuthFeature();
		const { deps, challenges } = controlledAuthDeps();
		const store = createAuthStore(auth, deps, { mfa: createInitialMfaChallengeState('chal-1', ['totp']) });
		const seen = observe(store);

		const verification = await submitCode(mfaView(auth, store), challenges, '123456');
		store.dispatch({ type: 'restartLogin' });
		expect(verification.signal?.aborted).toBe(true);
		expect(store.state.mfa).toBeNull();
		expect(store.state.login?.status).toBe('idle');

		verification.resolve(mallory);
		await settle();
		expect(presented(seen, 'mfa', 'challengeSucceeded')).toHaveLength(0);
		expect(store.state.session.status).toBe('unresolved');

		// Control: a challenge with a live owner is heard.
		const other = createAuthStore(auth, deps, { mfa: createInitialMfaChallengeState('chal-2', ['totp']) });
		const otherSeen = observe(other);
		(await submitCode(mfaView(auth, other), challenges, '123456')).resolve(ada);
		await settle();
		expect(presented(otherSeen, 'mfa', 'challengeSucceeded')).toHaveLength(1);
	});

	it('logout retires a sign-in; a result landing after loggedOut is dropped, not re-authenticated', async () => {
		const auth = createAuthFeature();
		const { deps, logins, logouts } = controlledAuthDeps();
		const store = createAuthStore(auth, deps, { session: signedInAs(ada) });
		const seen = observe(store);

		store.dispatch({ type: 'openLogin' });
		const late = await submitCredentials(loginView(auth, store), logins, 'bob@example.com');

		store.dispatch({ type: 'session', action: { type: 'logout' } });
		expect(late.signal?.aborted).toBe(true);
		expect(store.state.login).toBeNull();

		logouts[0]!.resolve();
		await settle();
		expect(store.state.session.status).toBe('anonymous');

		late.resolve(bob);
		await settle();
		expect(presented(seen, 'login', 'loginSucceeded')).toHaveLength(0);
		expect(store.state.session.status).toBe('anonymous');
		expect(store.state.handoff).toBeNull();

		// Control: a flow opened now is new intent, and its result signs Bob in.
		store.dispatch({ type: 'openLogin' });
		(await submitCredentials(loginView(auth, store), logins, 'bob@example.com')).resolve(bob);
		await settle();
		expect(presented(seen, 'login', 'loginSucceeded')).toHaveLength(1);
		expect(subjectId(store.state)).toBe(bob.subject_id);
	});

	it('logout from an anonymous session still retires a live challenge', async () => {
		const auth = createAuthFeature();
		const { deps, challenges } = controlledAuthDeps();
		const store = createAuthStore(auth, deps, {
			session: { ...createInitialSessionState(), status: 'anonymous' },
			mfa: createInitialMfaChallengeState('chal-1', ['totp'])
		});
		const seen = observe(store);
		const verification = await submitCode(mfaView(auth, store), challenges, '123456');

		store.dispatch({ type: 'session', action: { type: 'logout' } });
		expect(verification.signal?.aborted).toBe(true);
		expect(store.state.mfa).toBeNull();

		verification.resolve(mallory);
		await settle();
		expect(presented(seen, 'mfa', 'challengeSucceeded')).toHaveLength(0);
		expect(subjectId(store.state)).toBeNull();
	});

	it('cancelSignIn and view dismissal remove flows; their late results are dropped', async () => {
		const auth = createAuthFeature();
		const { deps, logins } = controlledAuthDeps();
		const store = createAuthStore(auth, deps, { session: signedInAs(ada) });
		const seen = observe(store);

		store.dispatch({ type: 'openLogin' });
		const cancelled = await submitCredentials(loginView(auth, store), logins, 'bob@example.com');
		store.dispatch({ type: 'cancelSignIn' });
		expect(cancelled.signal?.aborted).toBe(true);
		expect(store.state.login).toBeNull();

		store.dispatch({ type: 'openLogin' });
		const view = loginView(auth, store);
		const dismissed = await submitCredentials(view, logins, 'bob@example.com');
		view.dismiss();
		expect(dismissed.signal?.aborted).toBe(true);
		expect(store.state.login).toBeNull();

		cancelled.resolve(bob);
		dismissed.resolve(bob);
		await settle();
		expect(presented(seen, 'login', 'loginSucceeded')).toHaveLength(0);
		expect(subjectId(store.state), 'the signed-in account is untouched').toBe(ada.subject_id);
		expect(store.state.handoff).toBeNull();

		// Control: the same shape from a live owner is heard.
		store.dispatch({ type: 'openLogin' });
		(await submitCredentials(loginView(auth, store), logins, 'bob@example.com')).resolve(bob);
		await settle();
		expect(presented(seen, 'login', 'loginSucceeded')).toHaveLength(1);
		expect(subjectId(store.state)).toBe(bob.subject_id);
	});

	it("a challenge's startOverRequested retires it and presents a fresh sign-in", async () => {
		const auth = createAuthFeature();
		const { deps, logins, challenges } = controlledAuthDeps();
		const store = createAuthStore(auth, deps, { mfa: createInitialMfaChallengeState('chal-1', ['totp']) });
		const seen = observe(store);
		const challenge = mfaView(auth, store);
		const verification = await submitCode(challenge, challenges, '123456');

		challenge.dispatch({ type: 'startOverRequested' });
		expect(presented(seen, 'mfa', 'startOverRequested')).toHaveLength(1);
		expect(verification.signal?.aborted).toBe(true);
		expect(challenge.state, 'the captured challenge is retired').toBeUndefined();
		expect(store.state.mfa).toBeNull();
		expect(store.state.login).toEqual(createInitialLoginState());
		expect(store.state.handoff).toBeNull();

		verification.resolve(mallory);
		await settle();
		expect(presented(seen, 'mfa', 'challengeSucceeded')).toHaveLength(0);
		expect(store.state.session.status).toBe('unresolved');

		(await submitCredentials(loginView(auth, store), logins)).resolve(ada);
		await settle();
		expect(presented(seen, 'login', 'loginSucceeded'), 'control: the fresh sign-in is live').toHaveLength(1);
		expect(subjectId(store.state)).toBe(ada.subject_id);
	});

	it('startOverRequested with a live sign-in replaces that owner rather than reusing it', async () => {
		const auth = createAuthFeature();
		const { deps, logins, challenges } = controlledAuthDeps();
		const store = createAuthStore(auth, deps, {
			login: createInitialLoginState(),
			mfa: createInitialMfaChallengeState('chal-1', ['totp'])
		});
		const seen = observe(store);
		const oldLogin = loginView(auth, store);
		const challenge = mfaView(auth, store);
		const signIn = await submitCredentials(oldLogin, logins, 'mallory@example.com');
		const verification = await submitCode(challenge, challenges, '123456');

		challenge.dispatch({ type: 'startOverRequested' });
		expect(signIn.signal?.aborted, 'the old sign-in owner was retired').toBe(true);
		expect(verification.signal?.aborted).toBe(true);
		expect(oldLogin.state, 'the captured sign-in is retired').toBeUndefined();
		const fresh = loginView(auth, store);
		expect(fresh).not.toBe(oldLogin);
		expect(fresh.state).toEqual(createInitialLoginState());
		expect(store.state.mfa).toBeNull();

		signIn.resolve(mallory);
		verification.resolve(mallory);
		await settle();
		expect(presented(seen, 'login', 'loginSucceeded')).toHaveLength(0);
		expect(presented(seen, 'mfa', 'challengeSucceeded')).toHaveLength(0);
		expect(store.state.session.status).toBe('unresolved');

		(await submitCredentials(fresh, logins)).resolve(ada);
		await settle();
		expect(presented(seen, 'login', 'loginSucceeded'), 'control: the replacement is heard').toHaveLength(1);
		expect(subjectId(store.state)).toBe(ada.subject_id);
	});

	it('startOverRequested with no live challenge changes nothing', () => {
		const auth = createAuthFeature();
		const store = createAuthStore(auth, controlledAuthDeps().deps, {
			mfa: createInitialMfaChallengeState('chal-1', ['totp'])
		});
		const retired = mfaView(auth, store);
		store.dispatch({ type: 'cancelSignIn' });
		const before = store.state;

		retired.dispatch({ type: 'startOverRequested' });
		store.dispatch({ type: 'mfa', action: { type: 'presented', action: { type: 'startOverRequested' } } });
		expect(store.state.login, 'no sign-in was presented').toBeNull();
		expect(store.state.mfa).toBeNull();
		expect(store.state.session).toBe(before.session);

		// Control: from a live challenge the same input presents a sign-in.
		const live = createAuthStore(auth, controlledAuthDeps().deps, {
			mfa: createInitialMfaChallengeState('chal-2', ['totp'])
		});
		mfaView(auth, live).dispatch({ type: 'startOverRequested' });
		expect(live.state.login).toEqual(createInitialLoginState());
	});

	it('a root stale start-over leaves an in-flight sign-in owner intact', async () => {
		const auth = createAuthFeature();
		const { deps, logins } = controlledAuthDeps();
		const store = createAuthStore(auth, deps, { login: createInitialLoginState() });
		const seen = observe(store);
		const login = loginView(auth, store);
		const signIn = await submitCredentials(login, logins);

		store.dispatch({ type: 'mfa', action: { type: 'presented', action: { type: 'startOverRequested' } } });
		expect(store.state.mfa).toBeNull();
		expect(login.state, 'the login view remains live').toBeDefined();
		expect(signIn.signal?.aborted, 'the pending request remains owned by login').toBe(false);

		signIn.resolve(ada);
		await settle();
		expect(presented(seen, 'login', 'loginSucceeded')).toHaveLength(1);
		expect(subjectId(store.state)).toBe(ada.subject_id);
	});

	it('the challenge reducer leaves startOverRequested to its composer', () => {
		const state = createInitialMfaChallengeState('chal-1', ['totp']);
		const [next, effect] = mfaChallengeReducer(state, { type: 'startOverRequested' }, {
			verifyMfaChallenge: async () => ada
		});
		expect(next).toBe(state);
		expect(effect._tag).toBe('None');
	});

	it('sign-in input leaves a live challenge alone; only an mfa_required branch replaces it', async () => {
		const auth = createAuthFeature();
		const { deps, logins, challenges } = controlledAuthDeps();
		const store = createAuthStore(auth, deps, {
			login: createInitialLoginState(),
			mfa: createInitialMfaChallengeState('chal-1', ['totp'])
		});
		const seen = observe(store);
		const oldChallenge = mfaView(auth, store);
		const verification = await submitCode(oldChallenge, challenges, '123456');

		const request = await submitCredentials(loginView(auth, store), logins);
		expect(verification.signal?.aborted, 'typing and submitting in login').toBe(false);
		expect(auth.composition.bind(store, auth.mfaSlot)).toBe(oldChallenge);

		request.reject(mfaRequired('chal-2'));
		await settle();
		expect(verification.signal?.aborted, 'the branch replaced the challenge').toBe(true);
		expect(oldChallenge.state).toBeUndefined();
		expect(store.state.mfa?.challengeId).toBe('chal-2');

		verification.resolve(mallory);
		await settle();
		expect(presented(seen, 'mfa', 'challengeSucceeded')).toHaveLength(0);

		(await submitCode(mfaView(auth, store), challenges, '123456')).resolve(ada);
		await settle();
		expect(presented(seen, 'mfa', 'challengeSucceeded'), 'control').toHaveLength(1);
		expect(subjectId(store.state)).toBe(ada.subject_id);
	});
});

describe('managed signup', () => {
	const signedUp = (session: typeof ada) => ({ kind: 'session', session }) as const;

	it('hands its stored session to the shared decision once, pulses accepted and retires the flow', async () => {
		const auth = createAuthFeature();
		const { deps, signups } = controlledAuthDeps();
		const store = createAuthStore(auth, deps);
		const seen = observe(store);

		store.dispatch({ type: 'openSignup' });
		const view = signupView(auth, store);
		const request = await submitSignup(view, signups);
		expect(request.credentials).toEqual({ email: 'grace@example.com', password: 'correct-horse-battery-staple' });
		expect(seen.every(({ handoff }) => handoff === null), 'nothing handed over yet').toBe(true);

		request.resolve(signedUp(ada));
		await settle();

		const succeeded = presented(seen, 'signup', 'signupSucceeded');
		expect(succeeded).toHaveLength(1);
		expect(succeeded[0]?.handoff).toEqual({ kind: 'accepted', source: 'signup', session: ada });
		expect(seen.filter(({ handoff }) => handoff !== null), 'exactly one pulse').toHaveLength(1);
		expect(subjectId(store.state)).toBe(ada.subject_id);
		expect(store.state.signup, 'the finished flow is retired').toBeNull();
		expect(view.state).toBeUndefined();

		store.dispatch({ type: 'cancelSignIn' });
		expect(store.state.handoff).toBeNull();
		expect(subjectId(store.state)).toBe(ada.subject_id);
	});

	it('pulses refused while signing out, keeps the session and does not linger', async () => {
		const auth = createAuthFeature();
		const { deps, signups } = controlledAuthDeps();
		const store = createAuthStore(auth, deps, { session: signedInAs(ada) });
		const seen = observe(store);

		store.dispatch({ type: 'session', action: { type: 'logout' } });
		store.dispatch({ type: 'openSignup' });
		(await submitSignup(signupView(auth, store), signups, 'bob@example.com')).resolve(signedUp(bob));
		await settle();

		const [signup] = presented(seen, 'signup', 'signupSucceeded');
		expect(signup?.handoff).toEqual({ kind: 'refused', source: 'signup', reason: 'loggingOut' });
		expect(store.state.session.status).toBe('loggingOut');
		expect(subjectId(store.state), 'the session kept its state').toBe(ada.subject_id);
		expect(store.state.signup).toBeNull();
	});

	it('verificationRequired keeps the terminal flow and its pending email, and establishes no session', async () => {
		const auth = createAuthFeature();
		const { deps, signups } = controlledAuthDeps();
		const store = createAuthStore(auth, deps);
		const seen = observe(store);

		store.dispatch({ type: 'openSignup' });
		const view = signupView(auth, store);
		(await submitSignup(view, signups)).resolve({ kind: 'verificationRequired', email: 'grace@example.com' });
		await settle();

		expect(presented(seen, 'signup', 'verificationRequired')).toHaveLength(1);
		expect(store.state.signup?.status).toBe('awaitingVerification');
		expect(store.state.signup?.pendingEmail).toBe('grace@example.com');
		expect(store.state.signup?.session).toBeNull();
		expect(view.state, 'the same owner stays presented').toBe(store.state.signup);
		expect(store.state.session.status, 'no session').toBe('unresolved');
		expect(seen.every(({ handoff }) => handoff === null), 'no handoff').toBe(true);
	});

	it('root stale results with no signup do nothing; a live owner is heard', async () => {
		const auth = createAuthFeature();
		const { deps, signups } = controlledAuthDeps();
		const store = createAuthStore(auth, deps);
		const before = store.state;
		const root = (action: SignupAction) => store.dispatch({ type: 'signup', action: { type: 'presented', action } });

		root({ type: 'signupSucceeded', session: mallory });
		root({ type: 'verificationRequired', email: 'mallory@example.com' });
		root({ type: 'signInRequested' });
		expect(store.state.signup).toBeNull();
		expect(store.state.login, 'no sign-in was presented').toBeNull();
		expect(store.state.session).toBe(before.session);
		expect(store.state.handoff).toBeNull();

		// Control: the same result from a live owner signs in.
		const seen = observe(store);
		store.dispatch({ type: 'openSignup' });
		(await submitSignup(signupView(auth, store), signups)).resolve(signedUp(ada));
		await settle();
		expect(presented(seen, 'signup', 'signupSucceeded')).toHaveLength(1);
		expect(subjectId(store.state)).toBe(ada.subject_id);
	});

	it('openSignup is idempotent over any live flow; openLogin is refused over a live signup', async () => {
		const auth = createAuthFeature();
		const { deps, signups } = controlledAuthDeps();
		const store = createAuthStore(auth, deps);
		store.dispatch({ type: 'openSignup' });
		const view = signupView(auth, store);
		const request = await submitSignup(view, signups);
		const before = store.state;

		store.dispatch({ type: 'openSignup' });
		store.dispatch({ type: 'openLogin' });
		expect(store.state).toBe(before);
		expect(request.signal?.aborted).toBe(false);
		expect(auth.composition.bind(store, auth.signupSlot)).toBe(view);

		for (const initial of [{ login: createInitialLoginState() }, { mfa: createInitialMfaChallengeState('chal-1', ['totp']) }]) {
			const other = createAuthStore(auth, deps, initial);
			const state = other.state;
			other.dispatch({ type: 'openSignup' });
			expect(other.state.signup).toBeNull();
			expect(other.state.login).toBe(state.login);
			expect(other.state.mfa).toBe(state.mfa);
		}

		request.resolve(signedUp(ada));
		await settle();
		expect(subjectId(store.state), 'control: the untouched attempt lands').toBe(ada.subject_id);
	});

	it('restartSignup replaces the owner; an abort-ignoring late result is dropped, the new one lands', async () => {
		const auth = createAuthFeature();
		const { deps, signups } = controlledAuthDeps();
		const store = createAuthStore(auth, deps);
		const seen = observe(store);

		store.dispatch({ type: 'openSignup' });
		const oldView = signupView(auth, store);
		const old = await submitSignup(oldView, signups, 'mallory@example.com');

		store.dispatch({ type: 'restartSignup' });
		expect(old.signal?.aborted).toBe(true);
		expect(oldView.state, 'the captured view is retired').toBeUndefined();
		const fresh = signupView(auth, store);
		expect(fresh).not.toBe(oldView);
		expect(fresh.state).toEqual(createInitialSignupState());

		// The transport ignores the abort and completes anyway.
		old.resolve(signedUp(mallory));
		await settle();
		expect(presented(seen, 'signup', 'signupSucceeded')).toHaveLength(0);
		expect(store.state.session.status).toBe('unresolved');
		expect(store.state.signup?.status).toBe('idle');

		(await submitSignup(fresh, signups)).resolve(signedUp(ada));
		await settle();
		expect(presented(seen, 'signup', 'signupSucceeded'), 'control: the replacement is heard').toHaveLength(1);
		expect(subjectId(store.state)).toBe(ada.subject_id);
	});

	it('restartSignup retires live login and MFA owners; restartLogin retires a live signup', async () => {
		const auth = createAuthFeature();
		const { deps, logins, challenges, signups } = controlledAuthDeps();
		const store = createAuthStore(auth, deps, {
			login: createInitialLoginState(),
			mfa: createInitialMfaChallengeState('chal-1', ['totp'])
		});
		const seen = observe(store);
		const signIn = await submitCredentials(loginView(auth, store), logins, 'mallory@example.com');
		const verification = await submitCode(mfaView(auth, store), challenges, '123456');

		store.dispatch({ type: 'restartSignup' });
		expect(signIn.signal?.aborted).toBe(true);
		expect(verification.signal?.aborted).toBe(true);
		expect(store.state.login).toBeNull();
		expect(store.state.mfa).toBeNull();
		expect(store.state.signup?.status).toBe('idle');

		const signup = await submitSignup(signupView(auth, store), signups, 'mallory@example.com');
		store.dispatch({ type: 'restartLogin' });
		expect(signup.signal?.aborted).toBe(true);
		expect(store.state.signup).toBeNull();

		signIn.resolve(mallory);
		verification.resolve(mallory);
		signup.resolve(signedUp(mallory));
		await settle();
		expect(presented(seen, 'login', 'loginSucceeded')).toHaveLength(0);
		expect(presented(seen, 'mfa', 'challengeSucceeded')).toHaveLength(0);
		expect(presented(seen, 'signup', 'signupSucceeded')).toHaveLength(0);
		expect(store.state.session.status).toBe('unresolved');

		(await submitCredentials(loginView(auth, store), logins)).resolve(ada);
		await settle();
		expect(presented(seen, 'login', 'loginSucceeded'), 'control: the new sign-in is heard').toHaveLength(1);
	});

	it('logout and cancelSignIn retire a signup; abort-ignoring late results are dropped', async () => {
		const auth = createAuthFeature();
		const { deps, signups, logouts } = controlledAuthDeps();
		const store = createAuthStore(auth, deps, { session: signedInAs(ada) });
		const seen = observe(store);

		store.dispatch({ type: 'openSignup' });
		const cancelled = await submitSignup(signupView(auth, store), signups, 'bob@example.com');
		store.dispatch({ type: 'cancelSignIn' });
		expect(cancelled.signal?.aborted).toBe(true);
		expect(store.state.signup).toBeNull();

		store.dispatch({ type: 'openSignup' });
		const loggedOut = await submitSignup(signupView(auth, store), signups, 'bob@example.com');
		store.dispatch({ type: 'session', action: { type: 'logout' } });
		expect(loggedOut.signal?.aborted).toBe(true);
		expect(store.state.signup).toBeNull();
		logouts[0]!.resolve();
		await settle();

		cancelled.resolve(signedUp(bob));
		loggedOut.resolve(signedUp(bob));
		await settle();
		expect(presented(seen, 'signup', 'signupSucceeded')).toHaveLength(0);
		expect(store.state.session.status).toBe('anonymous');
		expect(store.state.handoff).toBeNull();
	});

	it("email_taken's signInRequested retires the signup and presents a fresh sign-in, replacing a live one", async () => {
		const auth = createAuthFeature();
		const { deps, logins, signups } = controlledAuthDeps();
		const store = createAuthStore(auth, deps, { login: createInitialLoginState(), signup: createInitialSignupState() });
		const seen = observe(store);
		const oldLogin = loginView(auth, store);
		const signIn = await submitCredentials(oldLogin, logins, 'mallory@example.com');
		const signup = signupView(auth, store);
		(await submitSignup(signup, signups)).reject({ code: 'email_taken', message: 'That address is taken.' });
		await settle();
		expect(store.state.signup?.error?.code).toBe('email_taken');

		signup.dispatch({ type: 'signInRequested' });
		expect(presented(seen, 'signup', 'signInRequested')).toHaveLength(1);
		expect(signup.state, 'the signup owner is retired').toBeUndefined();
		expect(store.state.signup).toBeNull();
		expect(signIn.signal?.aborted, 'the old sign-in owner was replaced').toBe(true);
		expect(oldLogin.state).toBeUndefined();
		expect(store.state.login).toEqual(createInitialLoginState());
		expect(store.state.handoff).toBeNull();

		signIn.resolve(mallory);
		await settle();
		expect(presented(seen, 'login', 'loginSucceeded')).toHaveLength(0);
		(await submitCredentials(loginView(auth, store), logins)).resolve(ada);
		await settle();
		expect(presented(seen, 'login', 'loginSucceeded'), 'control: the fresh sign-in is live').toHaveLength(1);
		expect(subjectId(store.state)).toBe(ada.subject_id);
	});

	it('the signup reducer leaves signInRequested to its composer', () => {
		const state = createInitialSignupState();
		const [next, effect] = signupReducer(state, { type: 'signInRequested' }, { signup: async () => signedUp(ada) });
		expect(next).toBe(state);
		expect(effect._tag).toBe('None');
	});
});

describe('managed password recovery', () => {
	it('keeps the conditional sent message and editable form for repeated requests', async () => {
		const auth = createAuthFeature();
		const { deps, forgotPasswords } = controlledAuthDeps();
		const store = createAuthStore(auth, deps);
		store.dispatch({ type: 'openForgotPassword' });
		const view = forgotView(auth, store);
		const first = await submitForgot(view, forgotPasswords);
		expect(first.email).toBe('grace@example.com');
		first.resolve();
		await settle();
		expect(store.state.forgotPassword?.status).toBe('sent');
		expect(store.state.forgotPassword?.requestedFor).toBe('grace@example.com');
		expect(store.state.session.status).toBe('unresolved');
		expect(store.state.handoff).toBeNull();
		store.dispatch({ type: 'openForgotPassword' });
		expect(forgotView(auth, store)).toBe(view);
		store.dispatch({ type: 'openLogin' });
		store.dispatch({ type: 'openResetPassword', token: 'ignored' });
		expect(store.state.login).toBeNull();
		expect(store.state.resetPassword).toBeNull();
		expect(forgotView(auth, store)).toBe(view);
		const second = await submitForgot(view, forgotPasswords);
		second.resolve();
		await settle();
		expect(forgotPasswords).toHaveLength(2);
		expect(store.state.forgotPassword?.requestedFor).toBe('grace@example.com');
		view.dispatch({ type: 'signInRequested' });
		expect(view.state).toBeUndefined();
		expect(store.state.login?.status).toBe('idle');
	});

	it('explicit navigation retires in-flight recovery requests and drops late feedback', async () => {
		const auth = createAuthFeature();
		const { deps, forgotPasswords, resetPasswords } = controlledAuthDeps();
		const store = createAuthStore(auth, deps);
		store.dispatch({ type: 'openForgotPassword' });
		const sentLater = await submitForgot(forgotView(auth, store), forgotPasswords);
		forgotView(auth, store).dispatch({ type: 'signInRequested' });
		expect(sentLater.signal?.aborted).toBe(true);
		expect(store.state.login?.status).toBe('idle');
		sentLater.resolve();
		await settle();
		expect(store.state.forgotPassword).toBeNull();

		store.dispatch({ type: 'restartResetPassword', token: 'token-a' });
		const resetLater = await submitReset(resetView(auth, store), resetPasswords);
		resetView(auth, store).dispatch({ type: 'requestNewLinkRequested' });
		expect(resetLater.signal?.aborted).toBe(true);
		expect(store.state.forgotPassword?.status).toBe('idle');
		resetLater.resolve(ada);
		await settle();
		expect(store.state.resetPassword).toBeNull();
		expect(store.state.session.subject.kind).toBe('anonymous');
		expect(store.state.handoff).toBeNull();

		store.dispatch({ type: 'restartResetPassword', token: 'token-b' });
		const signInLater = await submitReset(resetView(auth, store), resetPasswords);
		resetView(auth, store).dispatch({ type: 'signInRequested' });
		expect(signInLater.signal?.aborted).toBe(true);
		expect(store.state.login?.status).toBe('idle');
		signInLater.resolve(bob);
		await settle();
		expect(store.state.resetPassword).toBeNull();
		expect(store.state.session.subject.kind).toBe('anonymous');
		expect(store.state.handoff).toBeNull();
	});

	it('retires superseded reset requests and hands a session to the persistent parent once', async () => {
		const auth = createAuthFeature();
		const { deps, resetPasswords } = controlledAuthDeps();
		const store = createAuthStore(auth, deps);
		const seen = observe(store);
		store.dispatch({ type: 'openResetPassword', token: 'token-a' });
		const old = resetView(auth, store);
		const stale = await submitReset(old, resetPasswords);
		store.dispatch({ type: 'restartResetPassword', token: 'token-b' });
		expect(stale.signal?.aborted).toBe(true);
		expect(old.state).toBeUndefined();
		const fresh = resetView(auth, store);
		const current = await submitReset(fresh, resetPasswords);
		expect(current.token).toBe('token-b');
		stale.resolve(mallory);
		current.resolve(ada);
		await settle();
		expect(presented(seen, 'resetPassword', 'resetSucceeded')).toHaveLength(1);
		expect(store.state.session.subject.kind === 'authenticated' && store.state.session.subject.id).toBe(ada.subject_id);
		expect(store.state.handoff).toEqual({ kind: 'accepted', source: 'resetPassword', session: ada });
		expect(store.state.resetPassword).toBeNull();
	});

	it('retains a no-session reset result and navigates to sign-in from its managed view', async () => {
		const auth = createAuthFeature();
		const { deps, resetPasswords } = controlledAuthDeps();
		const store = createAuthStore(auth, deps);
		store.dispatch({ type: 'openResetPassword', token: 'token-no-session' });
		const view = resetView(auth, store);
		(await submitReset(view, resetPasswords)).resolve(null);
		await settle();
		expect(store.state.resetPassword?.status).toBe('reset');
		expect(store.state.resetPassword?.session).toBeNull();
		expect(store.state.handoff).toBeNull();
		expect(store.state.session.status).toBe('unresolved');
		view.dispatch({ type: 'signInRequested' });
		expect(store.state.resetPassword).toBeNull();
		expect(store.state.login?.status).toBe('idle');
	});

	it('offers a fresh link after an expired reset and drops a late request after logout', async () => {
		const auth = createAuthFeature();
		const { deps, resetPasswords } = controlledAuthDeps();
		const store = createAuthStore(auth, deps);
		store.dispatch({ type: 'openResetPassword', token: 'expired' });
		const view = resetView(auth, store);
		(await submitReset(view, resetPasswords)).reject({ code: 'token_expired', message: 'Expired.' });
		await settle();
		expect(store.state.resetPassword?.error?.code).toBe('token_expired');
		view.dispatch({ type: 'requestNewLinkRequested' });
		expect(store.state.resetPassword).toBeNull();
		expect(store.state.forgotPassword?.status).toBe('idle');
		store.dispatch({ type: 'restartResetPassword', token: 'new' });
		const late = await submitReset(resetView(auth, store), resetPasswords);
		store.dispatch({ type: 'session', action: { type: 'logout' } });
		expect(late.signal?.aborted).toBe(true);
		late.resolve(bob);
		await settle();
		expect(store.state.resetPassword).toBeNull();
		expect(store.state.session.subject.kind).toBe('anonymous');
	});
});

describe('managed email verification', () => {
	it('lets a parent route each verified or resent result after its child, without replay', async () => {
		type State = { auth: AuthFeatureState | null; routes: string[] };
		type Action = { type: 'auth'; action: PresentationAction<AuthFeatureAction> } | { type: 'tick' };
		const auth = createAuthFeature();
		const slot = optionalSlot<State, Action>()('auth');
		const core: Reducer<State, Action, AuthFeatureDependencies> = (state, action) => {
			if (action.type !== 'auth' || action.action.type !== 'presented') return [state, Effect.none()];
			const feature = state.auth;
			const routed = action.action.action;
			let route: string | null = null;
			if (feature?.handoff?.kind === 'accepted') route = `home:${feature.handoff.source}`;
			else if (routed.type === 'emailVerification' && routed.action.type === 'presented') {
				const result = routed.action.action;
				if (result.type === 'verificationSucceeded' && result.session === null && feature?.emailVerification?.status === 'verified') route = 'signIn';
				if (result.type === 'resendSucceeded' && feature?.emailVerification?.resendStatus === 'sent') route = 'resent';
			}
			return route === null ? [state, Effect.none()] : [{ ...state, routes: [...state.routes, route] }, Effect.none()];
		};
		const app = new ManagedIntegrationBuilder(core).with(slot, auth.composition, { dismissal: 'deferred' }).build();
		const { deps, verifications, resends } = controlledAuthDeps();
		const store = createStore({ initialState: { auth: auth.initialState(), routes: [] } satisfies State, reducer: app.reducer, execution: app.execution, dependencies: deps });
		stores.push(store);
		const view = app.bind(store, slot)!;
		view.dispatch({ type: 'openEmailVerification', email: 'grace@example.com' });
		const verify = () => app.bind(store, nestedSlot(slot, auth.emailVerificationSlot))!;
		verify().dispatch({ type: 'verificationRequested', token: 'token-a' });
		await vi.waitFor(() => expect(verifications).toHaveLength(1));
		verifications[0]!.resolve(null);
		await settle();
		expect(store.state.routes).toEqual(['signIn']);
		view.dispatch({ type: 'openEmailVerification', email: 'ignored@example.com' });
		store.dispatch({ type: 'tick' });
		expect(store.state.routes).toEqual(['signIn']);
		for (let i = 0; i < 2; i++) {
			verify().dispatch({ type: 'resendRequested' });
			await vi.waitFor(() => expect(resends).toHaveLength(i + 1));
			resends[i]!.resolve();
			await settle();
		}
		expect(store.state.routes).toEqual(['signIn', 'resent', 'resent']);
		view.dispatch({ type: 'restartEmailVerification', email: 'grace@example.com' });
		verify().dispatch({ type: 'verificationRequested', token: 'token-b' });
		await vi.waitFor(() => expect(verifications).toHaveLength(2));
		verifications[1]!.resolve(ada);
		await settle();
		expect(store.state.routes).toEqual(['signIn', 'resent', 'resent', 'home:emailVerification']);
		store.dispatch({ type: 'tick' });
		expect(store.state.routes).toHaveLength(4);
	});

	it('hands an issued session to the persistent feature and retires the verification flow', async () => {
		const auth = createAuthFeature();
		const { deps, verifications } = controlledAuthDeps();
		const store = createAuthStore(auth, deps);
		const seen = observe(store);
		store.dispatch({ type: 'openEmailVerification', email: 'ada@example.com' });
		const view = verificationView(auth, store);
		view.dispatch({ type: 'verificationRequested', token: 'token-a' });
		await vi.waitFor(() => expect(verifications).toHaveLength(1));
		verifications[0]!.resolve(ada);
		await settle();
		expect(presented(seen, 'emailVerification', 'verificationSucceeded')).toHaveLength(1);
		expect(store.state.session.subject.kind === 'authenticated' && store.state.session.subject.id).toBe(ada.subject_id);
		expect(store.state.handoff).toEqual({ kind: 'accepted', source: 'emailVerification', session: ada });
		expect(store.state.emailVerification).toBeNull();
		expect(view.state).toBeUndefined();
	});

	it('keeps a verified no-session result visible and offers managed sign-in', async () => {
		const auth = createAuthFeature();
		const { deps, verifications } = controlledAuthDeps();
		const store = createAuthStore(auth, deps);
		store.dispatch({ type: 'openEmailVerification' });
		const view = verificationView(auth, store);
		view.dispatch({ type: 'verificationRequested', token: 'token-no-session' });
		await vi.waitFor(() => expect(verifications).toHaveLength(1));
		verifications[0]!.resolve(null);
		await settle();
		expect(store.state.emailVerification?.status).toBe('verified');
		expect(store.state.emailVerification?.session).toBeNull();
		expect(store.state.handoff).toBeNull();
		expect(store.state.session.status).toBe('unresolved');
		view.dispatch({ type: 'signInRequested' });
		expect(store.state.emailVerification).toBeNull();
		expect(store.state.login?.status).toBe('idle');
	});

	it('keeps verify and resend independent, and drops both after replacement', async () => {
		const auth = createAuthFeature();
		const { deps, verifications, resends } = controlledAuthDeps();
		const store = createAuthStore(auth, deps);
		store.dispatch({ type: 'openEmailVerification', email: 'ada@example.com' });
		const old = verificationView(auth, store);
		old.dispatch({ type: 'verificationRequested', token: 'old-token' });
		old.dispatch({ type: 'resendRequested' });
		await vi.waitFor(() => { expect(verifications).toHaveLength(1); expect(resends).toHaveLength(1); });
		expect(verifications[0]!.signal?.aborted).toBe(false);
		expect(resends[0]!.signal?.aborted).toBe(false);
		store.dispatch({ type: 'openEmailVerification', email: 'ignored@example.com' });
		expect(verificationView(auth, store)).toBe(old);
		store.dispatch({ type: 'restartEmailVerification', email: 'bob@example.com' });
		expect(old.state).toBeUndefined();
		expect(verifications[0]!.signal?.aborted).toBe(true);
		expect(resends[0]!.signal?.aborted).toBe(true);
		verifications[0]!.resolve(ada);
		resends[0]!.resolve();
		await settle();
		expect(store.state.emailVerification?.status).toBe('idle');
		expect(store.state.emailVerification?.resendStatus).toBe('idle');
		expect(store.state.emailVerification?.email).toBe('bob@example.com');
		const fresh = verificationView(auth, store);
		fresh.dispatch({ type: 'verificationRequested', token: 'new-token' });
		fresh.dispatch({ type: 'resendRequested' });
		await vi.waitFor(() => { expect(verifications).toHaveLength(2); expect(resends).toHaveLength(2); });
		verifications[1]!.reject({ code: 'token_expired', message: 'Expired.' });
		await settle();
		expect(store.state.emailVerification?.status).toBe('idle');
		expect(store.state.emailVerification?.error?.code).toBe('token_expired');
		expect(store.state.emailVerification?.resendStatus).toBe('sending');
		expect(resends[1]!.signal?.aborted).toBe(false);
		resends[1]!.resolve();
		await settle();
		expect(store.state.emailVerification?.resendStatus).toBe('sent');
		expect(store.state.emailVerification?.email).toBe('bob@example.com');
	});
});

describe('embedded in a parent', () => {
	type AppState = { auth: AuthFeatureState | null; welcomed: string[] };
	type AppAction =
		| { type: 'auth'; action: PresentationAction<AuthFeatureAction> }
		| { type: 'tick' }
		| { type: 'resetAuth' };

	it('the parent reads the pulse after its auth child, on auth-routed actions only', async () => {
		const auth = createAuthFeature();
		const authSlot = optionalSlot<AppState, AppAction>()('auth');
		const appCore: Reducer<AppState, AppAction, AuthFeatureDependencies> = (state, action) => {
			if (action.type === 'resetAuth') return [{ ...state, auth: auth.initialState() }, Effect.none()];
			if (action.type !== 'auth' || action.action.type !== 'presented') return [state, Effect.none()];
			const handoff = state.auth?.handoff;
			if (handoff?.kind !== 'accepted') return [state, Effect.none()];
			return [{ ...state, welcomed: [...state.welcomed, handoff.session.subject_id] }, Effect.none()];
		};
		const app = new ManagedIntegrationBuilder(appCore)
			.with(authSlot, auth.composition, {
				dismissal: 'deferred',
				replaceOn: (action) => action.type === 'resetAuth'
			})
			.build();
		const { deps, logins } = controlledAuthDeps();
		const store = createStore({
			initialState: { auth: auth.initialState(), welcomed: [] } as AppState,
			reducer: app.reducer,
			execution: app.execution,
			dependencies: deps
		});
		stores.push(store);

		const authView = app.bind(store, authSlot)!;
		authView.dispatch({ type: 'openLogin' });
		const loginInApp = app.bind(store, nestedSlot(authSlot, auth.loginSlot))!;
		(await submitCredentials(loginInApp, logins)).resolve(ada);
		await settle();
		expect(store.state.welcomed).toEqual([ada.subject_id]);

		// Parent-only actions do not reach auth; the parent does not read it there.
		store.dispatch({ type: 'tick' });
		store.dispatch({ type: 'tick' });
		expect(store.state.welcomed).toEqual([ada.subject_id]);
		// The next auth-routed action clears the pulse before the parent sees it.
		authView.dispatch({ type: 'cancelSignIn' });
		expect(store.state.auth?.handoff).toBeNull();
		expect(store.state.welcomed).toEqual([ada.subject_id]);

		// A deferred parent slot ignores the auth slot's dismissal: the session survives.
		authView.dismiss();
		expect(store.state.auth?.session.status).toBe('authenticated');

		// Whole-feature replacement retires the captured view. The new feature's
		// first accepted result must be seen even though a prior feature had one.
		store.dispatch({ type: 'resetAuth' });
		expect(store.state.auth).toEqual(auth.initialState());
		authView.dispatch({ type: 'openLogin' });
		expect(store.state.auth?.login, 'old owner cannot reopen the feature').toBeNull();
		const freshAuthView = app.bind(store, authSlot)!;
		freshAuthView.dispatch({ type: 'openLogin' });
		const freshLogin = app.bind(store, nestedSlot(authSlot, auth.loginSlot))!;
		(await submitCredentials(freshLogin, logins, 'bob@example.com')).resolve(bob);
		await settle();
		expect(store.state.welcomed).toEqual([ada.subject_id, bob.subject_id]);

		// Replace again while a request is pending. A transport that ignores
		// abort may resolve it, but only the current owner's result reaches the
		// parent. The surviving feature can still sign in afterwards.
		freshAuthView.dispatch({ type: 'openLogin' });
		const pending = await submitCredentials(app.bind(store, nestedSlot(authSlot, auth.loginSlot))!, logins, 'mallory@example.com');
		store.dispatch({ type: 'resetAuth' });
		expect(pending.signal?.aborted).toBe(true);
		pending.resolve(mallory);
		await settle();
		expect(store.state.welcomed).toEqual([ada.subject_id, bob.subject_id]);
		const newestAuthView = app.bind(store, authSlot)!;
		newestAuthView.dispatch({ type: 'openLogin' });
		(await submitCredentials(app.bind(store, nestedSlot(authSlot, auth.loginSlot))!, logins)).resolve(ada);
		await settle();
		expect(store.state.welcomed).toEqual([ada.subject_id, bob.subject_id, ada.subject_id]);
	});

	it('the parent routes from signup state after a routed action: verification, then an accepted session', async () => {
		type State = { auth: AuthFeatureState | null; routes: string[] };
		type Action = { type: 'auth'; action: PresentationAction<AuthFeatureAction> } | { type: 'tick' };
		const auth = createAuthFeature();
		const slot = optionalSlot<State, Action>()('auth');
		const core: Reducer<State, Action, AuthFeatureDependencies> = (state, action) => {
			if (action.type !== 'auth' || action.action.type !== 'presented') return [state, Effect.none()];
			const handoff = state.auth?.handoff;
			const signup = state.auth?.signup;
			const routed = action.action.action;
			const verificationEmail =
				routed.type === 'signup' &&
				routed.action.type === 'presented' &&
				routed.action.action.type === 'verificationRequired'
					? routed.action.action.email
					: null;
			const route =
				handoff?.kind === 'accepted'
					? `home:${handoff.source}`
					: verificationEmail !== null && signup?.status === 'awaitingVerification' && signup.pendingEmail === verificationEmail
						? `checkEmail:${verificationEmail}`
						: null;
			if (route === null) return [state, Effect.none()];
			return [{ ...state, routes: [...state.routes, route] }, Effect.none()];
		};
		const app = new ManagedIntegrationBuilder(core).with(slot, auth.composition, { dismissal: 'deferred' }).build();
		const { deps, signups } = controlledAuthDeps();
		const store = createStore({
			initialState: { auth: auth.initialState(), routes: [] } satisfies State,
			reducer: app.reducer,
			execution: app.execution,
			dependencies: deps
		});
		stores.push(store);
		const view = app.bind(store, slot)!;
		const signupInApp = () => app.bind(store, nestedSlot(slot, auth.signupSlot))!;

		view.dispatch({ type: 'openSignup' });
		(await submitSignup(signupInApp(), signups)).resolve({ kind: 'verificationRequired', email: 'grace@example.com' });
		await settle();
		expect(store.state.routes).toEqual(['checkEmail:grace@example.com']);
		expect(store.state.auth?.session.status).toBe('unresolved');
		view.dispatch({ type: 'openSignup' });
		store.dispatch({ type: 'tick' });
		expect(store.state.routes, 'retained terminal state does not replay').toEqual(['checkEmail:grace@example.com']);

		view.dispatch({ type: 'restartSignup' });
		(await submitSignup(signupInApp(), signups)).resolve({ kind: 'verificationRequired', email: 'grace@example.com' });
		await settle();
		expect(store.state.routes, 'a new attempt for the same email is reported').toEqual([
			'checkEmail:grace@example.com',
			'checkEmail:grace@example.com'
		]);

		view.dispatch({ type: 'restartSignup' });
		(await submitSignup(signupInApp(), signups)).resolve({ kind: 'session', session: ada });
		await settle();
		expect(store.state.routes).toEqual(['checkEmail:grace@example.com', 'checkEmail:grace@example.com', 'home:signup']);
		expect(store.state.auth?.signup).toBeNull();
		store.dispatch({ type: 'tick' });
		expect(store.state.routes).toHaveLength(3);
	});

	it('the parent consumes a refused handoff once while logout is pending', async () => {
		type State = { auth: AuthFeatureState | null; outcomes: string[] };
		type Action = { type: 'auth'; action: PresentationAction<AuthFeatureAction> } | { type: 'tick' };
		const auth = createAuthFeature();
		const slot = optionalSlot<State, Action>()('auth');
		const core: Reducer<State, Action, AuthFeatureDependencies> = (state, action) => {
			if (action.type !== 'auth' || action.action.type !== 'presented' || state.auth?.handoff === null) {
				return [state, Effect.none()];
			}
			const handoff = state.auth?.handoff;
			return handoff
				? [{ ...state, outcomes: [...state.outcomes, `${handoff.kind}:${handoff.source}`] }, Effect.none()]
				: [state, Effect.none()];
		};
		const app = new ManagedIntegrationBuilder(core)
			.with(slot, auth.composition, { dismissal: 'deferred' })
			.build();
		const { deps, logins, logouts } = controlledAuthDeps();
		const store = createStore({
			initialState: { auth: auth.initialState(), outcomes: [] } satisfies State,
			reducer: app.reducer,
			execution: app.execution,
			dependencies: deps
		});
		stores.push(store);
		const view = app.bind(store, slot)!;
		view.dispatch({ type: 'session', action: { type: 'logout' } });
		await vi.waitFor(() => expect(logouts).toHaveLength(1));
		view.dispatch({ type: 'openLogin' });
		(await submitCredentials(app.bind(store, nestedSlot(slot, auth.loginSlot))!, logins)).resolve(ada);
		await settle();
		expect(store.state.auth?.session.status).toBe('loggingOut');
		expect(store.state.outcomes).toEqual(['refused:login']);
		store.dispatch({ type: 'tick' });
		view.dispatch({ type: 'cancelSignIn' });
		expect(store.state.outcomes).toEqual(['refused:login']);
	});
});

describe('managed magic links', () => {
	it('magic-link request submits email, pulses requestSent outcome once, and stays editable', async () => {
		const auth = createAuthFeature();
		const { deps, requestMagicLinks } = controlledAuthDeps();
		const store = createAuthStore(auth, deps);
		store.dispatch({ type: 'openMagicLinkRequest' });
		const view = magicRequestView(auth, store);

		const first = await submitMagicRequest(view, requestMagicLinks, 'grace@example.com');
		expect(first.email).toBe('grace@example.com');
		first.resolve();
		await settle();

		expect(store.state.magicLinkRequest?.status).toBe('sent');
		expect(store.state.magicLinkRequest?.requestedFor).toBe('grace@example.com');
		expect(store.state.magicLinkOutcome).toEqual({ kind: 'requestSent', email: 'grace@example.com' });
		expect(store.state.session.status).toBe('unresolved');
		expect(store.state.handoff).toBeNull();

		// Next action clears the one-reduction pulse
		store.dispatch({ type: 'openMagicLinkRequest' });
		expect(store.state.magicLinkOutcome).toBeNull();
		expect(magicRequestView(auth, store)).toBe(view);

		// Can submit again for another email
		const second = await submitMagicRequest(view, requestMagicLinks, 'ada@example.com');
		second.resolve();
		await settle();

		expect(requestMagicLinks).toHaveLength(2);
		expect(store.state.magicLinkRequest?.requestedFor).toBe('ada@example.com');
		expect(store.state.magicLinkOutcome).toEqual({ kind: 'requestSent', email: 'ada@example.com' });
	});

	it('magic-link request signInRequested navigates back to fresh login', async () => {
		const auth = createAuthFeature();
		const { deps } = controlledAuthDeps();
		const store = createAuthStore(auth, deps);
		store.dispatch({ type: 'openMagicLinkRequest' });
		const view = magicRequestView(auth, store);

		view.dispatch({ type: 'signInRequested' });
		expect(store.state.magicLinkRequest).toBeNull();
		expect(store.state.login?.status).toBe('idle');
	});

	it('magic-link sign-in token is not spent on mount or GET; user press spends token and establishes session', async () => {
		const auth = createAuthFeature();
		const { deps, signInWithMagicLinks } = controlledAuthDeps();
		const store = createAuthStore(auth, deps);
		store.dispatch({ type: 'openMagicLinkSignIn', token: 'token-abc' });

		// Critical: zero calls on mount
		await settle();
		expect(signInWithMagicLinks).toHaveLength(0);
		expect(store.state.magicLinkSignIn?.status).toBe('idle');

		const view = magicSignInView(auth, store);
		const req = await submitMagicSignIn(view, signInWithMagicLinks);
		expect(req.token).toBe('token-abc');

		req.resolve(ada);
		await settle();

		expect(store.state.magicLinkSignIn).toBeNull();
		expect(store.state.session.subject.kind === 'authenticated' && store.state.session.subject.id).toBe(ada.subject_id);
		expect(store.state.handoff).toEqual({
			kind: 'accepted',
			source: 'magicLinkSignIn',
			session: ada
		});
		expect(store.state.magicLinkOutcome).toEqual({ kind: 'signedIn' });

		// Next action clears pulses
		store.dispatch({ type: 'cancelSignIn' });
		expect(store.state.handoff).toBeNull();
		expect(store.state.magicLinkOutcome).toBeNull();
	});

	it('magic-link sign-in transitions to MFA challenge on mfa_required error', async () => {
		const auth = createAuthFeature();
		const { deps, signInWithMagicLinks } = controlledAuthDeps();
		const store = createAuthStore(auth, deps);
		store.dispatch({ type: 'openMagicLinkSignIn', token: 'token-mfa' });

		const view = magicSignInView(auth, store);
		const req = await submitMagicSignIn(view, signInWithMagicLinks);

		req.reject({
			code: 'mfa_required',
			message: 'MFA challenge needed',
			challengeId: 'challenge-ml-99',
			methods: ['totp']
		});
		await settle();

		expect(store.state.magicLinkSignIn).toBeNull();
		expect(store.state.mfa?.challengeId).toBe('challenge-ml-99');
		expect(store.state.magicLinkOutcome).toEqual({
			kind: 'mfaRequired',
			challengeId: 'challenge-ml-99',
			methods: ['totp']
		});
		expect(store.state.session.status).toBe('unresolved');
	});

	it('magic-link sign-in routes requestNewLinkRequested to magicLinkRequest and startOverRequested to login', async () => {
		const auth = createAuthFeature();
		const { deps } = controlledAuthDeps();
		const store = createAuthStore(auth, deps);

		store.dispatch({ type: 'openMagicLinkSignIn', token: 'expired-1' });
		const view1 = magicSignInView(auth, store);
		view1.dispatch({ type: 'requestNewLinkRequested' });

		expect(store.state.magicLinkSignIn).toBeNull();
		expect(store.state.magicLinkRequest?.status).toBe('idle');

		store.dispatch({ type: 'restartMagicLinkSignIn', token: 'expired-2' });
		const view2 = magicSignInView(auth, store);
		view2.dispatch({ type: 'startOverRequested' });

		expect(store.state.magicLinkSignIn).toBeNull();
		expect(store.state.login?.status).toBe('idle');
	});

	it('restartMagicLinkSignIn retires live owner and drops late response', async () => {
		const auth = createAuthFeature();
		const { deps, signInWithMagicLinks } = controlledAuthDeps();
		const store = createAuthStore(auth, deps);

		store.dispatch({ type: 'openMagicLinkSignIn', token: 'old-token' });
		const oldView = magicSignInView(auth, store);
		const stale = await submitMagicSignIn(oldView, signInWithMagicLinks);

		store.dispatch({ type: 'restartMagicLinkSignIn', token: 'new-token' });
		expect(stale.signal?.aborted).toBe(true);
		expect(oldView.state).toBeUndefined();

		const freshView = magicSignInView(auth, store);
		const fresh = await submitMagicSignIn(freshView, signInWithMagicLinks);
		expect(fresh.token).toBe('new-token');

		stale.resolve(mallory);
		fresh.resolve(bob);
		await settle();

		expect(store.state.session.subject.kind === 'authenticated' && store.state.session.subject.id).toBe(bob.subject_id);
		expect(store.state.handoff).toEqual({ kind: 'accepted', source: 'magicLinkSignIn', session: bob });
		expect(store.state.magicLinkSignIn).toBeNull();
	});

	it('replaying signInSucceeded into idle state does not establish session or pulse', async () => {
		const auth = createAuthFeature();
		const { deps } = controlledAuthDeps();
		const store = createAuthStore(auth, deps);
		store.dispatch({ type: 'openMagicLinkSignIn', token: 'token-idle' });

		// Dispatching signInSucceeded while idle (no request in flight)
		store.dispatch({
			type: 'magicLinkSignIn',
			action: {
				type: 'presented',
				action: { type: 'signInSucceeded', session: mallory }
			}
		});
		await settle();

		expect(store.state.session.subject.kind).toBe('anonymous');
		expect(store.state.handoff).toBeNull();
		expect(store.state.magicLinkOutcome).toBeNull();
		expect(store.state.magicLinkSignIn?.status).toBe('idle');
	});

	it('magic-link sign-in refuses requestNewLinkRequested and startOverRequested while submitting', async () => {
		const auth = createAuthFeature();
		const { deps, signInWithMagicLinks } = controlledAuthDeps();
		const store = createAuthStore(auth, deps);

		store.dispatch({ type: 'openMagicLinkSignIn', token: 'active-token' });
		const view = magicSignInView(auth, store);
		const inflight = await submitMagicSignIn(view, signInWithMagicLinks);

		expect(store.state.magicLinkSignIn?.status).toBe('submitting');

		// Attempt to navigate while submitting
		view.dispatch({ type: 'requestNewLinkRequested' });
		expect(store.state.magicLinkSignIn?.status).toBe('submitting');
		expect(store.state.magicLinkRequest).toBeNull();

		view.dispatch({ type: 'startOverRequested' });
		expect(store.state.magicLinkSignIn?.status).toBe('submitting');
		expect(store.state.login).toBeNull();

		// Complete the submission
		inflight.resolve(bob);
		await settle();

		expect(store.state.session.subject.kind === 'authenticated' && store.state.session.subject.id).toBe(bob.subject_id);
		expect(store.state.magicLinkSignIn).toBeNull();
	});

	it('replacing token via tokenProvided while submitting cancels in-flight effect and drops late success', async () => {
		const auth = createAuthFeature();
		const { deps, signInWithMagicLinks } = controlledAuthDeps();
		const store = createAuthStore(auth, deps);

		store.dispatch({ type: 'openMagicLinkSignIn', token: 'token-old-1' });
		const view = magicSignInView(auth, store);
		const oldExchange = await submitMagicSignIn(view, signInWithMagicLinks);
		expect(store.state.magicLinkSignIn?.status).toBe('submitting');

		// Replace token while submitting on same view
		view.dispatch({ type: 'tokenProvided', token: 'token-new-1' });
		expect(oldExchange.signal?.aborted).toBe(true);
		expect(store.state.magicLinkSignIn?.status).toBe('idle');
		expect(store.state.magicLinkSignIn?.token).toBe('token-new-1');

		// Old exchange finishes late with mallory's session
		oldExchange.resolve(mallory);
		await settle();
		expect(store.state.session.subject.kind).toBe('anonymous');
		expect(store.state.handoff).toBeNull();
		expect(store.state.magicLinkOutcome).toBeNull();
		expect(store.state.magicLinkSignIn?.status).toBe('idle');

		// New exchange on replacement token succeeds and is accepted
		const newExchange = await submitMagicSignIn(view, signInWithMagicLinks);
		expect(newExchange.token).toBe('token-new-1');
		newExchange.resolve(bob);
		await settle();
		expect(store.state.session.subject.kind === 'authenticated' && store.state.session.subject.id).toBe(bob.subject_id);
		expect(store.state.handoff).toEqual({ kind: 'accepted', source: 'magicLinkSignIn', session: bob });
		expect(store.state.magicLinkOutcome).toEqual({ kind: 'signedIn' });
		expect(store.state.magicLinkSignIn).toBeNull();
	});

	it('replacing token via tokenProvided while submitting cancels in-flight effect and drops late mfa_required', async () => {
		const auth = createAuthFeature();
		const { deps, signInWithMagicLinks } = controlledAuthDeps();
		const store = createAuthStore(auth, deps);

		store.dispatch({ type: 'openMagicLinkSignIn', token: 'token-old-2' });
		const view = magicSignInView(auth, store);
		const oldExchange = await submitMagicSignIn(view, signInWithMagicLinks);

		// Replace token while submitting on same view
		view.dispatch({ type: 'tokenProvided', token: 'token-new-2' });
		expect(oldExchange.signal?.aborted).toBe(true);
		expect(store.state.magicLinkSignIn?.status).toBe('idle');
		expect(store.state.magicLinkSignIn?.token).toBe('token-new-2');

		// Old exchange rejects late with mfa_required
		oldExchange.reject({ code: 'mfa_required', message: 'MFA', challengeId: 'chal-old', methods: ['totp'] });
		await settle();
		expect(store.state.mfa).toBeNull();
		expect(store.state.magicLinkOutcome).toBeNull();
		expect(store.state.magicLinkSignIn?.status).toBe('idle');

		// New exchange on replacement token succeeds and is accepted
		const newExchange = await submitMagicSignIn(view, signInWithMagicLinks);
		expect(newExchange.token).toBe('token-new-2');
		newExchange.resolve(bob);
		await settle();
		expect(store.state.session.subject.kind === 'authenticated' && store.state.session.subject.id).toBe(bob.subject_id);
		expect(store.state.magicLinkSignIn).toBeNull();
	});

	it('replacing token via tokenProvided while submitting cancels in-flight effect and drops late token_expired', async () => {
		const auth = createAuthFeature();
		const { deps, signInWithMagicLinks } = controlledAuthDeps();
		const store = createAuthStore(auth, deps);

		store.dispatch({ type: 'openMagicLinkSignIn', token: 'token-old-3' });
		const view = magicSignInView(auth, store);
		const oldExchange = await submitMagicSignIn(view, signInWithMagicLinks);

		// Replace token while submitting on same view
		view.dispatch({ type: 'tokenProvided', token: 'token-new-3' });
		expect(oldExchange.signal?.aborted).toBe(true);
		expect(store.state.magicLinkSignIn?.status).toBe('idle');
		expect(store.state.magicLinkSignIn?.token).toBe('token-new-3');

		// Old exchange rejects late with token_expired
		oldExchange.reject({ code: 'token_expired', message: 'Expired' });
		await settle();
		expect(store.state.magicLinkSignIn?.status).toBe('idle');
		expect(store.state.magicLinkSignIn?.error).toBeNull();

		// New exchange on replacement token succeeds and is accepted
		const newExchange = await submitMagicSignIn(view, signInWithMagicLinks);
		expect(newExchange.token).toBe('token-new-3');
		newExchange.resolve(ada);
		await settle();
		expect(store.state.session.subject.kind === 'authenticated' && store.state.session.subject.id).toBe(ada.subject_id);
		expect(store.state.magicLinkSignIn).toBeNull();
	});
});

describe('public surface', () => {
	it('is the same factory from the root barrel and the application entry', () => {
		expect(root.createAuthFeature).toBe(createAuthFeature);
	});

	it('mints genuine, per-feature slots and a fresh initial state', () => {
		const a = createAuthFeature();
		const b = createAuthFeature();
		expect(a.loginSlot).not.toBe(b.loginSlot);
		expect(a.composition).not.toBe(b.composition);
		expect(a.initialState()).toEqual({
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
			handoff: null,
			mfaOutcome: null,
			oauthOutcome: null,
			magicLinkOutcome: null,
			connectedAccountsOutcome: null,
			changeEmailOutcome: null,
			changeEmailConfirmOutcome: null,
			changePasswordOutcome: null,
			deleteAccountOutcome: null,
			sessionRefresh: null,
			sessionRefreshOutcome: null
		});
		expect(a.initialState()).not.toBe(a.initialState());
		expect(a.signupSlot).not.toBe(b.signupSlot);
		expect(a.oauthStartSlot).not.toBe(b.oauthStartSlot);
		expect(a.oauthCallbackSlot).not.toBe(b.oauthCallbackSlot);
		expect(a.magicLinkRequestSlot).not.toBe(b.magicLinkRequestSlot);
		expect(a.magicLinkSignInSlot).not.toBe(b.magicLinkSignInSlot);
		expect(a.accountSlot).not.toBe(b.accountSlot);
		expect(a.connectedAccountsSlot).not.toBe(b.connectedAccountsSlot);
		expect(a.changeEmailSlot).not.toBe(b.changeEmailSlot);
		expect(a.changeEmailConfirmSlot).not.toBe(b.changeEmailConfirmSlot);
		expect(a.changePasswordSlot).not.toBe(b.changePasswordSlot);
		expect(a.deleteAccountSlot).not.toBe(b.deleteAccountSlot);
		expect(a.sessionRefreshSlot).not.toBe(b.sessionRefreshSlot);

		const store = createAuthStore(a, controlledAuthDeps().deps);
		expect(a.composition.bind(store, a.loginSlot)).toBeUndefined();
		store.dispatch({ type: 'openLogin' });
		const view = a.composition.bind(store, a.loginSlot);
		expect(view?.state?.status).toBe('idle');
		view!.dismiss();
		expect(store.state.login).toBeNull();
	});

	it('types the catalog, slots and dependencies exactly', () => {
		const auth = createAuthFeature();
		expectTypeOf(auth.composition).toEqualTypeOf<
			ManagedComposition<AuthFeatureState, AuthFeatureAction, AuthFeatureDependencies, AuthFeatureCatalog>
		>();
		expectTypeOf<keyof ViewDeclarations<AuthFeatureCatalog>>().toEqualTypeOf<
			| 'login'
			| 'mfa'
			| 'signup'
			| 'forgotPassword'
			| 'resetPassword'
			| 'emailVerification'
			| 'mfaEnrolment'
			| 'mfaManagement'
			| 'oauthStart'
			| 'oauthCallback'
			| 'magicLinkRequest'
			| 'magicLinkSignIn'
			| 'account'
			| 'connectedAccounts'
			| 'changeEmail'
			| 'changeEmailConfirm'
			| 'changePassword'
			| 'deleteAccount'
			| 'sessionRefresh'
		>();
		expectTypeOf<AuthFeatureCatalog['sessionRefresh']['state']>().toEqualTypeOf<SessionRefreshState>();
		expectTypeOf<AuthFeatureCatalog['sessionRefresh']['action']>().toEqualTypeOf<SessionRefreshAction>();
		expectTypeOf<AuthFeatureCatalog['mfaEnrolment']['state']>().toEqualTypeOf<MfaEnrolmentState>();
		expectTypeOf<AuthFeatureCatalog['mfaEnrolment']['action']>().toEqualTypeOf<MfaEnrolmentAction>();
		expectTypeOf<AuthFeatureCatalog['mfaManagement']['state']>().toEqualTypeOf<MfaManagementState>();
		expectTypeOf<AuthFeatureCatalog['mfaManagement']['action']>().toEqualTypeOf<MfaManagementAction>();
		expectTypeOf<AuthFeatureCatalog['oauthStart']['state']>().toEqualTypeOf<OAuthStartState>();
		expectTypeOf<AuthFeatureCatalog['oauthStart']['action']>().toEqualTypeOf<OAuthStartAction>();
		expectTypeOf<AuthFeatureCatalog['oauthCallback']['state']>().toEqualTypeOf<OAuthCallbackState>();
		expectTypeOf<AuthFeatureCatalog['oauthCallback']['action']>().toEqualTypeOf<OAuthCallbackAction>();
		expectTypeOf<AuthFeatureCatalog['magicLinkRequest']['state']>().toEqualTypeOf<MagicLinkRequestState>();
		expectTypeOf<AuthFeatureCatalog['magicLinkRequest']['action']>().toEqualTypeOf<MagicLinkRequestAction>();
		expectTypeOf<AuthFeatureCatalog['magicLinkSignIn']['state']>().toEqualTypeOf<MagicLinkSignInState>();
		expectTypeOf<AuthFeatureCatalog['magicLinkSignIn']['action']>().toEqualTypeOf<MagicLinkSignInAction>();
		expectTypeOf<AuthFeatureCatalog['account']['state']>().toEqualTypeOf<AccountState>();
		expectTypeOf<AuthFeatureCatalog['account']['action']>().toEqualTypeOf<AccountAction>();
		expectTypeOf<AuthFeatureCatalog['connectedAccounts']['state']>().toEqualTypeOf<ConnectedAccountsState>();
		expectTypeOf<AuthFeatureCatalog['connectedAccounts']['action']>().toEqualTypeOf<ConnectedAccountsAction>();
		expectTypeOf<AuthFeatureCatalog['changeEmail']['state']>().toEqualTypeOf<ChangeEmailState>();
		expectTypeOf<AuthFeatureCatalog['changeEmail']['action']>().toEqualTypeOf<ChangeEmailAction>();
		expectTypeOf<AuthFeatureCatalog['changeEmailConfirm']['state']>().toEqualTypeOf<ChangeEmailConfirmState>();
		expectTypeOf<AuthFeatureCatalog['changeEmailConfirm']['action']>().toEqualTypeOf<ChangeEmailConfirmAction>();
		expectTypeOf<AuthFeatureCatalog['changePassword']['state']>().toEqualTypeOf<ChangePasswordState>();
		expectTypeOf<AuthFeatureCatalog['changePassword']['action']>().toEqualTypeOf<ChangePasswordAction>();
		expectTypeOf<AuthFeatureCatalog['deleteAccount']['state']>().toEqualTypeOf<DeleteAccountState>();
		expectTypeOf<AuthFeatureCatalog['deleteAccount']['action']>().toEqualTypeOf<DeleteAccountAction>();
		expectTypeOf<AuthFeatureCatalog['login']['state']>().toEqualTypeOf<LoginState>();
		expectTypeOf<AuthFeatureCatalog['login']['action']>().toEqualTypeOf<LoginAction>();
		expectTypeOf<AuthFeatureCatalog['login']['presentation']>().toEqualTypeOf<true>();
		expectTypeOf<AuthFeatureCatalog['mfa']['state']>().toEqualTypeOf<MfaChallengeState>();
		expectTypeOf<AuthFeatureCatalog['mfa']['action']>().toEqualTypeOf<MfaChallengeAction>();
		expectTypeOf<AuthFeatureCatalog['mfa']['children']>().toEqualTypeOf<{}>();
		expectTypeOf<AuthFeatureCatalog['signup']['state']>().toEqualTypeOf<SignupState>();
		expectTypeOf<AuthFeatureCatalog['signup']['action']>().toEqualTypeOf<SignupAction>();
		expectTypeOf<AuthFeatureCatalog['signup']['presentation']>().toEqualTypeOf<true>();
		expectTypeOf<AuthFeatureCatalog['signup']['children']>().toEqualTypeOf<{}>();
		expectTypeOf<AuthFeatureCatalog['forgotPassword']['state']>().toEqualTypeOf<ForgotPasswordState>();
		expectTypeOf<AuthFeatureCatalog['forgotPassword']['action']>().toEqualTypeOf<ForgotPasswordAction>();
		expectTypeOf<AuthFeatureCatalog['resetPassword']['state']>().toEqualTypeOf<ResetPasswordState>();
		expectTypeOf<AuthFeatureCatalog['resetPassword']['action']>().toEqualTypeOf<ResetPasswordAction>();
		expectTypeOf<AuthFeatureCatalog['emailVerification']['state']>().toEqualTypeOf<EmailVerificationState>();
		expectTypeOf<AuthFeatureCatalog['emailVerification']['action']>().toEqualTypeOf<EmailVerificationAction>();

		expectTypeOf(auth.loginSlot).toMatchTypeOf<SlotHandle<AuthFeatureState, AuthFeatureAction, LoginState, LoginAction>>();
		const bindMfa = (store: AuthStore) => auth.composition.bind(store, auth.mfaSlot);
		expectTypeOf(bindMfa).returns.toEqualTypeOf<
			PresentationView<MfaChallengeState, MfaChallengeAction> | undefined
		>();
		const bindSignup = (store: AuthStore) => auth.composition.bind(store, auth.signupSlot);
		expectTypeOf(bindSignup).returns.toEqualTypeOf<PresentationView<SignupState, SignupAction> | undefined>();

		expectTypeOf<AuthFeatureDependencies>().toEqualTypeOf<
			SessionDependencies &
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
					linkOAuthProvider?: AuthDependencies['linkOAuthProvider'] | undefined;
					pendingOAuth?: PendingOAuthStorage | undefined;
					redirect?: Redirect | undefined;
				}
		>();
		expectTypeOf<AuthFeatureDependencies>().toHaveProperty('beginMfaEnrolment');
		expectTypeOf<AuthFeatureDependencies>().toHaveProperty('disableMfa');
		expectTypeOf<AuthFeatureDependencies>().toHaveProperty('fetchAccount');
		expectTypeOf<AuthFeatureDependencies>().toHaveProperty('unlinkOAuthProvider');
		expectTypeOf<AuthFeatureDependencies>().toHaveProperty('requestEmailChange');
		expectTypeOf<AuthFeatureDependencies>().toHaveProperty('resendEmailChange');
		expectTypeOf<AuthFeatureDependencies>().toHaveProperty('confirmEmailChange');
		expectTypeOf<AuthFeatureDependencies>().toHaveProperty('changePassword');
		expectTypeOf<AuthFeatureDependencies>().toHaveProperty('deleteAccount');
		expectTypeOf<AuthDependencies>().toMatchTypeOf<AuthFeatureDependencies>();
		expectTypeOf<AuthFeatureDependencies>().toHaveProperty('signup');
		expectTypeOf<AuthFeatureDependencies>().toHaveProperty('requestPasswordReset');
		expectTypeOf<AuthFeatureDependencies>().toHaveProperty('resetPassword');
		expectTypeOf<AuthFeatureDependencies>().toHaveProperty('verifyEmail');
		expectTypeOf<AuthFeatureDependencies>().toHaveProperty('beginOAuth');
		expectTypeOf<AuthFeatureDependencies>().toHaveProperty('completeOAuth');
		expectTypeOf<AuthFeatureDependencies>().toHaveProperty('requestMagicLink');
		expectTypeOf<AuthFeatureDependencies>().toHaveProperty('signInWithMagicLink');
		expectTypeOf<AuthHandoff['source']>().toEqualTypeOf<
			| 'login'
			| 'mfa'
			| 'signup'
			| 'resetPassword'
			| 'emailVerification'
			| 'oauthCallback'
			| 'magicLinkSignIn'
			| 'changePassword'
		>();
		expectTypeOf<AuthFeatureState['handoff']>().toEqualTypeOf<AuthHandoff | null>();
		expectTypeOf<Extract<AuthHandoff, { kind: 'refused' }>['reason']>().toEqualTypeOf<'loggingOut'>();
		expectTypeOf<AuthFeatureState>().not.toHaveProperty('route');
	});
});
