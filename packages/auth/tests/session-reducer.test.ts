/**
 * Session reducer tests — TestStore send/receive with mock dependencies.
 *
 * Per TestStore guidance: receive() matches on type only, then asserts on
 * state (partial nested matching is unreliable in browser mode).
 */

import { describe, it, expect, vi } from 'vitest';
import { createTestStore } from '@composable-svelte/core/test';
import {
	createInitialSessionState,
	sessionReducer
} from '../src/lib/session/reducer';
import type { SessionDependencies, SessionState } from '../src/lib/session/types';
import { subjectFromSession } from '../src/lib/subject/helpers';
import type { SessionSnapshot } from '../src/lib/subject/types';

const session: SessionSnapshot = {
	subject_id: '3f2a58f0-0000-0000-0000-000000000001',
	display_name: 'Booking Agent',
	roles: ['agent']
};

function mockDeps(overrides?: Partial<SessionDependencies>): SessionDependencies {
	return {
		fetchLogin: vi.fn(async () => session),
		fetchLogout: vi.fn(async () => undefined),
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

/** A promise resolved manually — keeps an effect in flight deterministically. */
function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

const authenticatedState: SessionState = {
	status: 'authenticated',
	subject: subjectFromSession(session),
	error: null
};

describe('resolveSession', () => {
	it('resolves an existing session to authenticated', async () => {
		const deps = mockDeps();
		const store = makeStore(deps);

		await store.send({ type: 'resolveSession' }, (state) => {
			expect(state.status).toBe('resolving');
			expect(state.error).toBeNull();
		});

		await store.receive({ type: 'sessionResolved' }, (state) => {
			expect(state.status).toBe('authenticated');
			expect(state.subject.kind).toBe('authenticated');
			if (state.subject.kind === 'authenticated') {
				expect(state.subject.id).toBe(session.subject_id);
				expect(state.subject.attributes['roles']).toEqual(['agent']);
			}
		});

		expect(deps.fetchSession).toHaveBeenCalledTimes(1);
		store.assertNoPendingActions();
	});

	it('resolves a null session to anonymous', async () => {
		const store = makeStore(mockDeps({ fetchSession: vi.fn(async () => null) }));

		await store.send({ type: 'resolveSession' });
		await store.receive({ type: 'sessionResolved' }, (state) => {
			expect(state.status).toBe('anonymous');
			expect(state.subject.kind).toBe('anonymous');
			expect(state.error).toBeNull();
		});

		store.assertNoPendingActions();
	});

	it('fails closed to anonymous when the resolve call rejects', async () => {
		const store = makeStore(
			mockDeps({
				fetchSession: vi.fn(async () => {
					throw new Error('network down');
				})
			})
		);

		await store.send({ type: 'resolveSession' });
		await store.receive({ type: 'sessionResolveFailed' }, (state) => {
			expect(state.status).toBe('anonymous');
			expect(state.subject.kind).toBe('anonymous');
			expect(state.error).toBe('network down');
		});

		store.assertNoPendingActions();
	});

	it('ignores a duplicate resolveSession while one is in flight', async () => {
		// Hold the first resolve open so the second send provably races it.
		const gate = deferred<SessionSnapshot | null>();
		const deps = mockDeps({ fetchSession: vi.fn(() => gate.promise) });
		const store = makeStore(deps);

		await store.send({ type: 'resolveSession' });
		// Second resolve while the first is still in flight: guarded no-op.
		await store.send({ type: 'resolveSession' }, (state) => {
			expect(state.status).toBe('resolving');
		});
		expect(deps.fetchSession).toHaveBeenCalledTimes(1);

		gate.resolve(session);
		await store.receive({ type: 'sessionResolved' });
		expect(deps.fetchSession).toHaveBeenCalledTimes(1);
		store.assertNoPendingActions();
	});
});

describe('login', () => {
	it('logs in a seeded user and becomes authenticated', async () => {
		const deps = mockDeps();
		const store = makeStore(deps);

		await store.send({ type: 'login', seededUserId: 'seeded-agent' }, (state) => {
			expect(state.status).toBe('loggingIn');
			expect(state.error).toBeNull();
		});

		await store.receive({ type: 'loginSucceeded' }, (state) => {
			expect(state.status).toBe('authenticated');
			if (state.subject.kind === 'authenticated') {
				expect(state.subject.attributes['display_name']).toBe('Booking Agent');
			} else {
				expect.unreachable('subject must be authenticated');
			}
		});

		expect(deps.fetchLogin).toHaveBeenCalledWith('seeded-agent');
		store.assertNoPendingActions();
	});

	it('records a failed login as loginFailed with an anonymous subject', async () => {
		const store = makeStore(
			mockDeps({
				fetchLogin: vi.fn(async () => {
					throw new Error('Unknown account');
				})
			})
		);

		await store.send({ type: 'login', seededUserId: 'nobody' });
		await store.receive({ type: 'loginFailed' }, (state) => {
			expect(state.status).toBe('loginFailed');
			expect(state.subject.kind).toBe('anonymous');
			expect(state.error).toBe('Unknown account');
		});

		store.assertNoPendingActions();
	});

	it('ignores a duplicate login while one is in flight', async () => {
		// Hold the first login open so the second send provably races it.
		const gate = deferred<SessionSnapshot>();
		const deps = mockDeps({ fetchLogin: vi.fn(() => gate.promise) });
		const store = makeStore(deps);

		await store.send({ type: 'login', seededUserId: 'seeded-agent' });
		await store.send({ type: 'login', seededUserId: 'seeded-agent' }, (state) => {
			expect(state.status).toBe('loggingIn');
		});
		expect(deps.fetchLogin).toHaveBeenCalledTimes(1);

		gate.resolve(session);
		await store.receive({ type: 'loginSucceeded' });
		expect(deps.fetchLogin).toHaveBeenCalledTimes(1);
		store.assertNoPendingActions();
	});
});

describe('logout', () => {
	it('invalidates the session server-side and goes anonymous', async () => {
		const deps = mockDeps();
		const store = makeStore(deps, authenticatedState);

		await store.send({ type: 'logout' }, (state) => {
			// No optimistic state change — the transition happens on loggedOut.
			expect(state.status).toBe('authenticated');
		});

		await store.receive({ type: 'loggedOut' }, (state) => {
			expect(state.status).toBe('anonymous');
			expect(state.subject.kind).toBe('anonymous');
			expect(state.error).toBeNull();
		});

		expect(deps.fetchLogout).toHaveBeenCalledTimes(1);
		store.assertNoPendingActions();
	});

	it('still goes anonymous client-side when the logout call fails (fail-closed)', async () => {
		const store = makeStore(
			mockDeps({
				fetchLogout: vi.fn(async () => {
					throw new Error('server unreachable');
				})
			}),
			authenticatedState
		);

		await store.send({ type: 'logout' });
		await store.receive({ type: 'loggedOut' }, (state) => {
			expect(state.status).toBe('anonymous');
			expect(state.subject.kind).toBe('anonymous');
			expect(state.error).toBe('server unreachable');
		});

		store.assertNoPendingActions();
	});
});
