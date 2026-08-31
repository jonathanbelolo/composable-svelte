/**
 * The handover: a flow outside this store completing a sign-in.
 *
 * The session store owns "who am I". It does not own every way of becoming
 * someone — a credentials login, an MFA challenge, an OAuth callback and a magic
 * link each run their own reducer with their own multi-step state, and all of
 * them finish the same way, with a `SessionSnapshot`. `sessionEstablished` is
 * how they hand it over, and `loginStarted` is how they ask for the pending UI
 * while they work.
 *
 * The interesting part is the one status that refuses the handover. Everything
 * else about these two arms is bookkeeping.
 */

import { describe, it, expect, vi } from 'vitest';
import { createTestStore } from '@composable-svelte/core/test';
import { sessionReducer, createInitialSessionState } from '../src/lib/session/index.js';
import type { SessionDependencies, SessionState } from '../src/lib/session/index.js';
import type { SessionSnapshot } from '../src/lib/subject/index.js';

const session: SessionSnapshot = {
	subject_id: '11111111-2222-3333-4444-555555555555',
	display_name: 'Ada',
	roles: ['admin']
};

function mockDeps(overrides?: Partial<SessionDependencies>): SessionDependencies {
	return {
		fetchLogin: vi.fn(async () => session),
		fetchLogout: vi.fn(async () => {}),
		fetchSession: vi.fn(async () => session),
		...overrides
	};
}

function makeStore(deps: SessionDependencies, initialState?: SessionState) {
	return createTestStore({
		initialState: initialState ?? createInitialSessionState(),
		reducer: sessionReducer,
		dependencies: deps
	});
}

describe('a flow establishing a session', () => {
	it('authenticates from unresolved, without any login of its own', async () => {
		// The OAuth-callback shape: the app boots straight into a completed
		// sign-in, with no `login` ever dispatched to this store.
		const store = makeStore(mockDeps());

		await store.send({ type: 'sessionEstablished', session }, (state) => {
			expect(state.status).toBe('authenticated');
			expect(state.subject.kind).toBe('authenticated');
			expect(state.error).toBeNull();
		});

		store.assertNoPendingActions();
	});

	it('clears a previous failure', async () => {
		// A user who failed once and then succeeded through another route should
		// not still be looking at the first error.
		const store = makeStore(
			mockDeps(),
			{
				status: 'loginFailed',
				subject: { kind: 'anonymous' },
				error: { code: 'invalid_credentials', message: 'Wrong password.' },
				epoch: 3
			}
		);

		await store.send({ type: 'sessionEstablished', session }, (state) => {
			expect(state.status).toBe('authenticated');
			expect(state.error).toBeNull();
		});
	});

	it('is refused while a sign-out is in flight', async () => {
		// The race this guard exists for. A slow sign-in resolving after the user
		// has hit sign-out would otherwise put them back in an authenticated
		// session they explicitly left.
		const store = makeStore(mockDeps(), {
			status: 'loggingOut',
			subject: { kind: 'anonymous' },
			error: null,
			epoch: 7
		});

		await store.send({ type: 'sessionEstablished', session }, (state) => {
			expect(state.status, 'a late sign-in re-authenticated a user who signed out').toBe(
				'loggingOut'
			);
			expect(state.subject.kind).toBe('anonymous');
		});
	});

	it('supersedes a background resolve, as an explicit login does', async () => {
		// Same principle the `login` arm already states: user intent beats a
		// resolve that happens to be in flight.
		const store = makeStore(mockDeps(), {
			status: 'resolving',
			subject: { kind: 'anonymous' },
			error: null,
			epoch: 1
		});

		await store.send({ type: 'sessionEstablished', session }, (state) => {
			expect(state.status).toBe('authenticated');
		});
	});
});

describe('a flow announcing that it has started', () => {
	it('shows the pending status without performing any I/O', async () => {
		const deps = mockDeps();
		const store = makeStore(deps);

		await store.send({ type: 'loginStarted' }, (state) => {
			expect(state.status).toBe('loggingIn');
		});

		// The flow owns its own async. This arm must not start a second login.
		expect(deps.fetchLogin).not.toHaveBeenCalled();
		store.assertNoPendingActions();
	});

	it('bumps the epoch so an in-flight resolve cannot land on top of it', async () => {
		// Without this, a resolve started before the flow could return anonymous
		// after the flow has authenticated.
		const store = makeStore(mockDeps());

		await store.send({ type: 'resolveSession' }, (state) => {
			expect(state.epoch).toBe(1);
		});
		await store.send({ type: 'loginStarted' }, (state) => {
			expect(state.epoch).toBe(2);
		});

		// The resolve's feedback carries epoch 1 and is now stale.
		await store.send({ type: 'sessionResolved', session: null, epoch: 1 }, (state) => {
			expect(state.status, 'stale resolve feedback overwrote a login in flight').toBe(
				'loggingIn'
			);
		});

		await store.receive({ type: 'sessionResolved' });
	});

	it('is refused while a sign-out is in flight', async () => {
		const store = makeStore(mockDeps(), {
			status: 'loggingOut',
			subject: { kind: 'anonymous' },
			error: null,
			epoch: 2
		});

		await store.send({ type: 'loginStarted' }, (state) => {
			expect(state.status).toBe('loggingOut');
			expect(state.epoch, 'a refused action must not consume an epoch').toBe(2);
		});
	});
});
