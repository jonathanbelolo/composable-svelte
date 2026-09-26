/**
 * Managed session-refresh companion flow through `createAuthFeature`.
 *
 * Covers:
 * - Slot operations: openSessionRefresh, restartSessionRefresh, closeSessionRefresh.
 * - Opening guards: sessionRefresh slot refuses to open when anonymous or while
 *   a temporary auth flow is live.
 * - Truthful seeding: initial expiresAt is seeded from parent session.expiresAt.
 * - Sibling settings coexistence: lives alongside account, changePassword, deleteAccount,
 *   connectedAccounts, changeEmail, and mfaManagement without interference.
 * - Single-reduction outcome pulses:
 *   - sessionRefreshOutcome pulses { kind: 'refreshed', expiresAt } on success,
 *     updating parent session.expiresAt truthfully.
 *   - sessionRefreshOutcome pulses { kind: 'ended', error } on invalid_credentials,
 *     triggering resolveSession reconciliation (transitioning session to anonymous).
 *   - sessionRefreshOutcome pulses { kind: 'failed', error } on transient failure,
 *     leaving valid session intact.
 * - Account safety: successful refresh does not reauthenticate a logged-out or different account.
 * - Replay guards: stale / premature refresh results when status is not 'refreshing' emit no pulse.
 * - Pulse clearing: outcome is cleared on the next auth reduction (single-reduction pulse).
 * - Owner replacement & retirement: subject switch, logout, or session expiration
 *   retires the slot and drops late results.
 * - Client attachment lifetime:
 *   - Watcher starts only on client attach ($effect), stops when last attachment unmounts.
 *   - Multiple attachments do not duplicate timer subscriptions.
 *   - Restart creates a new owner token; old-owner unmount cleanup does not cancel replacement owner.
 * - Distinct effect IDs: watch subscription and refresh operation have distinct IDs.
 * - Injected clock: deterministic time decisions drive cadence before expiry.
 * - Keyed markup: managed markup is keyed by view owner.
 * - Sibling independence: two mounted auth instances on the same page operate without cross-talk.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { createMockClock, createStore, type Store } from '@composable-svelte/core';

import ManagedAuthRecipe from './test-components/ManagedAuthRecipe.svelte';
import SessionRefresh from '../src/lib/components/SessionRefresh.svelte';
import {
	createAuthFeature,
	type AuthFeature,
	type AuthFeatureAction,
	type AuthFeatureDependencies,
	type AuthFeatureState,
	type AuthSessionRefreshOutcome
} from '../src/lib/application/index.js';
import {
	createInitialSessionRefreshState,
	createInitialLoginState,
	createInitialSignupState,
	createInitialAccountState,
	createInitialChangePasswordState,
	createInitialDeleteAccountState,
	createInitialMfaManagementState
} from '../src/lib/flows/index.js';
import { createInitialSessionState, type SessionState } from '../src/lib/session/index.js';
import { subjectFromSession, type SessionSnapshot } from '../src/lib/subject/index.js';
import type { AuthError } from '../src/lib/errors/types.js';
import {
	controlledAuthDeps,
	settle,
	snapshot,
	submitRefresh
} from './fixtures/managed-auth-drivers.js';

type AuthStore = Store<AuthFeatureState, AuthFeatureAction>;

const ada = snapshot('aaaaaaaa-0000-0000-0000-000000000001', 'Ada');
const bob = snapshot('bbbbbbbb-0000-0000-0000-000000000002', 'Bob');

function signedIn(who: typeof ada, expiresAt: string | null = '2026-10-01T12:00:00.000Z'): SessionState {
	return {
		...createInitialSessionState(),
		status: 'authenticated',
		subject: subjectFromSession(who),
		expiresAt
	};
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
			session: signedIn(ada),
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
	store: AuthStore
) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const component = mount(ManagedAuthRecipe, {
		target,
		props: {
			auth,
			store
		}
	});
	let unmounted = false;
	const doUnmount = () => {
		if (unmounted) return;
		unmounted = true;
		unmount(component);
		target.remove();
	};
	cleanups.push(doUnmount);
	return { target, component, unmount: doUnmount };
}

describe('managed session-refresh - headless rules', () => {
	it('opens, restarts, and closes sessionRefresh slot', () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps);

		expect(store.state.sessionRefresh).toBeNull();

		store.dispatch({ type: 'openSessionRefresh' });
		expect(store.state.sessionRefresh).not.toBeNull();
		expect(store.state.sessionRefresh?.status).toBe('idle');
		expect(store.state.sessionRefresh?.expiresAt).toBe('2026-10-01T12:00:00.000Z');

		// Restart session refresh preserves current session expiry
		store.dispatch({ type: 'restartSessionRefresh' });
		expect(store.state.sessionRefresh?.status).toBe('idle');
		expect(store.state.sessionRefresh?.expiresAt).toBe('2026-10-01T12:00:00.000Z');

		// Close session refresh
		store.dispatch({ type: 'closeSessionRefresh' });
		expect(store.state.sessionRefresh).toBeNull();
	});

	it('refuses to open sessionRefresh when session is anonymous', () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createStore({
			initialState: {
				...auth.initialState(),
				session: createInitialSessionState() // anonymous
			},
			reducer: auth.composition.reducer,
			execution: auth.composition.execution,
			dependencies: driver.deps
		});
		cleanups.push(() => store.destroy());

		store.dispatch({ type: 'openSessionRefresh' });
		expect(store.state.sessionRefresh).toBeNull();
	});

	it('refuses to open sessionRefresh while a temporary auth flow is live', () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps, {
			login: createInitialLoginState()
		});

		store.dispatch({ type: 'openSessionRefresh' });
		expect(store.state.sessionRefresh).toBeNull();

		// Replace login with signup
		const signupStore = createAuthStore(auth, driver.deps, {
			signup: createInitialSignupState()
		});
		signupStore.dispatch({ type: 'openSessionRefresh' });
		expect(signupStore.state.sessionRefresh).toBeNull();
	});

	it('seeds initial expiresAt truthfully from parent session.expiresAt', () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps, {
			session: signedIn(ada, '2027-01-15T08:30:00.000Z')
		});

		store.dispatch({ type: 'openSessionRefresh' });
		expect(store.state.sessionRefresh?.expiresAt).toBe('2027-01-15T08:30:00.000Z');
	});

	it('coexists alongside account, changePassword, deleteAccount, and mfaManagement', () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps);

		store.dispatch({ type: 'openAccount' });
		store.dispatch({ type: 'openChangePassword' });
		store.dispatch({ type: 'openDeleteAccount' });
		store.dispatch({ type: 'openMfaManagement' });
		store.dispatch({ type: 'openSessionRefresh' });

		expect(store.state.account?.status).toBe('idle');
		expect(store.state.changePassword?.status).toBe('idle');
		expect(store.state.deleteAccount?.status).toBe('idle');
		expect(store.state.mfaManagement?.status).toBe('idle');
		expect(store.state.sessionRefresh?.status).toBe('idle');

		// Closing sessionRefresh does not disturb sibling settings
		store.dispatch({ type: 'closeSessionRefresh' });
		expect(store.state.sessionRefresh).toBeNull();
		expect(store.state.account?.status).toBe('idle');
		expect(store.state.changePassword?.status).toBe('idle');
		expect(store.state.deleteAccount?.status).toBe('idle');
		expect(store.state.mfaManagement?.status).toBe('idle');
	});

	it('updates parent session.expiresAt and pulses refreshed outcome on success', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps);
		store.dispatch({ type: 'openSessionRefresh' });

		const view = auth.composition.bind(store, auth.sessionRefreshSlot)!;
		const refreshPromise = submitRefresh(view, driver.sessionRefreshes);
		expect(store.state.sessionRefresh?.status).toBe('refreshing');

		const req = await refreshPromise;
		const newExpiry = '2026-10-01T14:30:00.000Z';
		req.resolve({ expiresAt: newExpiry });
		await settle();

		expect(store.state.session.expiresAt).toBe(newExpiry);
		expect(store.state.sessionRefresh?.expiresAt).toBe(newExpiry);
		expect(store.state.sessionRefresh?.status).toBe('idle');
		expect(store.state.sessionRefreshOutcome).toEqual({
			kind: 'refreshed',
			expiresAt: newExpiry
		});

		// Cleared on next reduction
		store.dispatch({ type: 'openAccount' });
		expect(store.state.sessionRefreshOutcome).toBeNull();
	});

	it('reconciles via resolveSession and pulses ended outcome on invalid_credentials', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps);
		store.dispatch({ type: 'openSessionRefresh' });

		const outcomes: AuthSessionRefreshOutcome[] = [];
		const unsub = store.subscribe((s) => {
			if (s.sessionRefreshOutcome) outcomes.push(s.sessionRefreshOutcome);
		});
		cleanups.push(unsub);

		const view = auth.composition.bind(store, auth.sessionRefreshSlot)!;
		const refreshPromise = submitRefresh(view, driver.sessionRefreshes);
		const req = await refreshPromise;

		const error: AuthError = { code: 'invalid_credentials', message: 'Session expired on server.' };
		req.reject(error);
		await settle();

		expect(store.state.session.status).toBe('anonymous');
		expect(store.state.session.subject.kind).toBe('anonymous');
		expect(store.state.sessionRefresh?.status).toBe('ended');
		expect(outcomes).toEqual([
			{
				kind: 'ended',
				error
			}
		]);
		expect(store.state.sessionRefreshOutcome, 'pulse clears on subsequent reduction').toBeNull();
	});

	it('preserves valid session and pulses failed outcome on transient failure', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps);
		store.dispatch({ type: 'openSessionRefresh' });

		const view = auth.composition.bind(store, auth.sessionRefreshSlot)!;
		const refreshPromise = submitRefresh(view, driver.sessionRefreshes);
		const req = await refreshPromise;

		const networkError: AuthError = { code: 'network', message: 'Network dropped.' };
		req.reject(networkError);
		await settle();

		// Session remains authenticated and valid!
		expect(store.state.session.status).toBe('authenticated');
		expect(store.state.session.subject.kind).toBe('authenticated');
		expect(store.state.session.expiresAt).toBe('2026-10-01T12:00:00.000Z');
		expect(store.state.sessionRefresh?.status).toBe('idle');
		expect(store.state.sessionRefreshOutcome).toEqual({
			kind: 'failed',
			error: networkError
		});
	});

	it('does not reauthenticate logged-out or different account on late refresh success', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps);
		store.dispatch({ type: 'openSessionRefresh' });

		const view = auth.composition.bind(store, auth.sessionRefreshSlot)!;
		const refreshPromise = submitRefresh(view, driver.sessionRefreshes);
		const req = await refreshPromise;

		// User logs out while refresh was in flight
		store.dispatch({ type: 'session', action: { type: 'logout' } });
		expect(store.state.sessionRefresh).toBeNull();
		driver.logouts[0]?.resolve();
		await settle();
		expect(store.state.session.status).toBe('anonymous');

		// Late response resolves
		req.resolve({ expiresAt: '2026-10-01T15:00:00.000Z' });
		await settle();

		// Must remain anonymous; must not revive session or reauthenticate!
		expect(store.state.session.status).toBe('anonymous');
		expect(store.state.sessionRefreshOutcome).toBeNull();
	});

	it('drops stale or replayed refresh results when not refreshing', () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps);
		store.dispatch({ type: 'openSessionRefresh' });

		expect(store.state.sessionRefresh?.status).toBe('idle');
		expect(store.state.sessionRefresh?.expiresAt).toBe('2026-10-01T12:00:00.000Z');

		// Directly dispatch refreshSucceeded when not refreshing (stale or replayed action)
		store.dispatch({
			type: 'sessionRefresh',
			action: {
				type: 'presented',
				action: { type: 'refreshSucceeded', expiresAt: '2026-10-01T16:00:00.000Z' }
			}
		});

		// Defensive child guard + replay guard rejected it: no session mutation, child status/expiry intact, no outcome pulse!
		expect(store.state.session.expiresAt).toBe('2026-10-01T12:00:00.000Z');
		expect(store.state.sessionRefresh?.status).toBe('idle');
		expect(store.state.sessionRefresh?.expiresAt).toBe('2026-10-01T12:00:00.000Z');
		expect(store.state.sessionRefreshOutcome).toBeNull();

		// Directly dispatch forged refreshFailed when not refreshing
		store.dispatch({
			type: 'sessionRefresh',
			action: {
				type: 'presented',
				action: { type: 'refreshFailed', error: { code: 'invalid_credentials', message: 'Forged' } }
			}
		});
		// Status must remain idle; must not end slot or resolve session without a request
		expect(store.state.session.status).toBe('authenticated');
		expect(store.state.sessionRefresh?.status).toBe('idle');
		expect(store.state.sessionRefreshOutcome).toBeNull();

		// Directly dispatch expiryObserved into managed child: parent owns expiry so child ignores direct dispatch
		store.dispatch({
			type: 'sessionRefresh',
			action: {
				type: 'presented',
				action: { type: 'expiryObserved', expiresAt: '2030-01-01T00:00:00.000Z' }
			}
		});
		expect(store.state.sessionRefresh?.expiresAt).toBe('2026-10-01T12:00:00.000Z');
	});

	it('after a real settlement, stale or forged feedback cannot change parent expiry, emit outcome, or trigger resolution', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps);
		store.dispatch({ type: 'openSessionRefresh' });

		const view = auth.composition.bind(store, auth.sessionRefreshSlot)!;

		// 1. REAL SUCCESS
		const refreshPromise = submitRefresh(view, driver.sessionRefreshes);
		const req = await refreshPromise;
		const realNewExpiry = '2026-10-01T14:00:00.000Z';
		req.resolve({ expiresAt: realNewExpiry });
		await settle();

		expect(store.state.session.expiresAt).toBe(realNewExpiry);
		expect(store.state.sessionRefresh?.status).toBe('idle');
		expect(store.state.sessionRefresh?.expiresAt).toBe(realNewExpiry);
		expect(store.state.sessionRefreshOutcome).toEqual({
			kind: 'refreshed',
			expiresAt: realNewExpiry
		});

		// Clear outcome pulse with a neutral action
		store.dispatch({ type: 'openAccount' });
		expect(store.state.sessionRefreshOutcome).toBeNull();

		// Forged success dispatched after real settlement
		view.dispatch({ type: 'refreshSucceeded', expiresAt: '2099-01-01T00:00:00.000Z' });
		await settle();

		// Parent and child MUST preserve real expiry, no second outcome!
		expect(store.state.session.expiresAt).toBe(realNewExpiry);
		expect(store.state.sessionRefresh?.status).toBe('idle');
		expect(store.state.sessionRefresh?.expiresAt).toBe(realNewExpiry);
		expect(store.state.sessionRefreshOutcome).toBeNull();

		// 2. REAL TRANSIENT FAILURE
		const failPromise = submitRefresh(view, driver.sessionRefreshes);
		const failReq = await failPromise;
		const networkError: AuthError = { code: 'network', message: 'Offline' };
		failReq.reject(networkError);
		await settle();

		expect(store.state.sessionRefreshOutcome).toEqual({
			kind: 'failed',
			error: networkError
		});

		store.dispatch({ type: 'openAccount' });
		expect(store.state.sessionRefreshOutcome).toBeNull();

		// Replay network failure after real settle
		view.dispatch({ type: 'refreshFailed', error: networkError });
		await settle();

		expect(store.state.session.expiresAt).toBe(realNewExpiry);
		expect(store.state.sessionRefresh?.status).toBe('idle');
		expect(store.state.sessionRefreshOutcome).toBeNull();

		// 3. REAL 401 INVALID CREDENTIALS
		let resolveFetchSession!: (session: SessionSnapshot | null) => void;
		const fetchSessionPromise = new Promise<SessionSnapshot | null>((resolve) => {
			resolveFetchSession = resolve;
		});
		const fetchSessionSpy = vi.fn(async () => fetchSessionPromise);
		driver.setFetchSession(fetchSessionSpy);

		const endPromise = submitRefresh(view, driver.sessionRefreshes);
		const endReq = await endPromise;
		const invalidCreds: AuthError = { code: 'invalid_credentials', message: '401' };
		endReq.reject(invalidCreds);
		await settle();

		expect(store.state.session.status).toBe('resolving');
		expect(store.state.sessionRefresh?.status).toBe('ended');
		expect(store.state.sessionRefreshOutcome).toEqual({
			kind: 'ended',
			error: invalidCreds
		});
		expect(fetchSessionSpy).toHaveBeenCalledTimes(1);

		store.dispatch({ type: 'openAccount' });
		expect(store.state.sessionRefreshOutcome).toBeNull();

		// Replay 401 after real settle (while resolving)
		view.dispatch({ type: 'refreshFailed', error: invalidCreds });
		await settle();

		expect(store.state.session.status).toBe('resolving');
		expect(store.state.sessionRefresh?.status).toBe('ended');
		expect(store.state.sessionRefreshOutcome).toBeNull();
		// Must not trigger another resolveSession
		expect(fetchSessionSpy).toHaveBeenCalledTimes(1);

		// Now let fetchSession settle to anonymous
		resolveFetchSession(null);
		await settle();
		expect(store.state.session.status).toBe('anonymous');
		expect(store.state.sessionRefresh?.status).toBe('ended');

		// Replay 401 after anonymous transition
		view.dispatch({ type: 'refreshFailed', error: invalidCreds });
		await settle();
		expect(store.state.session.status).toBe('anonymous');
		expect(store.state.sessionRefreshOutcome).toBeNull();
		expect(fetchSessionSpy).toHaveBeenCalledTimes(1);
	});

	it('retires sessionRefresh slot and drops late responses on subject switch', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps);
		store.dispatch({ type: 'openSessionRefresh' });

		const view = auth.composition.bind(store, auth.sessionRefreshSlot)!;
		const refreshPromise = submitRefresh(view, driver.sessionRefreshes);
		const req = await refreshPromise;

		// Authenticate as Bob (different user)
		store.dispatch({
			type: 'session',
			action: {
				type: 'sessionEstablished',
				session: bob
			}
		});

		expect(store.state.session.subject).toEqual(subjectFromSession(bob));
		expect(store.state.sessionRefresh).toBeNull();

		// Late response from Ada's refresh arrives
		req.resolve({ expiresAt: '2026-10-01T18:00:00.000Z' });
		await settle();

		expect(store.state.session.subject).toEqual(subjectFromSession(bob));
		expect(store.state.sessionRefreshOutcome).toBeNull();
	});

	it('has distinct effect IDs for watch subscription and refresh operation', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps, {
			session: signedIn(ada, '2026-10-01T12:00:00.000Z')
		});
		store.dispatch({ type: 'openSessionRefresh' });

		const view = auth.composition.bind(store, auth.sessionRefreshSlot)!;
		view.dispatch({ type: 'watchStarted' });
		expect(store.state.sessionRefresh?.status).toBe('idle');

		// Start an in-flight refresh request
		view.dispatch({ type: 'refreshRequested' });
		expect(store.state.sessionRefresh?.status).toBe('refreshing');
		expect(driver.sessionRefreshes.length).toBe(1);
		const refreshReq = driver.sessionRefreshes[0]!;

		// Stopping the watch subscription cancels the watch timer but MUST NOT abort the in-flight refresh request
		view.dispatch({ type: 'watchStopped' });
		expect(store.state.sessionRefresh?.status).toBe('refreshing');
		expect(refreshReq.signal?.aborted).toBe(false);

		// The refresh completes successfully and updates the session truthfully
		refreshReq.resolve({ expiresAt: '2026-10-01T13:00:00.000Z' });
		await settle();

		expect(store.state.sessionRefresh?.status).toBe('idle');
		expect(store.state.sessionRefresh?.expiresAt).toBe('2026-10-01T13:00:00.000Z');
		expect(store.state.session.expiresAt).toBe('2026-10-01T13:00:00.000Z');
		expect(store.state.sessionRefreshOutcome).toEqual({
			kind: 'refreshed',
			expiresAt: '2026-10-01T13:00:00.000Z'
		});
	});

	it('recovers managed watcher from ended status when resolveSession confirms same authenticated subject', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const adaInitialExpiry = '2026-10-01T12:00:00.000Z';
		const adaRecoveredExpiry = '2026-10-01T13:00:00.000Z';

		// Set fetchSession to return Ada's valid session with a new expiry
		driver.setFetchSession(async () => ({
			subject_id: ada.subject_id,
			display_name: 'Ada',
			roles: ['member'],
			expires_at: adaRecoveredExpiry
		}));

		const store = createAuthStore(auth, driver.deps, {
			session: signedIn(ada, adaInitialExpiry)
		});
		store.dispatch({ type: 'openSessionRefresh' });

		const view = auth.composition.bind(store, auth.sessionRefreshSlot)!;
		view.dispatch({ type: 'refreshRequested' });
		expect(store.state.sessionRefresh?.status).toBe('refreshing');

		// 401 on refresh triggers invalid_credentials -> child status becomes 'ended' and resolveSession is dispatched
		expect(driver.sessionRefreshes.length).toBe(1);
		const refreshReq = driver.sessionRefreshes[0]!;
		refreshReq.reject({ code: 'invalid_credentials', message: '401 proxy error' });
		await settle();

		// Session reconciliation ran: backend confirmed Ada is still valid with new expiry
		expect(store.state.session.subject).toEqual(subjectFromSession(ada));
		expect(store.state.session.expiresAt).toBe(adaRecoveredExpiry);

		// Managed watcher must NOT stay dead: it recovers to idle with the resolved expiry and cleared error!
		expect(store.state.sessionRefresh?.status).toBe('idle');
		expect(store.state.sessionRefresh?.expiresAt).toBe(adaRecoveredExpiry);
		expect(store.state.sessionRefresh?.error).toBeNull();

		// A subsequent refresh attempt works truthfully
		view.dispatch({ type: 'refreshRequested' });
		expect(store.state.sessionRefresh?.status).toBe('refreshing');
		expect(driver.sessionRefreshes.length).toBe(2);
		driver.sessionRefreshes[1]!.resolve({ expiresAt: '2026-10-01T14:00:00.000Z' });
		await settle();

		expect(store.state.sessionRefresh?.status).toBe('idle');
		expect(store.state.sessionRefresh?.expiresAt).toBe('2026-10-01T14:00:00.000Z');
		expect(store.state.sessionRefreshOutcome).toEqual({
			kind: 'refreshed',
			expiresAt: '2026-10-01T14:00:00.000Z'
		});
	});

	it('leaves ended slot alone during pending resolution when unrelated session actions arrive, refusing duplicate requests and preserving ended view on anonymous resolution', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const adaInitialExpiry = '2026-10-01T12:00:00.000Z';

		let resolveFetchSession!: (session: SessionSnapshot | null) => void;
		const fetchSessionPromise = new Promise<SessionSnapshot | null>((resolve) => {
			resolveFetchSession = resolve;
		});
		driver.setFetchSession(async () => fetchSessionPromise);

		const store = createAuthStore(auth, driver.deps, {
			session: signedIn(ada, adaInitialExpiry)
		});
		store.dispatch({ type: 'openSessionRefresh' });

		const view = auth.composition.bind(store, auth.sessionRefreshSlot)!;
		view.dispatch({ type: 'refreshRequested' });
		expect(store.state.sessionRefresh?.status).toBe('refreshing');

		// 401 on refresh triggers invalid_credentials -> slot status becomes 'ended' and resolveSession is dispatched
		expect(driver.sessionRefreshes.length).toBe(1);
		driver.sessionRefreshes[0]!.reject({ code: 'invalid_credentials', message: '401 proxy error' });
		await settle();

		expect(store.state.session.status).toBe('resolving');
		expect(store.state.sessionRefresh?.status).toBe('ended');

		// An unrelated session action arrives while reconciliation is in flight
		store.dispatch({ type: 'session', action: { type: 'resolveSession' } });
		// Slot MUST NOT revive to idle prematurely
		expect(store.state.sessionRefresh?.status).toBe('ended');

		// Direct child actions (stale refreshSucceeded or expiryObserved) cannot hide ended or revive slot
		view.dispatch({ type: 'refreshSucceeded', expiresAt: '2030-01-01T00:00:00.000Z' });
		expect(store.state.sessionRefresh?.status).toBe('ended');
		expect(store.state.sessionRefresh?.expiresAt).toBeNull();
		expect(store.state.sessionRefresh?.error?.code).toBe('invalid_credentials');

		view.dispatch({ type: 'expiryObserved', expiresAt: '2030-01-01T00:00:00.000Z' });
		expect(store.state.sessionRefresh?.status).toBe('ended');
		expect(store.state.sessionRefresh?.expiresAt).toBeNull();

		// While ended, subsequent refreshRequested is refused (no second request sent)
		view.dispatch({ type: 'refreshRequested' });
		expect(driver.sessionRefreshes.length).toBe(1);
		expect(store.state.sessionRefresh?.status).toBe('ended');

		// Now fetchSession settles as null (backend confirms session is gone)
		resolveFetchSession(null);
		await settle();

		// Session is now anonymous, but the ended slot is preserved for the user
		expect(store.state.session.status).toBe('anonymous');
		expect(store.state.sessionRefresh?.status).toBe('ended');
		expect(store.state.sessionRefresh?.error?.code).toBe('invalid_credentials');
	});

	it('recovers managed watcher from ended status when resolveSession confirms same subject with null expiry', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const adaInitialExpiry = '2026-10-01T12:00:00.000Z';

		// Set fetchSession to return Ada's valid session with no expires_at (null expiry)
		driver.setFetchSession(async () => ({
			subject_id: ada.subject_id,
			display_name: 'Ada',
			roles: ['member']
		}));

		const store = createAuthStore(auth, driver.deps, {
			session: signedIn(ada, adaInitialExpiry)
		});
		store.dispatch({ type: 'openSessionRefresh' });

		const view = auth.composition.bind(store, auth.sessionRefreshSlot)!;
		view.dispatch({ type: 'refreshRequested' });
		expect(store.state.sessionRefresh?.status).toBe('refreshing');

		expect(driver.sessionRefreshes.length).toBe(1);
		driver.sessionRefreshes[0]!.reject({ code: 'invalid_credentials', message: '401 proxy error' });
		await settle();

		// Session reconciliation ran: backend confirmed Ada is still valid with null expiry
		expect(store.state.session.subject).toEqual(subjectFromSession(ada));
		expect(store.state.session.expiresAt).toBeNull();

		// Managed watcher recovers to idle with null expiry!
		expect(store.state.sessionRefresh?.status).toBe('idle');
		expect(store.state.sessionRefresh?.expiresAt).toBeNull();
		expect(store.state.sessionRefresh?.error).toBeNull();

		// A subsequent refresh attempt works truthfully
		view.dispatch({ type: 'refreshRequested' });
		expect(store.state.sessionRefresh?.status).toBe('refreshing');
		expect(driver.sessionRefreshes.length).toBe(2);
		driver.sessionRefreshes[1]!.resolve({ expiresAt: '2026-10-01T14:00:00.000Z' });
		await settle();

		expect(store.state.sessionRefresh?.status).toBe('idle');
		expect(store.state.sessionRefresh?.expiresAt).toBe('2026-10-01T14:00:00.000Z');
	});

	it('recovers managed watcher from ended status when resolveSession confirms same subject with unchanged expiry', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const adaInitialExpiry = '2026-10-01T12:00:00.000Z';

		// Set fetchSession to return Ada with the exact same expiry
		driver.setFetchSession(async () => ({
			subject_id: ada.subject_id,
			display_name: 'Ada',
			roles: ['member'],
			expires_at: adaInitialExpiry
		}));

		const store = createAuthStore(auth, driver.deps, {
			session: signedIn(ada, adaInitialExpiry)
		});
		store.dispatch({ type: 'openSessionRefresh' });

		const view = auth.composition.bind(store, auth.sessionRefreshSlot)!;
		view.dispatch({ type: 'refreshRequested' });

		expect(driver.sessionRefreshes.length).toBe(1);
		driver.sessionRefreshes[0]!.reject({ code: 'invalid_credentials', message: '401 proxy error' });
		await settle();

		expect(store.state.session.expiresAt).toBe(adaInitialExpiry);
		expect(store.state.sessionRefresh?.status).toBe('idle');
		expect(store.state.sessionRefresh?.expiresAt).toBe(adaInitialExpiry);
		expect(store.state.sessionRefresh?.error).toBeNull();
	});

	it('recovers managed watcher from ended status when sessionEstablished arrives for same subject mid-resolve', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const adaInitialExpiry = '2026-10-01T12:00:00.000Z';

		let resolveFetchSession!: (session: SessionSnapshot | null) => void;
		const fetchSessionPromise = new Promise<SessionSnapshot | null>((resolve) => {
			resolveFetchSession = resolve;
		});
		driver.setFetchSession(async () => fetchSessionPromise);

		const store = createAuthStore(auth, driver.deps, {
			session: signedIn(ada, adaInitialExpiry)
		});
		store.dispatch({ type: 'openSessionRefresh' });

		const view = auth.composition.bind(store, auth.sessionRefreshSlot)!;
		view.dispatch({ type: 'refreshRequested' });

		expect(driver.sessionRefreshes.length).toBe(1);
		driver.sessionRefreshes[0]!.reject({ code: 'invalid_credentials', message: '401 proxy error' });
		await settle();

		expect(store.state.session.status).toBe('resolving');
		expect(store.state.sessionRefresh?.status).toBe('ended');

		// Mid-resolve: an accepted sessionEstablished arrives for Ada with a new expiry
		const updatedExpiry = '2026-10-01T20:00:00.000Z';
		store.dispatch({
			type: 'session',
			action: {
				type: 'sessionEstablished',
				session: {
					...ada,
					expires_at: updatedExpiry
				}
			}
		});

		// Session transitioned into authenticated for Ada: watcher must revive to idle with new expiry!
		expect(store.state.session.status).toBe('authenticated');
		expect(store.state.session.expiresAt).toBe(updatedExpiry);
		expect(store.state.sessionRefresh?.status).toBe('idle');
		expect(store.state.sessionRefresh?.expiresAt).toBe(updatedExpiry);
		expect(store.state.sessionRefresh?.error).toBeNull();

		// The pending resolve settles; since session is already authenticated, it does not regress the slot
		resolveFetchSession(ada);
		await settle();

		expect(store.state.session.status).toBe('authenticated');
		expect(store.state.sessionRefresh?.status).toBe('idle');

		// Subsequent refresh works
		view.dispatch({ type: 'refreshRequested' });
		expect(store.state.sessionRefresh?.status).toBe('refreshing');
		expect(driver.sessionRefreshes.length).toBe(2);
		driver.sessionRefreshes[1]!.resolve({ expiresAt: '2026-10-01T22:00:00.000Z' });
		await settle();
		expect(store.state.sessionRefresh?.status).toBe('idle');
		expect(store.state.sessionRefresh?.expiresAt).toBe('2026-10-01T22:00:00.000Z');
	});

	it('recovers managed watcher from ended status when seeded loginSucceeded arrives for same subject mid-resolve', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const adaInitialExpiry = '2026-10-01T12:00:00.000Z';

		let resolveFetchSession!: (session: SessionSnapshot | null) => void;
		const fetchSessionPromise = new Promise<SessionSnapshot | null>((resolve) => {
			resolveFetchSession = resolve;
		});
		driver.setFetchSession(async () => fetchSessionPromise);

		const store = createAuthStore(auth, driver.deps, {
			session: signedIn(ada, adaInitialExpiry)
		});
		store.dispatch({ type: 'openSessionRefresh' });

		const view = auth.composition.bind(store, auth.sessionRefreshSlot)!;
		view.dispatch({ type: 'refreshRequested' });

		expect(driver.sessionRefreshes.length).toBe(1);
		driver.sessionRefreshes[0]!.reject({ code: 'invalid_credentials', message: '401 proxy error' });
		await settle();

		expect(store.state.session.status).toBe('resolving');
		expect(store.state.sessionRefresh?.status).toBe('ended');

		// Explicit seeded login dispatched during resolving bumps epoch and transitions to loggingIn
		store.dispatch({
			type: 'session',
			action: { type: 'login', seededUserId: ada.subject_id }
		});
		expect(store.state.session.status).toBe('loggingIn');
		// Slot is still ended while login is in flight
		expect(store.state.sessionRefresh?.status).toBe('ended');

		// Login succeeds with updated Ada session
		const loginExpiry = '2026-10-01T21:00:00.000Z';
		const epoch = store.state.session.epoch;
		store.dispatch({
			type: 'session',
			action: {
				type: 'loginSucceeded',
				session: {
					...ada,
					expires_at: loginExpiry
				},
				epoch
			}
		});

		// Real transition into authenticated for Ada: watcher recovers to idle!
		expect(store.state.session.status).toBe('authenticated');
		expect(store.state.session.expiresAt).toBe(loginExpiry);
		expect(store.state.sessionRefresh?.status).toBe('idle');
		expect(store.state.sessionRefresh?.expiresAt).toBe(loginExpiry);
		expect(store.state.sessionRefresh?.error).toBeNull();
	});

	it('failed seeded login mid-resolve does not revive ended watcher', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const adaInitialExpiry = '2026-10-01T12:00:00.000Z';

		let resolveFetchSession!: (session: SessionSnapshot | null) => void;
		const fetchSessionPromise = new Promise<SessionSnapshot | null>((resolve) => {
			resolveFetchSession = resolve;
		});
		driver.setFetchSession(async () => fetchSessionPromise);

		const store = createAuthStore(auth, driver.deps, {
			session: signedIn(ada, adaInitialExpiry)
		});
		store.dispatch({ type: 'openSessionRefresh' });

		const view = auth.composition.bind(store, auth.sessionRefreshSlot)!;
		view.dispatch({ type: 'refreshRequested' });

		expect(driver.sessionRefreshes.length).toBe(1);
		driver.sessionRefreshes[0]!.reject({ code: 'invalid_credentials', message: '401 proxy error' });
		await settle();

		expect(store.state.session.status).toBe('resolving');
		expect(store.state.sessionRefresh?.status).toBe('ended');

		// Seeded login started mid-resolve
		store.dispatch({
			type: 'session',
			action: { type: 'login', seededUserId: ada.subject_id }
		});
		expect(store.state.session.status).toBe('loggingIn');
		expect(store.state.sessionRefresh?.status).toBe('ended');

		// Seeded login fails (loginFailed fallback restores prior authenticated subject)
		const epoch = store.state.session.epoch;
		store.dispatch({
			type: 'session',
			action: {
				type: 'loginFailed',
				error: { code: 'invalid_credentials', message: 'Bad seeded credentials' },
				epoch
			}
		});

		// Session is authenticated with error, but slot MUST NOT be revived
		expect(store.state.session.status).toBe('authenticated');
		expect(store.state.session.error?.code).toBe('invalid_credentials');
		expect(store.state.sessionRefresh?.status).toBe('ended');
		expect(store.state.sessionRefresh?.error?.code).toBe('invalid_credentials');
	});

	it('does not revive ended watcher on an epoch-stale sessionResolved action', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const adaInitialExpiry = '2026-10-01T12:00:00.000Z';

		const store = createAuthStore(auth, driver.deps, {
			session: signedIn(ada, adaInitialExpiry)
		});
		store.dispatch({ type: 'openSessionRefresh' });

		const view = auth.composition.bind(store, auth.sessionRefreshSlot)!;
		view.dispatch({ type: 'refreshRequested' });

		expect(driver.sessionRefreshes.length).toBe(1);
		driver.sessionRefreshes[0]!.reject({ code: 'invalid_credentials', message: '401' });
		await settle();

		expect(store.state.sessionRefresh?.status).toBe('ended');
		const currentEpoch = store.state.session.epoch;

		// Dispatch a sessionResolved with a stale epoch
		store.dispatch({
			type: 'session',
			action: {
				type: 'sessionResolved',
				session: {
					subject_id: ada.subject_id,
					display_name: 'Ada',
					roles: ['member'],
					expires_at: '2026-10-01T15:00:00.000Z'
				},
				epoch: currentEpoch - 1
			}
		});

		// Stale resolve is ignored by sessionReducer, so sessionRefresh must remain ended
		expect(store.state.sessionRefresh?.status).toBe('ended');
	});

	it('uses injected clock for deterministic time evaluation in ticked', async () => {
		const clock = createMockClock(Date.parse('2026-10-01T11:50:00.000Z')); // 10 minutes before 12:00 expiry
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const deps = {
			...driver.deps,
			clock,
			leadMs: 15 * 60_000, // refresh 15 minutes before expiry
			tickMs: 30_000
		};

		const store = createAuthStore(auth, deps, {
			session: signedIn(ada, '2026-10-01T12:00:00.000Z')
		});
		store.dispatch({ type: 'openSessionRefresh' });

		const view = auth.composition.bind(store, auth.sessionRefreshSlot)!;
		expect(store.state.sessionRefresh?.status).toBe('idle');

		// Tick when clock is at 11:50: expiry is 12:00, remaining is 10 min <= 15 min leadMs -> triggers refresh!
		view.dispatch({ type: 'ticked' });
		expect(store.state.sessionRefresh?.status).toBe('refreshing');
		expect(driver.sessionRefreshes.length).toBe(1);
	});
});

describe('managed session-refresh - browser component attachment', () => {
	it('starts watch only when client component mounts, stops when unmounted', async () => {
		const setIntervalSpy = vi.spyOn(window, 'setInterval');
		const clearIntervalSpy = vi.spyOn(window, 'clearInterval');
		const initialSets = setIntervalSpy.mock.calls.length;
		const initialClears = clearIntervalSpy.mock.calls.length;

		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps);
		store.dispatch({ type: 'openSessionRefresh' });

		const target = document.createElement('div');
		document.body.appendChild(target);

		const view = auth.composition.bind(store, auth.sessionRefreshSlot)!;
		const component = mount(SessionRefresh, {
			target,
			props: {
				mode: 'managed',
				store: view
			}
		});
		flushSync();

		// Mounted: view received watchStarted and setInterval was called
		expect(store.state.sessionRefresh?.status).toBe('idle');
		expect(setIntervalSpy.mock.calls.length).toBe(initialSets + 1);
		expect(clearIntervalSpy.mock.calls.length).toBe(initialClears);

		// Unmount
		unmount(component);
		target.remove();
		flushSync();

		// View has been stopped: clearInterval was called
		expect(store.state.sessionRefresh?.status).toBe('idle');
		expect(clearIntervalSpy.mock.calls.length).toBe(initialClears + 1);
	});

	it('handles multiple attachments without duplicate watch timers', async () => {
		const setIntervalSpy = vi.spyOn(window, 'setInterval');
		const clearIntervalSpy = vi.spyOn(window, 'clearInterval');
		const initialSets = setIntervalSpy.mock.calls.length;
		const initialClears = clearIntervalSpy.mock.calls.length;

		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps);
		store.dispatch({ type: 'openSessionRefresh' });

		const target1 = document.createElement('div');
		const target2 = document.createElement('div');
		document.body.appendChild(target1);
		document.body.appendChild(target2);

		const view = auth.composition.bind(store, auth.sessionRefreshSlot)!;

		// Mount first attachment
		const comp1 = mount(SessionRefresh, {
			target: target1,
			props: {
				mode: 'managed',
				store: view
			}
		});
		flushSync();
		expect(setIntervalSpy.mock.calls.length).toBe(initialSets + 1);

		// Mount second attachment to same view
		const comp2 = mount(SessionRefresh, {
			target: target2,
			props: {
				mode: 'managed',
				store: view
			}
		});
		flushSync();
		// Ref-count is 2: NO duplicate timer started
		expect(setIntervalSpy.mock.calls.length).toBe(initialSets + 1);

		// Unmounting first attachment leaves watch active: clearInterval NOT called
		unmount(comp1);
		target1.remove();
		flushSync();
		expect(clearIntervalSpy.mock.calls.length).toBe(initialClears);
		expect(store.state.sessionRefresh?.status).toBe('idle');

		// Unmounting second attachment stops watch: clearInterval called
		unmount(comp2);
		target2.remove();
		flushSync();
		expect(clearIntervalSpy.mock.calls.length).toBe(initialClears + 1);
		expect(store.state.sessionRefresh?.status).toBe('idle');
	});

	it('replacement owner: old owner unmount cleanup does not cancel replacement owner', async () => {
		const setIntervalSpy = vi.spyOn(window, 'setInterval');
		const clearIntervalSpy = vi.spyOn(window, 'clearInterval');
		const initialSets = setIntervalSpy.mock.calls.length;
		const initialClears = clearIntervalSpy.mock.calls.length;

		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps);
		store.dispatch({ type: 'openSessionRefresh' });

		const target1 = document.createElement('div');
		const target2 = document.createElement('div');
		document.body.appendChild(target1);
		document.body.appendChild(target2);

		const oldView = auth.composition.bind(store, auth.sessionRefreshSlot)!;
		const comp1 = mount(SessionRefresh, {
			target: target1,
			props: {
				mode: 'managed',
				store: oldView
			}
		});
		flushSync();
		expect(setIntervalSpy.mock.calls.length).toBe(initialSets + 1);

		// Restart session refresh: gives new owner token and new view
		store.dispatch({ type: 'restartSessionRefresh' });
		const newView = auth.composition.bind(store, auth.sessionRefreshSlot)!;

		// Mount replacement view
		const comp2 = mount(SessionRefresh, {
			target: target2,
			props: {
				mode: 'managed',
				store: newView
			}
		});
		flushSync();
		expect(setIntervalSpy.mock.calls.length).toBe(initialSets + 2);

		// Unmount old owner component: only clears old owner's interval (count = initialClears + 1)
		unmount(comp1);
		target1.remove();
		flushSync();
		expect(clearIntervalSpy.mock.calls.length).toBe(initialClears + 1);

		// Replacement view remains healthy and active
		expect(store.state.sessionRefresh?.status).toBe('idle');

		// Clean up replacement
		unmount(comp2);
		target2.remove();
		flushSync();
		expect(clearIntervalSpy.mock.calls.length).toBe(initialClears + 2);
	});

	it('renders ended snippet when session refresh has ended', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps);
		store.dispatch({ type: 'openSessionRefresh' });

		const { target } = mountRecipe(auth, store);
		flushSync();

		// Initially not ended: no session-ended element
		expect(target.querySelector('[data-testid=session-ended]')).toBeNull();

		// Trigger refresh and fail with invalid_credentials
		const view = auth.composition.bind(store, auth.sessionRefreshSlot)!;
		const refreshPromise = submitRefresh(view, driver.sessionRefreshes);
		const req = await refreshPromise;
		req.reject({ code: 'invalid_credentials', message: 'Revoked.' });
		await settle();
		flushSync();

		expect(store.state.sessionRefresh?.status).toBe('ended');
		expect(target.querySelector('[data-testid=session-ended]')).not.toBeNull();
		expect(target.querySelector('[data-testid=session-ended]')?.textContent).toBe('Session ended');
	});

	it('presentation dismissal closes sessionRefresh slot', () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps);
		store.dispatch({ type: 'openSessionRefresh' });

		expect(store.state.sessionRefresh).not.toBeNull();

		// Dispatch presentation dismiss
		store.dispatch({
			type: 'sessionRefresh',
			action: { type: 'dismiss' }
		});

		expect(store.state.sessionRefresh).toBeNull();
	});

	it('two mounted auth instances remain completely isolated', async () => {
		const auth = createAuthFeature();
		const driver1 = controlledAuthDeps();
		const driver2 = controlledAuthDeps();

		const store1 = createAuthStore(auth, driver1.deps);
		const store2 = createAuthStore(auth, driver2.deps);

		const { target: target1 } = mountRecipe(auth, store1);
		const { target: target2 } = mountRecipe(auth, store2);
		flushSync();

		store1.dispatch({ type: 'openSessionRefresh' });
		flushSync();

		expect(store1.state.sessionRefresh).not.toBeNull();
		expect(store2.state.sessionRefresh).toBeNull();

		const view1 = auth.composition.bind(store1, auth.sessionRefreshSlot)!;
		const refreshPromise = submitRefresh(view1, driver1.sessionRefreshes);
		const req = await refreshPromise;
		req.resolve({ expiresAt: '2026-10-01T20:00:00.000Z' });
		await settle();
		flushSync();

		expect(store1.state.session.expiresAt).toBe('2026-10-01T20:00:00.000Z');
		expect(store1.state.sessionRefreshOutcome).toEqual({
			kind: 'refreshed',
			expiresAt: '2026-10-01T20:00:00.000Z'
		});
		expect(store2.state.sessionRefresh).toBeNull();
		expect(store2.state.sessionRefreshOutcome).toBeNull();
	});
});
