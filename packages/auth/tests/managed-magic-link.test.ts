/**
 * Managed magic-link request and sign-in flows mounted through `ManagedAuthRecipe`.
 *
 * Covers:
 * - Request -> sent: email submission, conditional sent state, and parent magicLinkOutcome pulse.
 * - Request -> navigation: "Back to sign in" routes to fresh login form.
 * - Sign-in -> exchange: token is NOT spent on mount or GET; user press initiates exchange.
 * - Sign-in -> session handoff: accepted session hands over to persistent feature, pulses handoff and magicLinkOutcome.
 * - Sign-in -> MFA required branch: transitions to live MFA challenge form for accepted backend response.
 * - Sign-in -> missing/expired token: displays helpful error and offers "Send me a new link" or "Sign in another way".
 * - Route navigation: requestNewLinkRequested routes to magicLinkRequest; startOverRequested routes to login.
 * - Owner retirement & late-result drops: cancellation, restart, and logout discard in-flight feedback.
 * - Sibling independence: two mounted auth instances do not interfere with each other.
 * - Replay prevention: settled sign-ins ignore repeated exchange actions.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { createStore, Effect, type PresentationAction, type Store } from '@composable-svelte/core';
import { ManagedIntegrationBuilder, optionalSlot } from '@composable-svelte/core/application';

import ManagedAuthRecipe from './test-components/ManagedAuthRecipe.svelte';
import {
	createAuthFeature,
	type AuthFeature,
	type AuthFeatureAction,
	type AuthFeatureDependencies,
	type AuthFeatureState,
	type AuthMagicLinkOutcome
} from '../src/lib/application/index.js';
import {
	createInitialMagicLinkRequestState,
	createInitialMagicLinkSignInState
} from '../src/lib/flows/index.js';
import { createInitialSessionState, type SessionState } from '../src/lib/session/index.js';
import { controlledAuthDeps, settle, snapshot } from './fixtures/managed-auth-drivers.js';

type AuthStore = Store<AuthFeatureState, AuthFeatureAction>;

const ada = snapshot('00000000-0000-4000-8000-000000000001', 'Ada Lovelace');
const bob = snapshot('00000000-0000-4000-8000-000000000002', 'Bob Babbage');

function authenticatedSubjectId(session: SessionState | null | undefined): string | null {
	return session?.subject.kind === 'authenticated' ? session.subject.id : null;
}

const cleanups: Array<() => void> = [];
afterEach(() => {
	for (const cleanup of cleanups.splice(0).reverse()) cleanup();
	vi.restoreAllMocks();
});

function createAuthStore(
	auth: AuthFeature,
	deps: AuthFeatureDependencies,
	initialState?: Partial<AuthFeatureState>
): AuthStore {
	const store = createStore({
		initialState: {
			...auth.initialState(),
			...initialState
		},
		reducer: auth.composition.reducer,
		execution: auth.composition.execution,
		dependencies: deps
	});
	cleanups.push(() => store.destroy());
	return store;
}

function mountRecipe(auth: AuthFeature, store: AuthStore) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const component = mount(ManagedAuthRecipe, {
		target,
		props: { auth, store }
	});
	cleanups.push(() => {
		unmount(component);
		target.remove();
	});
	return { target, component };
}

describe('managed magic-link request flow mounted through ManagedAuthRecipe', () => {
	it('submits email, updates sent message, pulses outcome, and stays visible for re-requests', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps, {
			magicLinkRequest: createInitialMagicLinkRequestState()
		});
		const { target } = mountRecipe(auth, store);

		const emailInput = target.querySelector<HTMLInputElement>('.magic-request__input');
		const submitButton = target.querySelector<HTMLButtonElement>('.magic-request__submit');
		expect(emailInput).not.toBeNull();
		expect(submitButton).not.toBeNull();

		// Enter email and submit
		emailInput!.value = 'grace@example.com';
		emailInput!.dispatchEvent(new Event('input', { bubbles: true }));
		flushSync();
		submitButton!.click();
		flushSync();

		await vi.waitFor(() => {
			expect(driver.requestMagicLinks).toHaveLength(1);
			expect(driver.requestMagicLinks[0]!.email).toBe('grace@example.com');
		});

		expect(store.state.magicLinkRequest?.status).toBe('submitting');
		expect(submitButton!.disabled).toBe(true);

		// Resolve the request
		driver.requestMagicLinks[0]!.resolve();
		await settle();
		flushSync();

		// Outcome pulsed once
		expect(store.state.magicLinkOutcome).toEqual({ kind: 'requestSent', email: 'grace@example.com' });
		expect(store.state.magicLinkRequest?.status).toBe('sent');
		expect(store.state.magicLinkRequest?.requestedFor).toBe('grace@example.com');
		expect(target.querySelector('.magic-request__body')?.textContent).toContain('grace@example.com');

		// Outcome is cleared on next reduction
		store.dispatch({ type: 'openMagicLinkRequest' });
		expect(store.state.magicLinkOutcome).toBeNull();
		// Flow is still live and form is still editable
		expect(target.querySelector('.magic-request__form')).not.toBeNull();
	});

	it('routes back to login when "Back to sign in" is clicked', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps, {
			magicLinkRequest: createInitialMagicLinkRequestState()
		});
		const { target } = mountRecipe(auth, store);

		const backButton = target.querySelector<HTMLButtonElement>('.magic-request__back');
		expect(backButton).not.toBeNull();
		backButton!.click();
		flushSync();

		expect(store.state.magicLinkRequest).toBeNull();
		expect(store.state.login?.status).toBe('idle');
		expect(target.querySelector('.login-form')).not.toBeNull();
	});

	it('retires in-flight request on restart or cancel and drops late response', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps, {
			magicLinkRequest: createInitialMagicLinkRequestState()
		});
		const { target } = mountRecipe(auth, store);

		const emailInput = target.querySelector<HTMLInputElement>('.magic-request__input')!;
		emailInput.value = 'ada@example.com';
		emailInput.dispatchEvent(new Event('input', { bubbles: true }));
		flushSync();
		target.querySelector<HTMLButtonElement>('.magic-request__submit')!.click();
		flushSync();

		await vi.waitFor(() => expect(driver.requestMagicLinks).toHaveLength(1));
		const request = driver.requestMagicLinks[0]!;

		// Restart request flow
		store.dispatch({ type: 'restartMagicLinkRequest' });
		expect(request.signal?.aborted).toBe(true);

		// Late resolve
		request.resolve();
		await settle();
		flushSync();

		expect(store.state.magicLinkOutcome).toBeNull();
		expect(store.state.magicLinkRequest?.status).toBe('idle');
	});
});

describe('managed magic-link sign-in flow mounted through ManagedAuthRecipe', () => {
	it('does NOT spend token on mount; user click starts exchange and hands session to feature', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps, {
			magicLinkSignIn: createInitialMagicLinkSignInState('valid-token-123')
		});
		const { target } = mountRecipe(auth, store);

		// Critical invariant: token must NOT be spent on mount or GET
		await settle();
		expect(driver.signInWithMagicLinks, 'zero requests on mount').toHaveLength(0);
		expect(store.state.magicLinkSignIn?.status).toBe('idle');

		const signInButton = target.querySelector<HTMLButtonElement>('.magic-signin__action');
		expect(signInButton).not.toBeNull();
		expect(signInButton!.textContent).toContain('Sign in');

		// Explicit user press initiates exchange
		signInButton!.click();
		flushSync();

		await vi.waitFor(() => {
			expect(driver.signInWithMagicLinks).toHaveLength(1);
			expect(driver.signInWithMagicLinks[0]!.token).toBe('valid-token-123');
		});

		expect(store.state.magicLinkSignIn?.status).toBe('submitting');

		// Resolve with authenticated session
		driver.signInWithMagicLinks[0]!.resolve(ada);
		await settle();
		flushSync();

		// Session established, handoff and magicLinkOutcome pulsed
		expect(authenticatedSubjectId(store.state.session)).toBe(ada.subject_id);
		expect(store.state.handoff).toEqual({
			kind: 'accepted',
			source: 'magicLinkSignIn',
			session: ada
		});
		expect(store.state.magicLinkOutcome).toEqual({ kind: 'signedIn' });
		expect(store.state.magicLinkSignIn).toBeNull();
		expect(target.querySelector('.magic-signin')).toBeNull();
	});

	it('routes to managed MFA challenge when backend responds mfa_required', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps, {
			magicLinkSignIn: createInitialMagicLinkSignInState('mfa-token-456')
		});
		const { target } = mountRecipe(auth, store);

		target.querySelector<HTMLButtonElement>('.magic-signin__action')!.click();
		flushSync();

		await vi.waitFor(() => expect(driver.signInWithMagicLinks).toHaveLength(1));

		// Reject with MFA required
		driver.signInWithMagicLinks[0]!.reject({
			code: 'mfa_required',
			message: 'Second factor required',
			challengeId: 'challenge-ml-1',
			methods: ['totp']
		});
		await settle();
		flushSync();

		// Managed MFA challenge is presented, magicLinkSignIn retired
		expect(store.state.magicLinkSignIn).toBeNull();
		expect(store.state.mfa).not.toBeNull();
		expect(store.state.mfa?.challengeId).toBe('challenge-ml-1');
		expect(store.state.magicLinkOutcome).toEqual({
			kind: 'mfaRequired',
			challengeId: 'challenge-ml-1',
			methods: ['totp']
		});
		expect(target.querySelector('.mfa-challenge')).not.toBeNull();

		// Completing MFA establishes session
		const codeInput = target.querySelector<HTMLInputElement>('.mfa-challenge__field input');
		expect(codeInput).not.toBeNull();
		codeInput!.value = '123456';
		codeInput!.dispatchEvent(new Event('input', { bubbles: true }));
		flushSync();
		target.querySelector<HTMLButtonElement>('.mfa-challenge__submit')!.click();
		flushSync();

		await vi.waitFor(() => expect(driver.challenges).toHaveLength(1));
		driver.challenges[0]!.resolve(ada);
		await settle();
		flushSync();

		expect(authenticatedSubjectId(store.state.session)).toBe(ada.subject_id);
		expect(store.state.mfa).toBeNull();
	});

	it('handles missing token with helpful view and routes to request or login', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps, {
			magicLinkSignIn: createInitialMagicLinkSignInState(null)
		});
		const { target } = mountRecipe(auth, store);

		expect(target.textContent).toContain('Nothing to sign in with');
		const sendNewLinkBtn = target.querySelector<HTMLButtonElement>('.magic-signin__action');
		expect(sendNewLinkBtn).not.toBeNull();
		expect(sendNewLinkBtn!.textContent).toContain('Send me a new link');

		// Clicking "Send me a new link" dispatches requestNewLinkRequested -> routes to magicLinkRequest
		sendNewLinkBtn!.click();
		flushSync();

		expect(store.state.magicLinkSignIn).toBeNull();
		expect(store.state.magicLinkRequest?.status).toBe('idle');
		expect(target.querySelector('.magic-request')).not.toBeNull();

		// From request form, clicking "Back to sign in" returns to login
		target.querySelector<HTMLButtonElement>('.magic-request__back')!.click();
		flushSync();

		expect(store.state.magicLinkRequest).toBeNull();
		expect(store.state.login?.status).toBe('idle');
		expect(target.querySelector('.login-form')).not.toBeNull();
	});

	it('handles expired token: displays error, offers "Send me a new link"', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps, {
			magicLinkSignIn: createInitialMagicLinkSignInState('expired-token')
		});
		const { target } = mountRecipe(auth, store);

		target.querySelector<HTMLButtonElement>('.magic-signin__action')!.click();
		flushSync();

		await vi.waitFor(() => expect(driver.signInWithMagicLinks).toHaveLength(1));
		driver.signInWithMagicLinks[0]!.reject({
			code: 'token_expired',
			message: 'This magic link has expired'
		});
		await settle();
		flushSync();

		expect(store.state.magicLinkSignIn?.status).toBe('idle');
		expect(store.state.magicLinkSignIn?.error?.code).toBe('token_expired');
		expect(target.textContent).toContain('That link has expired');
		expect(target.textContent).toContain('This magic link has expired');

		// Click "Send me a new link"
		target.querySelector<HTMLButtonElement>('.magic-signin__action')!.click();
		flushSync();

		expect(store.state.magicLinkSignIn).toBeNull();
		expect(store.state.magicLinkRequest?.status).toBe('idle');
	});

	it('routes to login when "Sign in another way" is clicked', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps, {
			magicLinkSignIn: createInitialMagicLinkSignInState('some-token')
		});
		const { target } = mountRecipe(auth, store);

		const backButton = target.querySelector<HTMLButtonElement>('.magic-signin__back');
		expect(backButton).not.toBeNull();
		backButton!.click();
		flushSync();

		expect(store.state.magicLinkSignIn).toBeNull();
		expect(store.state.login?.status).toBe('idle');
		expect(target.querySelector('.login-form')).not.toBeNull();
	});

	it('retires in-flight sign-in on restart or logout and drops late response', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps, {
			magicLinkSignIn: createInitialMagicLinkSignInState('stale-token')
		});
		const { target } = mountRecipe(auth, store);

		target.querySelector<HTMLButtonElement>('.magic-signin__action')!.click();
		flushSync();

		await vi.waitFor(() => expect(driver.signInWithMagicLinks).toHaveLength(1));
		const request = driver.signInWithMagicLinks[0]!;

		// Logout retires all temporary flows
		store.dispatch({ type: 'session', action: { type: 'logout' } });
		expect(request.signal?.aborted).toBe(true);

		// Late resolve should not authenticate
		request.resolve(bob);
		await settle();
		flushSync();

		expect(store.state.magicLinkSignIn).toBeNull();
		expect(authenticatedSubjectId(store.state.session)).toBeNull();
		expect(store.state.handoff).toBeNull();
	});

	it('disables route buttons in markup and refuses route actions while submitting', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps, {
			magicLinkSignIn: createInitialMagicLinkSignInState('test-token')
		});
		const { target } = mountRecipe(auth, store);

		const actionBtn = target.querySelector<HTMLButtonElement>('.magic-signin__action')!;
		actionBtn.click();
		flushSync();

		expect(store.state.magicLinkSignIn?.status).toBe('submitting');
		await vi.waitFor(() => expect(driver.signInWithMagicLinks).toHaveLength(1));

		// Check navigation button is disabled
		const backBtn = target.querySelector<HTMLButtonElement>('.magic-signin__back')!;
		expect(backBtn).not.toBeNull();
		expect(backBtn.disabled).toBe(true);

		// Click disabled back button: should do nothing
		backBtn.click();
		flushSync();
		expect(store.state.magicLinkSignIn?.status).toBe('submitting');
		expect(store.state.login).toBeNull();

		// Complete the submission
		driver.signInWithMagicLinks[0]!.resolve(bob);
		await settle();
		flushSync();

		expect(authenticatedSubjectId(store.state.session)).toBe(bob.subject_id);
		expect(store.state.magicLinkSignIn).toBeNull();
	});

	it('prevents replay of signInSucceeded into idle or settled flow', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps, {
			magicLinkSignIn: createInitialMagicLinkSignInState('token-replay')
		});
		const { target } = mountRecipe(auth, store);

		// 1. Replay into idle flow (no in-flight request) must be refused
		store.dispatch({
			type: 'magicLinkSignIn',
			action: {
				type: 'presented',
				action: { type: 'signInSucceeded', session: mallorySession }
			}
		});
		await settle();

		expect(store.state.magicLinkSignIn?.status).toBe('idle');
		expect(authenticatedSubjectId(store.state.session)).toBeNull();
		expect(store.state.handoff).toBeNull();
		expect(store.state.magicLinkOutcome).toBeNull();

		// 2. Legitimate exchange settles to succeeded and hands over to session
		target.querySelector<HTMLButtonElement>('.magic-signin__action')!.click();
		flushSync();
		await vi.waitFor(() => expect(driver.signInWithMagicLinks).toHaveLength(1));
		driver.signInWithMagicLinks[0]!.resolve(ada);
		await settle();
		flushSync();

		expect(authenticatedSubjectId(store.state.session)).toBe(ada.subject_id);
		expect(store.state.magicLinkSignIn).toBeNull(); // flow retired
		expect(store.state.handoff).toEqual({ kind: 'accepted', source: 'magicLinkSignIn', session: ada });

		// 3. Replay into settled/retired flow must be refused, not replacing session or pulsing handoff
		store.dispatch({
			type: 'magicLinkSignIn',
			action: {
				type: 'presented',
				action: { type: 'signInSucceeded', session: mallorySession }
			}
		});
		await settle();

		expect(authenticatedSubjectId(store.state.session)).toBe(ada.subject_id);
		expect(store.state.handoff).toBeNull();
		expect(store.state.magicLinkOutcome).toBeNull();
	});

	it('token replacement on same mounted view while submitting cancels in-flight effect and drops late success, enabling new press', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps, {
			magicLinkSignIn: createInitialMagicLinkSignInState('token-old')
		});
		const { target, component } = mountRecipe(auth, store);

		// Click sign-in for old token
		target.querySelector<HTMLButtonElement>('.magic-signin__action')!.click();
		flushSync();
		expect(store.state.magicLinkSignIn?.status).toBe('submitting');
		await vi.waitFor(() => expect(driver.signInWithMagicLinks).toHaveLength(1));
		const oldRequest = driver.signInWithMagicLinks[0]!;

		// Replace token prop on the same mounted managed view while submitting
		component.setMagicLinkToken('token-new');
		flushSync();

		expect(oldRequest.signal?.aborted).toBe(true);
		expect(store.state.magicLinkSignIn?.status).toBe('idle');
		expect(store.state.magicLinkSignIn?.token).toBe('token-new');

		// Late old request resolves with mallory
		oldRequest.resolve(mallorySession);
		await settle();
		flushSync();

		// Old result must not establish session or retire flow
		expect(authenticatedSubjectId(store.state.session)).toBeNull();
		expect(store.state.handoff).toBeNull();
		expect(store.state.magicLinkSignIn?.status).toBe('idle');

		// New press using the replacement token
		target.querySelector<HTMLButtonElement>('.magic-signin__action')!.click();
		flushSync();
		await vi.waitFor(() => expect(driver.signInWithMagicLinks).toHaveLength(2));
		expect(driver.signInWithMagicLinks[1]!.token).toBe('token-new');

		// New exchange resolves with ada and is accepted
		driver.signInWithMagicLinks[1]!.resolve(ada);
		await settle();
		flushSync();

		expect(authenticatedSubjectId(store.state.session)).toBe(ada.subject_id);
		expect(store.state.magicLinkSignIn).toBeNull();
		expect(store.state.handoff).toEqual({ kind: 'accepted', source: 'magicLinkSignIn', session: ada });
	});

	it('token replacement on same mounted view while submitting cancels in-flight effect and drops late mfa_required', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps, {
			magicLinkSignIn: createInitialMagicLinkSignInState('token-old-mfa')
		});
		const { target, component } = mountRecipe(auth, store);

		target.querySelector<HTMLButtonElement>('.magic-signin__action')!.click();
		flushSync();
		await vi.waitFor(() => expect(driver.signInWithMagicLinks).toHaveLength(1));
		const oldRequest = driver.signInWithMagicLinks[0]!;

		component.setMagicLinkToken('token-new-mfa');
		flushSync();

		expect(oldRequest.signal?.aborted).toBe(true);
		expect(store.state.magicLinkSignIn?.status).toBe('idle');

		// Old request rejects with mfa_required
		oldRequest.reject({ code: 'mfa_required', message: 'MFA', challengeId: 'chal-stale', methods: ['totp'] });
		await settle();
		flushSync();

		expect(store.state.mfa).toBeNull();
		expect(target.querySelector('.mfa-challenge')).toBeNull();
		expect(store.state.magicLinkSignIn?.status).toBe('idle');

		// New press with replacement token succeeds
		target.querySelector<HTMLButtonElement>('.magic-signin__action')!.click();
		flushSync();
		await vi.waitFor(() => expect(driver.signInWithMagicLinks).toHaveLength(2));
		driver.signInWithMagicLinks[1]!.resolve(bob);
		await settle();
		flushSync();

		expect(authenticatedSubjectId(store.state.session)).toBe(bob.subject_id);
		expect(store.state.magicLinkSignIn).toBeNull();
	});

	it('token replacement on same mounted view while submitting cancels in-flight effect and drops late token_expired', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps, {
			magicLinkSignIn: createInitialMagicLinkSignInState('token-old-exp')
		});
		const { target, component } = mountRecipe(auth, store);

		target.querySelector<HTMLButtonElement>('.magic-signin__action')!.click();
		flushSync();
		await vi.waitFor(() => expect(driver.signInWithMagicLinks).toHaveLength(1));
		const oldRequest = driver.signInWithMagicLinks[0]!;

		component.setMagicLinkToken('token-new-exp');
		flushSync();

		expect(oldRequest.signal?.aborted).toBe(true);
		expect(store.state.magicLinkSignIn?.status).toBe('idle');

		// Old request rejects with token_expired
		oldRequest.reject({ code: 'token_expired', message: 'Expired' });
		await settle();
		flushSync();

		expect(store.state.magicLinkSignIn?.error).toBeNull();
		expect(target.textContent).not.toContain('expired');

		// New press with replacement token succeeds
		target.querySelector<HTMLButtonElement>('.magic-signin__action')!.click();
		flushSync();
		await vi.waitFor(() => expect(driver.signInWithMagicLinks).toHaveLength(2));
		driver.signInWithMagicLinks[1]!.resolve(ada);
		await settle();
		flushSync();

		expect(authenticatedSubjectId(store.state.session)).toBe(ada.subject_id);
		expect(store.state.magicLinkSignIn).toBeNull();
	});

	it('maintains complete isolation between two nested auth instances on the same page', async () => {
		const authLeft = createAuthFeature();
		const authRight = createAuthFeature();
		const driverLeft = controlledAuthDeps();
		const driverRight = controlledAuthDeps();

		const storeLeft = createAuthStore(authLeft, driverLeft.deps, {
			magicLinkRequest: createInitialMagicLinkRequestState()
		});
		const storeRight = createAuthStore(authRight, driverRight.deps, {
			magicLinkSignIn: createInitialMagicLinkSignInState('token-right')
		});

		const leftMount = mountRecipe(authLeft, storeLeft);
		const rightMount = mountRecipe(authRight, storeRight);

		// Left is in request flow, Right is in sign-in flow
		expect(leftMount.target.querySelector('.magic-request')).not.toBeNull();
		expect(leftMount.target.querySelector('.magic-signin')).toBeNull();
		expect(rightMount.target.querySelector('.magic-signin')).not.toBeNull();
		expect(rightMount.target.querySelector('.magic-request')).toBeNull();

		// Perform sign-in on Right only
		rightMount.target.querySelector<HTMLButtonElement>('.magic-signin__action')!.click();
		flushSync();

		await vi.waitFor(() => expect(driverRight.signInWithMagicLinks).toHaveLength(1));
		expect(driverLeft.signInWithMagicLinks).toHaveLength(0);

		driverRight.signInWithMagicLinks[0]!.resolve(bob);
		await settle();
		flushSync();

		expect(authenticatedSubjectId(storeRight.state.session)).toBe(bob.subject_id);
		expect(authenticatedSubjectId(storeLeft.state.session)).toBeNull();
		expect(leftMount.target.querySelector('.magic-request')).not.toBeNull();
	});
});

const mallorySession = snapshot('00000000-0000-4000-8000-000000000099', 'Mallory');
