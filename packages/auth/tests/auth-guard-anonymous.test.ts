/**
 * `onAnonymous` must fire once per entry into `anonymous`, not once per action.
 *
 * The hardening register listed this as a defect, INFERRED: `AuthGuard` does
 * `const state = $derived(store.state)`, whose identity changes on every
 * dispatch, so the `$effect` reading `state.status` re-runs on every dispatch
 * and re-fires `onAnonymous`.
 *
 * The premise is right and the conclusion does not follow *for this reducer*.
 * Every path into `anonymous` is guarded on being somewhere else first
 * (`sessionResolved` and `sessionResolveFailed` require `resolving`,
 * `loggedOut` requires `loggingOut`), and every other action returns the
 * identical `state` object — which `dispatchCore` does not notify on. So no
 * action produces a new state while remaining anonymous, and the effect never
 * re-runs while anonymous.
 *
 * That is a property of the reducer, not of the component, and nothing pinned
 * it. This file pins it from both ends:
 *
 *  - `every action against an anonymous state` enumerates the whole
 *    `SessionAction` union and asserts that any result still `anonymous` is
 *    the *identical* object. That is the invariant `AuthGuard` silently
 *    depends on. Add an anonymous -> anonymous transition later (storing a
 *    redirect target, say) and this fails, pointing at the guard.
 *  - the component tests assert the call count directly.
 *
 * These tests pass both before and after the accompanying narrowing of
 * `AuthGuard`'s derived. They are not a regression test for that change —
 * they are what makes the change safe to reason about, and what will catch
 * the future reducer edit that would make the register's claim come true.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { createStore } from '@composable-svelte/core';
import { createInitialSessionState, sessionReducer } from '../src/lib/session/reducer';
import type { SessionAction, SessionDependencies, SessionState } from '../src/lib/session/types';
import type { SessionSnapshot } from '../src/lib/subject/types';
import AuthGuard from '../src/lib/components/AuthGuard.svelte';

const session: SessionSnapshot = {
	subject_id: '3f2a58f0-0000-0000-0000-000000000001',
	display_name: 'Booking Agent',
	roles: ['agent']
};

const deps = (): SessionDependencies => ({
	fetchLogin: vi.fn(async () => session),
	fetchLogout: vi.fn(async () => undefined),
	fetchSession: vi.fn(async () => session)
});

/** Every member of the `SessionAction` union, so the sweep below is total. */
const ALL_ACTIONS: SessionAction[] = [
	{ type: 'resolveSession' },
	{ type: 'sessionResolved', session: null, epoch: 0 },
	{ type: 'sessionResolved', session, epoch: 0 },
	{ type: 'sessionResolveFailed', error: { code: 'network', message: 'boom' }, epoch: 0 },
	{ type: 'login', seededUserId: 'u1' },
	{ type: 'loginSucceeded', session, epoch: 0 },
	{ type: 'loginFailed', error: { code: 'invalid_credentials', message: 'nope' }, epoch: 0 },
	{ type: 'logout' },
	{ type: 'loggedOut', epoch: 0 }
];

/** Drive the reducer into a genuine resolved-anonymous state. */
function anonymousState(): SessionState {
	const [resolving] = sessionReducer(createInitialSessionState(), { type: 'resolveSession' }, deps());
	const [anon] = sessionReducer(
		resolving,
		{ type: 'sessionResolved', session: null, epoch: resolving.epoch },
		deps()
	);
	return anon;
}

const settle = () => new Promise((r) => setTimeout(r, 60));

let cleanup: Array<() => void> = [];
afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

function mountGuard(store: ReturnType<typeof createStore<SessionState, SessionAction>>) {
	const onAnonymous = vi.fn();
	const target = document.createElement('div');
	document.body.appendChild(target);
	const component = mount(AuthGuard, { target, props: { store, onAnonymous } });
	flushSync();
	cleanup.push(() => {
		unmount(component);
		target.remove();
	});
	return onAnonymous;
}

describe('the reducer invariant AuthGuard depends on', () => {
	it('reaches a real anonymous state to test against', () => {
		// Guards the guard: if `anonymousState()` ever stops being anonymous, the
		// sweep below would pass while testing nothing.
		expect(anonymousState().status).toBe('anonymous');
	});

	it('never produces a new state object while remaining anonymous', () => {
		const anon = anonymousState();
		const offenders: string[] = [];

		for (const action of ALL_ACTIONS) {
			const [next] = sessionReducer(anon, action, deps());
			if (next.status === 'anonymous' && next !== anon) {
				offenders.push(action.type);
			}
		}

		expect(
			offenders,
			'an action now transitions anonymous -> anonymous with a fresh state object. ' +
				"`AuthGuard`'s `onAnonymous` effect will re-fire on it; narrow the effect " +
				'to the boolean it actually needs, or guard the call site.'
		).toEqual([]);
	});
});

/**
 * The actions that leave an anonymous session anonymous, computed from the
 * reducer rather than listed by hand — so this cannot drift.
 *
 * Measured on the current reducer: `sessionResolved` (both shapes),
 * `sessionResolveFailed`, `loginSucceeded`, `loginFailed` and `loggedOut` all
 * return the identical state (the last three via the epoch guard), while
 * `resolveSession`, `login` and `logout` genuinely transition out.
 */
function noOpActionsFromAnonymous(anon: SessionState): SessionAction[] {
	return ALL_ACTIONS.filter((a) => sessionReducer(anon, a, deps())[0] === anon);
}

describe('AuthGuard onAnonymous', () => {
	it('fires once when the session settles on anonymous', async () => {
		const store = createStore({
			initialState: createInitialSessionState(),
			reducer: sessionReducer,
			// Returns null, so the resolve settles *anonymous*. With the default
			// mock returning a session, the store's own resolve effect lands on
			// `authenticated` and the manual dispatch below is discarded by the
			// epoch guard — which is how this test first failed at 0 calls.
			dependencies: { ...deps(), fetchSession: vi.fn(async () => null) }
		});
		const onAnonymous = mountGuard(store);
		await settle();

		store.dispatch({ type: 'resolveSession' });
		flushSync();
		await settle();

		expect(store.state.status).toBe('anonymous');
		expect(onAnonymous).toHaveBeenCalledTimes(1);
	});

	it('does not re-fire on dispatches that leave it anonymous', async () => {
		const anon = anonymousState();
		const store = createStore({
			initialState: anon,
			reducer: sessionReducer,
			dependencies: deps()
		});
		const onAnonymous = mountGuard(store);
		await settle();
		expect(onAnonymous).toHaveBeenCalledTimes(1);

		const noOps = noOpActionsFromAnonymous(anon);
		// Guards the guard: an empty list would make the loop below vacuous.
		expect(noOps.length).toBeGreaterThan(0);

		for (const action of noOps) {
			store.dispatch(action);
			flushSync();
			await settle();
		}

		expect(store.state.status).toBe('anonymous');
		expect(
			onAnonymous,
			'onAnonymous re-fired while the session stayed anonymous'
		).toHaveBeenCalledTimes(1);
	});

	it('stays at one call across repeated resolve failures', async () => {
		// Names `sessionResolveFailed` explicitly rather than taking it from
		// `noOpActionsFromAnonymous`, and that distinction is the whole point:
		// the computed list is derived from the reducer, so a reducer that
		// started transitioning anonymous -> anonymous would simply drop out of
		// the list and this class of regression would go unobserved. Verified by
		// mutation — with that list, reverting the narrowing in `AuthGuard`
		// changed nothing.
		//
		// Today this passes either way, because the reducer no-ops here. It
		// locks in the behaviour for a reducer that does not.
		const store = createStore({
			initialState: anonymousState(),
			reducer: sessionReducer,
			dependencies: deps()
		});
		const onAnonymous = mountGuard(store);
		await settle();

		for (let i = 0; i < 3; i += 1) {
			store.dispatch({
				type: 'sessionResolveFailed',
				error: { code: 'network', message: `boom ${i}` },
				epoch: store.state.epoch
			});
			flushSync();
			await settle();
		}

		expect(store.state.status).toBe('anonymous');
		expect(onAnonymous).toHaveBeenCalledTimes(1);
	});

	it('fires again on a genuine re-entry into anonymous', async () => {
		// The other half, so the test above cannot pass by `onAnonymous` simply
		// never firing more than once. Leaving anonymous and coming back is two
		// entries and must be reported twice.
		const store = createStore({
			initialState: anonymousState(),
			reducer: sessionReducer,
			dependencies: deps()
		});
		const onAnonymous = mountGuard(store);
		await settle();
		expect(onAnonymous).toHaveBeenCalledTimes(1);

		store.dispatch({ type: 'login', seededUserId: 'u1' });
		flushSync();
		await settle();
		expect(store.state.status).toBe('authenticated');

		store.dispatch({ type: 'logout' });
		flushSync();
		await settle();

		expect(store.state.status).toBe('anonymous');
		expect(onAnonymous).toHaveBeenCalledTimes(2);
	});
});
