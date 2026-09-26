/**
 * Managed OAuth start and callback flows mounted through `ManagedAuthRecipe`.
 *
 * Covers:
 * - Start -> redirect: provider selection, pending record storage, and browser redirect.
 * - Callback -> sign-in: one-use code exchange, session handoff to parent, and retirement.
 * - Callback -> link: account linking outcome with ZERO session handoff.
 * - Callback -> MFA required branch: transitions to live MFA challenge.
 * - Callback -> denied/state mismatch/corrupt errors: safe error rendering (no attacker errorDescription).
 * - Start over: recovery from failure or empty callback returns to fresh login.
 * - Owner retirement & late-result drops: cancellation, restart, and logout discard in-flight feedback.
 * - Sibling independence: nested auth instances do not interfere with each other.
 * - Replay prevention: settled callbacks ignore repeated exchange actions.
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
	type AuthOAuthOutcome
} from '../src/lib/application/index.js';
import {
	createInitialOAuthStartState,
	createInitialOAuthCallbackState,
	createMemoryPendingOAuthStorage,
	type OAuthCallbackParams,
	type PendingOAuthStorage
} from '../src/lib/flows/index.js';
import { subjectFromSession } from '../src/lib/subject/index.js';
import { createInitialSessionState, type SessionState } from '../src/lib/session/index.js';
import { controlledAuthDeps, settle, snapshot } from './fixtures/managed-auth-drivers.js';

type AuthStore = Store<AuthFeatureState, AuthFeatureAction>;

const ada = snapshot('00000000-0000-4000-8000-000000000001', 'Ada Lovelace');

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

function mountRecipe(
	auth: AuthFeature,
	store: AuthStore,
	callbackParams?: OAuthCallbackParams | null,
	providers?: readonly { id: string; label: string }[]
) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	cleanups.push(() => target.remove());
	const component = mount(ManagedAuthRecipe, {
		target,
		props: { auth, store, callbackParams, providers }
	});
	cleanups.push(() => void unmount(component));
	return { target, component };
}

describe('managed OAuth start and callback flows', () => {
	it('starts OAuth sign-in: records pending state and performs browser redirect', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const pendingOAuth = createMemoryPendingOAuthStorage();
		const store = createAuthStore(auth, { ...driver.deps, pendingOAuth });

		store.dispatch({ type: 'openOAuthStart' });
		const { target } = mountRecipe(auth, store);
		flushSync();

		// Buttons for providers are present
		const buttons = Array.from(target.querySelectorAll('button.oauth-signin__button')) as HTMLButtonElement[];
		const githubBtn = buttons.find((btn) => btn.textContent?.includes('GitHub'));
		expect(githubBtn).toBeDefined();

		githubBtn!.click();
		flushSync();

		expect(driver.beginOAuths.length).toBe(1);
		expect(driver.beginOAuths[0]!.provider).toBe('github');

		driver.beginOAuths[0]!.resolve({
			authorizeUrl: 'https://github.com/login/oauth/authorize?client_id=123&state=st_nonce',
			state: 'st_nonce'
		});
		await settle();

		// Saved pending state with intent signIn
		const record = pendingOAuth.take();
		expect(record).toEqual({
			provider: 'github',
			intent: 'signIn',
			state: 'st_nonce',
			returnTo: null
		});

		// Redirect was called
		expect(driver.redirects).toEqual([
			'https://github.com/login/oauth/authorize?client_id=123&state=st_nonce'
		]);
		// No parent outcome on start
		expect(store.state.oauthOutcome).toBeNull();
	});

	it('completes OAuth callback sign-in: hands over session and emits signedIn outcome', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const pendingOAuth = createMemoryPendingOAuthStorage();
		pendingOAuth.put({
			provider: 'github',
			intent: 'signIn',
			state: 'st_nonce',
			returnTo: '/dashboard'
		});
		const store = createAuthStore(auth, { ...driver.deps, pendingOAuth });

		store.dispatch({ type: 'openOAuthCallback' });
		const { target } = mountRecipe(auth, store, {
			code: 'gh_code_123',
			state: 'st_nonce',
			error: null,
			errorDescription: null
		});
		flushSync();

		await settle();
		expect(driver.completeOAuths.length).toBe(1);
		expect(driver.completeOAuths[0]!).toMatchObject({
			provider: 'github',
			code: 'gh_code_123',
			state: 'st_nonce'
		});

		driver.completeOAuths[0]!.resolve(ada);
		await settle();

		// Session established
		expect(store.state.session.status).toBe('authenticated');
		if (store.state.session.subject.kind !== 'authenticated') throw new Error('not authenticated');
		expect(store.state.session.subject.id).toBe(ada.subject_id);

		// Handoff pulse
		expect(store.state.handoff).toEqual({
			kind: 'accepted',
			source: 'oauthCallback',
			session: ada
		});

		// Parent OAuth outcome
		expect(store.state.oauthOutcome).toEqual({
			kind: 'signedIn',
			returnTo: '/dashboard'
		});

		// Flow retired
		expect(store.state.oauthCallback).toBeNull();
	});

	it('completes OAuth provider link: emits linkCompleted outcome and NEVER establishes a session', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const pendingOAuth = createMemoryPendingOAuthStorage();
		pendingOAuth.put({
			provider: 'google',
			intent: 'link',
			state: 'st_link_nonce',
			returnTo: '/settings/security'
		});

		// Pre-existing authenticated session
		const store = createAuthStore(
			auth,
			{ ...driver.deps, pendingOAuth },
			{
				session: {
					...createInitialSessionState(),
					status: 'authenticated',
					subject: subjectFromSession(ada)
				}
			}
		);

		store.dispatch({ type: 'openOAuthCallback' });
		mountRecipe(auth, store, {
			code: 'goog_code_456',
			state: 'st_link_nonce',
			error: null,
			errorDescription: null
		});
		flushSync();

		await settle();
		expect(driver.linkOAuths.length).toBe(1);
		expect(driver.linkOAuths[0]!).toMatchObject({
			provider: 'google',
			code: 'goog_code_456',
			state: 'st_link_nonce'
		});

		driver.linkOAuths[0]!.resolve();
		await settle();

		// Session is completely untouched
		expect(store.state.session.status).toBe('authenticated');
		if (store.state.session.subject.kind !== 'authenticated') throw new Error('not authenticated');
		expect(store.state.session.subject.id).toBe(ada.subject_id);
		expect(store.state.handoff).toBeNull();

		// Outcome is linkCompleted
		expect(store.state.oauthOutcome).toEqual({
			kind: 'linkCompleted',
			returnTo: '/settings/security'
		});

		// Flow retired
		expect(store.state.oauthCallback).toBeNull();
	});

	it('branches to MFA required from callback: opens MFA challenge slot and emits mfaRequired outcome', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const pendingOAuth = createMemoryPendingOAuthStorage();
		pendingOAuth.put({
			provider: 'github',
			intent: 'signIn',
			state: 'st_mfa_nonce',
			returnTo: null
		});
		const store = createAuthStore(auth, { ...driver.deps, pendingOAuth });

		store.dispatch({ type: 'openOAuthCallback' });
		mountRecipe(auth, store, {
			code: 'gh_code_mfa',
			state: 'st_mfa_nonce',
			error: null,
			errorDescription: null
		});
		flushSync();

		await settle();
		expect(driver.completeOAuths.length).toBe(1);

		driver.completeOAuths[0]!.reject({
			code: 'mfa_required',
			message: 'Two-factor authentication required',
			challengeId: 'chal_999',
			methods: ['totp']
		});
		await settle();

		// Flow switched to MFA challenge
		expect(store.state.oauthCallback).toBeNull();
		expect(store.state.mfa).not.toBeNull();
		expect(store.state.mfa?.challengeId).toBe('chal_999');
		expect(store.state.mfa?.methods).toEqual(['totp']);

		// Parent outcome
		expect(store.state.oauthOutcome).toEqual({
			kind: 'mfaRequired',
			challengeId: 'chal_999',
			methods: ['totp']
		});
	});

	it('handles denied callback: renders cancelled notice and startOver returns to login', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const pendingOAuth = createMemoryPendingOAuthStorage();
		pendingOAuth.put({
			provider: 'github',
			intent: 'signIn',
			state: 'st_denied',
			returnTo: null
		});
		const store = createAuthStore(auth, { ...driver.deps, pendingOAuth });

		store.dispatch({ type: 'openOAuthCallback' });
		const { target } = mountRecipe(auth, store, {
			code: null,
			state: 'st_denied',
			error: 'access_denied',
			errorDescription: 'User denied authorization'
		});
		flushSync();

		await settle();
		expect(store.state.oauthOutcome).toEqual({
			kind: 'failed',
			intent: 'signIn',
			error: expect.objectContaining({ code: 'oauth_denied' })
		});

		expect(target.textContent).toContain('Sign-in cancelled');
		const retryBtn = target.querySelector('button.oauth-callback__action') as HTMLButtonElement;
		expect(retryBtn).not.toBeNull();
		expect(retryBtn.textContent).toContain('Try again');

		// Click Try again
		retryBtn.click();
		flushSync();

		// Transitions to login form
		expect(store.state.oauthCallback).toBeNull();
		expect(store.state.login).not.toBeNull();
		expect(store.state.login?.status).toBe('idle');
	});

	it('refuses to render attacker-supplied errorDescription from URL', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps);

		const attackPayload = 'CALL_1800_SCAM_NOW_<script>alert(1)</script>';
		store.dispatch({ type: 'openOAuthCallback' });
		const { target } = mountRecipe(auth, store, {
			code: null,
			state: 'st_probe',
			error: 'server_error',
			errorDescription: attackPayload
		});
		flushSync();
		await settle();

		expect(target.innerHTML).not.toContain(attackPayload);
		expect(store.state.oauthOutcome?.kind).toBe('failed');
		if (store.state.oauthOutcome?.kind === 'failed') {
			expect(store.state.oauthOutcome.error.message).not.toContain(attackPayload);
		}
	});

	it('handles state mismatch: emits failed outcome and offers start again to login', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const pendingOAuth = createMemoryPendingOAuthStorage();
		// Stored state is different from callback state
		pendingOAuth.put({
			provider: 'github',
			intent: 'signIn',
			state: 'legitimate_state',
			returnTo: null
		});
		const store = createAuthStore(auth, { ...driver.deps, pendingOAuth });

		store.dispatch({ type: 'openOAuthCallback' });
		const { target } = mountRecipe(auth, store, {
			code: 'probe_code',
			state: 'forged_or_stale_state',
			error: null,
			errorDescription: null
		});
		flushSync();
		await settle();

		expect(store.state.oauthOutcome).toEqual({
			kind: 'failed',
			intent: null,
			error: expect.objectContaining({ code: 'oauth_state_mismatch' })
		});

		expect(target.textContent).toContain("We couldn't finish that sign-in");
		const startAgainBtn = target.querySelector('button.oauth-callback__action') as HTMLButtonElement;
		expect(startAgainBtn).not.toBeNull();
		expect(startAgainBtn.textContent).toContain('Start again');

		startAgainBtn.click();
		flushSync();

		expect(store.state.oauthCallback).toBeNull();
		expect(store.state.login).not.toBeNull();
	});

	it('renders empty callback state with back to sign in button', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps);

		store.dispatch({ type: 'openOAuthCallback' });
		const { target } = mountRecipe(auth, store, null);
		flushSync();

		expect(target.textContent).toContain('Nothing to finish here');
		const backBtn = target.querySelector('button.oauth-callback__action') as HTMLButtonElement;
		expect(backBtn).not.toBeNull();
		expect(backBtn.textContent).toContain('Back to sign in');

		backBtn.click();
		flushSync();

		expect(store.state.oauthCallback).toBeNull();
		expect(store.state.login).not.toBeNull();
	});

	it('drops late beginOAuth result after restart or cancellation', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps);

		store.dispatch({ type: 'openOAuthStart' });
		const view1 = auth.composition.bind(store, auth.oauthStartSlot)!;
		view1.dispatch({ type: 'authorizationRequested', provider: 'github', returnTo: null });
		expect(driver.beginOAuths.length).toBe(1);

		// Restart OAuth start (retires owner)
		store.dispatch({ type: 'restartOAuthStart' });
		expect(auth.composition.bind(store, auth.oauthStartSlot)).not.toBe(view1);

		// Late resolution of first request
		driver.beginOAuths[0]!.resolve({
			authorizeUrl: 'https://github.com/login',
			state: 'late_state'
		});
		await settle();

		// No redirect was performed for late result
		expect(driver.redirects.length).toBe(0);
	});

	it('drops late completeOAuth result after logout or restart', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const pendingOAuth = createMemoryPendingOAuthStorage();
		pendingOAuth.put({
			provider: 'github',
			intent: 'signIn',
			state: 'st_owner',
			returnTo: null
		});
		const store = createAuthStore(auth, { ...driver.deps, pendingOAuth });

		store.dispatch({ type: 'openOAuthCallback' });
		const view = auth.composition.bind(store, auth.oauthCallbackSlot)!;
		view.dispatch({
			type: 'callbackReceived',
			params: { code: 'code_late', state: 'st_owner', error: null, errorDescription: null }
		});
		await settle();
		expect(driver.completeOAuths.length).toBe(1);

		// User logs out or flow is closed
		store.dispatch({ type: 'session', action: { type: 'logout' } });
		expect(store.state.oauthCallback).toBeNull();
		if (driver.logouts.length > 0) {
			driver.logouts[0]!.resolve();
			await settle();
		}

		// Late resolve
		driver.completeOAuths[0]!.resolve(ada);
		await settle();

		// Session was NOT authenticated
		expect(store.state.session.status).toBe('anonymous');
		expect(store.state.handoff).toBeNull();
		expect(store.state.oauthOutcome).toBeNull();
	});

	it('keeps link failure visible on mfa_required without presenting MFA challenge or mutating session', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const pendingOAuth = createMemoryPendingOAuthStorage();
		pendingOAuth.put({
			provider: 'github',
			intent: 'link',
			state: 'st_link',
			returnTo: '/profile'
		});
		// Pre-authenticate the session (e.g. user already signed in)
		const store = createAuthStore(
			auth,
			{ ...driver.deps, pendingOAuth },
			{
				session: {
					...createInitialSessionState(),
					status: 'authenticated',
					subject: subjectFromSession(ada)
				}
			}
		);
		expect(store.state.session.status).toBe('authenticated');
		expect(authenticatedSubjectId(store.state.session)).toBe(ada.subject_id);

		// Open OAuth callback for link and mount the recipe
		store.dispatch({ type: 'openOAuthCallback' });
		const { target } = mountRecipe(auth, store, {
			code: 'code_link',
			state: 'st_link',
			error: null,
			errorDescription: null
		});
		flushSync();
		await settle();
		expect(driver.linkOAuths.length).toBe(1);

		// Backend returns mfa_required on link (e.g. step-up required by provider or server policy)
		driver.linkOAuths[0]!.reject({
			code: 'mfa_required',
			message: 'Step up before connecting this account.',
			challengeId: 'link_ch_99',
			methods: ['totp']
		});
		await settle();
		flushSync();

		// MUST NOT open MFA challenge!
		expect(store.state.mfa).toBeNull();
		// MUST NOT hand over a session!
		expect(store.state.handoff).toBeNull();
		// Session must be unchanged!
		expect(store.state.session.status).toBe('authenticated');
		expect(authenticatedSubjectId(store.state.session)).toBe(ada.subject_id);

		// The callback flow must stay visibly failed with intent 'link'
		expect(store.state.oauthCallback?.status).toBe('failed');
		expect(store.state.oauthCallback?.intent).toBe('link');
		expect(store.state.oauthCallback?.error?.code).toBe('mfa_required');

		// Parent outcome emitted is { kind: 'failed', intent: 'link', ... }
		expect(store.state.oauthOutcome).toEqual({
			kind: 'failed',
			intent: 'link',
			error: expect.objectContaining({ code: 'mfa_required' })
		});

		// DOM-level browser assertion for the managed link mfa_required failure panel:
		// 1. Shows "We couldn't connect that account" title (distinguishing link failure)
		const title = target.querySelector('.oauth-callback__title');
		expect(title?.textContent?.trim()).toBe("We couldn't connect that account");
		// 2. Shows the error message with data-error-code="mfa_required"
		const errorEl = target.querySelector('[data-error-code="mfa_required"]');
		expect(errorEl?.textContent?.trim()).toBe('Step up before connecting this account.');
		// 3. Offers "Start again" action button
		const actionBtn = target.querySelector('button.oauth-callback__action') as HTMLButtonElement | null;
		expect(actionBtn?.textContent?.trim()).toBe('Start again');

		// Usable start-over route returns to login when clicked
		actionBtn?.click();
		flushSync();
		expect(store.state.oauthCallback).toBeNull();
		expect(store.state.login?.status).toBe('idle');
	});

	it('normalises returnTo at the callback boundary from custom pending storage, rejecting unsafe external URLs', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const unsafeStorage: PendingOAuthStorage = {
			put: () => {},
			take: () => ({
				provider: 'github',
				intent: 'signIn',
				state: 'st_unsafe',
				returnTo: 'https://evil.example/steal'
			})
		};

		const store = createAuthStore(auth, { ...driver.deps, pendingOAuth: unsafeStorage });
		store.dispatch({ type: 'openOAuthCallback' });
		const view = auth.composition.bind(store, auth.oauthCallbackSlot)!;

		view.dispatch({
			type: 'callbackReceived',
			params: { code: 'code_unsafe', state: 'st_unsafe', error: null, errorDescription: null }
		});
		await settle();
		expect(driver.completeOAuths.length).toBe(1);

		driver.completeOAuths[0]!.resolve(ada);
		await settle();

		expect(store.state.session.status).toBe('authenticated');
		expect(store.state.oauthOutcome).toEqual({
			kind: 'signedIn',
			returnTo: null
		});

		// Link test with unsafe protocol-relative returnTo
		const unsafeLinkStorage: PendingOAuthStorage = {
			put: () => {},
			take: () => ({
				provider: 'github',
				intent: 'link',
				state: 'st_unsafe_link',
				returnTo: '//attacker.example/link-steal'
			})
		};
		const linkStore = createAuthStore(
			auth,
			{ ...driver.deps, pendingOAuth: unsafeLinkStorage },
			{
				session: {
					...createInitialSessionState(),
					status: 'authenticated',
					subject: subjectFromSession(ada)
				}
			}
		);
		linkStore.dispatch({ type: 'openOAuthCallback' });
		const linkView = auth.composition.bind(linkStore, auth.oauthCallbackSlot)!;

		linkView.dispatch({
			type: 'callbackReceived',
			params: { code: 'code_link_unsafe', state: 'st_unsafe_link', error: null, errorDescription: null }
		});
		await settle();
		expect(driver.linkOAuths.length).toBe(1);

		driver.linkOAuths[0]!.resolve();
		await settle();

		expect(linkStore.state.oauthOutcome).toEqual({
			kind: 'linkCompleted',
			returnTo: null
		});
	});

	it('guarantees sibling independence between two nested auth slots under one parent with concurrent operations', async () => {
		const authLeft = createAuthFeature();
		const authRight = createAuthFeature();
		const driver = controlledAuthDeps();

		type ParentState = {
			left: AuthFeatureState | null;
			right: AuthFeatureState | null;
		};
		type ParentAction =
			| { type: 'left'; action: PresentationAction<AuthFeatureAction> }
			| { type: 'right'; action: PresentationAction<AuthFeatureAction> };

		const leftSlot = optionalSlot<ParentState, ParentAction>()('left');
		const rightSlot = optionalSlot<ParentState, ParentAction>()('right');

		const parentComposition = new ManagedIntegrationBuilder<ParentState, ParentAction, AuthFeatureDependencies>(
			(state) => [state, Effect.none()]
		)
			.with(leftSlot, authLeft.composition, { dismissal: 'deferred' })
			.with(rightSlot, authRight.composition, { dismissal: 'deferred' })
			.build();

		const pendingLeft = createMemoryPendingOAuthStorage();
		pendingLeft.put({ provider: 'github', intent: 'signIn', state: 'left_st', returnTo: '/left_dash' });

		const parentStore = createStore<ParentState, ParentAction, AuthFeatureDependencies>({
			initialState: { left: authLeft.initialState(), right: authRight.initialState() },
			reducer: parentComposition.reducer,
			execution: parentComposition.execution,
			dependencies: { ...driver.deps, pendingOAuth: pendingLeft }
		});

		// 1. Concurrently open flows on both siblings
		parentStore.dispatch({ type: 'left', action: { type: 'presented', action: { type: 'openOAuthStart' } } });
		parentStore.dispatch({ type: 'right', action: { type: 'presented', action: { type: 'openLogin' } } });

		expect(parentStore.state.left?.oauthStart?.status).toBe('idle');
		expect(parentStore.state.right?.login?.status).toBe('idle');

		// 2. Concurrently initiate operations on both siblings
		parentStore.dispatch({
			type: 'left',
			action: {
				type: 'presented',
				action: {
					type: 'oauthStart',
					action: { type: 'presented', action: { type: 'authorizationRequested', provider: 'github' } }
				}
			}
		});
		parentStore.dispatch({
			type: 'right',
			action: {
				type: 'presented',
				action: {
					type: 'login',
					action: {
						type: 'presented',
						action: { type: 'form', action: { type: 'submissionStarted' } }
					}
				}
			}
		});
		parentStore.dispatch({
			type: 'right',
			action: {
				type: 'presented',
				action: {
					type: 'login',
					action: {
						type: 'presented',
						action: {
							type: 'form',
							action: {
								type: 'submissionSucceeded',
								submissionId: 1
							}
						}
					}
				}
			}
		});
		await settle();

		// Both operations are in flight concurrently under the same parent store
		expect(driver.beginOAuths.length).toBe(1);
		expect(driver.logins.length).toBe(1);
		expect(parentStore.state.left?.oauthStart?.status).toBe('starting');
		expect(parentStore.state.right?.login?.status).toBe('submitting');

		// 3. Resolve Left's OAuth start
		driver.beginOAuths[0]!.resolve({
			authorizeUrl: 'https://provider.example/authorize?client_id=demo',
			state: 'left_st'
		});
		await settle();

		// Left's redirect happened; Right is still submitting
		expect(driver.redirects.length).toBe(1);
		expect(parentStore.state.left?.oauthStart?.status).toBe('redirecting');
		expect(parentStore.state.right?.login?.status).toBe('submitting');
		expect(parentStore.state.right?.session.status).toBe('unresolved');

		// 4. Resolve Right's login
		driver.logins[0]!.resolve(ada);
		await settle();

		// Right establishes its session and retires its login flow; Left's session is untouched
		expect(parentStore.state.right?.session.status).toBe('authenticated');
		expect(parentStore.state.right?.login).toBeNull();
		expect(parentStore.state.left?.session.status).toBe('unresolved');

		// 5. Left opens OAuth callback while Right remains authenticated
		parentStore.dispatch({ type: 'left', action: { type: 'presented', action: { type: 'restartOAuthCallback' } } });
		expect(parentStore.state.left?.oauthCallback?.status).toBe('idle');

		parentStore.dispatch({
			type: 'left',
			action: {
				type: 'presented',
				action: {
					type: 'oauthCallback',
					action: {
						type: 'presented',
						action: {
							type: 'callbackReceived',
							params: { code: 'left_code', state: 'left_st', error: null, errorDescription: null }
						}
					}
				}
			}
		});
		await settle();
		expect(driver.completeOAuths.length).toBe(1);

		// Resolve Left's callback
		const grace = snapshot('00000000-0000-4000-8000-000000000002', 'Grace Hopper');
		driver.completeOAuths[0]!.resolve(grace);
		await settle();

		// Left established Grace's session; Right preserved Ada's session
		expect(parentStore.state.left?.session.status).toBe('authenticated');
		expect(authenticatedSubjectId(parentStore.state.left?.session)).toBe(grace.subject_id);
		expect(parentStore.state.left?.oauthCallback).toBeNull();

		expect(parentStore.state.right?.session.status).toBe('authenticated');
		expect(authenticatedSubjectId(parentStore.state.right?.session)).toBe(ada.subject_id);
	});

	it('prevents replay: premature results and repeated exchange results do not emit parent outcomes', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const pendingOAuth = createMemoryPendingOAuthStorage();
		pendingOAuth.put({
			provider: 'github',
			intent: 'signIn',
			state: 'st_replay',
			returnTo: null
		});
		const store = createAuthStore(auth, { ...driver.deps, pendingOAuth });

		const outcomes: AuthOAuthOutcome[] = [];
		store.subscribeToActions?.(() => {
			if (store.state.oauthOutcome !== null) outcomes.push(store.state.oauthOutcome);
		});

		// 1. Open callback so owner exists and status is 'idle'
		store.dispatch({ type: 'openOAuthCallback' });
		const view = auth.composition.bind(store, auth.oauthCallbackSlot)!;
		expect(store.state.oauthCallback?.status).toBe('idle');

		// Premature result dispatched while idle (before callbackReceived):
		// must be ignored by child reducer, settled stays null, no parent outcome
		view.dispatch({
			type: 'exchangeFailed',
			error: { code: 'unknown', message: 'premature failure' },
			intent: 'signIn'
		});
		await settle();
		expect(store.state.oauthCallback?.status).toBe('idle');
		expect(store.state.oauthCallback?.settled).toBeNull();
		expect(outcomes.length).toBe(0);

		// 2. Normal callbackReceived: enters 'exchanging'
		view.dispatch({
			type: 'callbackReceived',
			params: { code: 'bad_code', state: 'st_replay', error: null, errorDescription: null }
		});
		await settle();
		expect(driver.completeOAuths.length).toBe(1);

		// Exchange fails
		driver.completeOAuths[0]!.reject({ code: 'token_expired', message: 'Code expired' });
		await settle();

		// Enters 'failed' and reports outcome ONCE
		expect(store.state.oauthCallback?.status).toBe('failed');
		expect(outcomes.length).toBe(1);
		expect(outcomes[0]).toEqual({
			kind: 'failed',
			intent: 'signIn',
			error: expect.objectContaining({ code: 'token_expired' })
		});

		// 3. Repeated exchangeFailed dispatched to the live, failed callback view:
		// Child status is not exchanging, so settled stays null and no second outcome is emitted
		view.dispatch({
			type: 'exchangeFailed',
			error: { code: 'token_expired', message: 'Code expired' },
			intent: 'signIn'
		});
		await settle();
		expect(store.state.oauthCallback?.status).toBe('failed');
		expect(store.state.oauthCallback?.settled).toBeNull();
		expect(outcomes.length).toBe(1);

		// 4. Repeated exchangeSucceeded on live failed callback also does nothing
		view.dispatch({
			type: 'exchangeSucceeded',
			intent: 'signIn',
			session: ada,
			returnTo: null
		});
		await settle();
		expect(store.state.oauthCallback?.status).toBe('failed');
		expect(store.state.session.status).toBe('unresolved');
		expect(outcomes.length).toBe(1);

		// 5. Start over remains usable from the failed callback
		view.dispatch({ type: 'startOverRequested' });
		expect(store.state.oauthCallback).toBeNull();
		expect(store.state.login?.status).toBe('idle');
	});
});
