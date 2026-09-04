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
				epoch: 3,
				expiresAt: null
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
			epoch: 7,
			expiresAt: null
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
			epoch: 1,
			expiresAt: null
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
		// after the flow has authenticated. The resolve is genuinely in flight —
		// a fetch that does not settle until the flow has announced itself.
		// (The first form sent a synthetic `sessionResolved` while the real one
		// sat unasserted in the queue, which TestStore now refuses.)
		type Resolved = Awaited<ReturnType<SessionDependencies['fetchSession']>>;
		let settle!: (value: Resolved) => void;
		const store = makeStore(
			mockDeps({
				fetchSession: vi.fn(() => new Promise<Resolved>((resolve) => { settle = resolve; }))
			})
		);

		await store.send({ type: 'resolveSession' }, (state) => {
			expect(state.epoch).toBe(1);
		});
		await store.send({ type: 'loginStarted' }, (state) => {
			expect(state.epoch).toBe(2);
		});

		// The resolve lands now. Its feedback carries epoch 1 and is stale.
		settle(null);
		await store.receive({ type: 'sessionResolved', epoch: 1 }, (state) => {
			expect(state.status, 'stale resolve feedback overwrote a login in flight').toBe(
				'loggingIn'
			);
		});
		await store.finish();
	});

	it('is refused while a sign-out is in flight', async () => {
		const store = makeStore(mockDeps(), {
			status: 'loggingOut',
			subject: { kind: 'anonymous' },
			error: null,
			epoch: 2,
			expiresAt: null
		});

		await store.send({ type: 'loginStarted' }, (state) => {
			expect(state.status).toBe('loggingOut');
			expect(state.epoch, 'a refused action must not consume an epoch').toBe(2);
		});
	});
});

describe('a flow whose sign-in fails', () => {
	it('can hand the failure back with the epoch it is holding', async () => {
		// The counterpart to `sessionEstablished`, and the reason `loginStarted`
		// is documented with it: a flow that moved the session into `loggingIn`
		// must be able to move it out again. `loginFailed` is that path, and it
		// needs the current epoch — which is not racy, because dispatch is
		// synchronous and nothing can bump the epoch in between.
		const store = makeStore(mockDeps());

		await store.send({ type: 'loginStarted' }, (state) => {
			expect(state.status).toBe('loggingIn');
		});

		await store.send(
			{
				type: 'loginFailed',
				error: { code: 'invalid_credentials', message: 'Wrong password.' },
				epoch: store.state.epoch
			},
			(state) => {
				expect(state.status).toBe('loginFailed');
				expect(state.error?.code).toBe('invalid_credentials');
			}
		);

		store.assertNoPendingActions();
	});

	it('leaves an already-authenticated user signed in when a re-auth fails', async () => {
		// Same rule the seeded `login` path follows: a failed re-authentication
		// must not sign out the session the user already had.
		const store = makeStore(mockDeps(), {
			status: 'authenticated',
			subject: { kind: 'authenticated', id: 'u1', attributes: { roles: [] } },
			error: null,
			epoch: 4,
			expiresAt: null
		});

		await store.send({ type: 'loginStarted' }, (state) => {
			expect(state.subject.kind, 'the subject must survive the transition').toBe(
				'authenticated'
			);
		});

		await store.send(
			{
				type: 'loginFailed',
				error: { code: 'network', message: 'offline' },
				epoch: store.state.epoch
			},
			(state) => {
				expect(state.status).toBe('authenticated');
				expect(state.error?.code).toBe('network');
			}
		);
	});
});
