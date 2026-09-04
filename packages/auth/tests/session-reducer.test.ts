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
import type { AuthError } from '../src/lib/errors/types';

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
	error: null,
	epoch: 0,
	expiresAt: null
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
		// The dependency rejects the way the HTTP adapter now does — with an
		// `AuthError`, not a bare `Error`. This test used to throw
		// `new Error('network down')` while its comment claimed `toAuthError`
		// "reads the TypeError `fetch` throws as `network`". A plain `Error` is
		// never a `TypeError`, so the code was `unknown` and the assertion only
		// ever checked the message — a vacuous pass sitting on the defect the
		// comment described.
		const store = makeStore(
			mockDeps({
				fetchSession: vi.fn(async () => {
					throw {
						code: 'network',
						message: 'Could not reach the server. Check your connection and try again.'
					} satisfies AuthError;
				})
			})
		);

		await store.send({ type: 'resolveSession' });
		await store.receive({ type: 'sessionResolveFailed' }, (state) => {
			expect(state.status).toBe('anonymous');
			expect(state.subject.kind).toBe('anonymous');
			// The code is the part a caller branches on before offering a retry,
			// and it is the part nothing checked.
			expect(state.error?.code).toBe('network');
			expect(state.error?.message).toContain('Could not reach the server');
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

	it('records a failed login as loginFailed when there was no prior session', async () => {
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
			expect(state.error?.message).toBe('Unknown account');
		});

		store.assertNoPendingActions();
	});

	it('restores the prior authenticated session when a re-login fails', async () => {
		// The server only replaces the session cookie on a SUCCESSFUL login —
		// a failed switch-user attempt leaves the old session valid, so the
		// store must restore it rather than kick the user to loginFailed.
		const store = makeStore(
			mockDeps({
				fetchLogin: vi.fn(async () => {
					throw new Error('Unknown account');
				})
			}),
			authenticatedState
		);

		await store.send({ type: 'login', seededUserId: 'nobody' }, (state) => {
			expect(state.status).toBe('loggingIn');
			// Prior subject retained through the attempt.
			expect(state.subject.kind).toBe('authenticated');
		});

		await store.receive({ type: 'loginFailed' }, (state) => {
			expect(state.status).toBe('authenticated');
			expect(state.subject.kind).toBe('authenticated');
			if (state.subject.kind === 'authenticated') {
				expect(state.subject.id).toBe(session.subject_id);
			}
			// The failure is still surfaced for the login UI.
			expect(state.error?.message).toBe('Unknown account');
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
			// In-flight marker only — the anonymous transition happens on loggedOut.
			expect(state.status).toBe('loggingOut');
			expect(state.subject.kind).toBe('authenticated');
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
			expect(state.error?.message).toBe('server unreachable');
		});

		store.assertNoPendingActions();
	});

	it('supersedes a duplicate logout rather than swallowing it', async () => {
		// This used to assert the opposite — that the second dispatch was a
		// guarded no-op firing a single request. That guard made logout the only
		// operation with no way out of its own in-flight state: nothing else is
		// honoured from `loggingOut`, and the only thing that leaves it is this
		// effect's own `loggedOut`. A request that never settled trapped the
		// store permanently, and clicking sign out again did nothing.
		//
		// It is `Effect.cancellable` under a fixed id now, so re-dispatching
		// cancels the in-flight request and starts a fresh one. The mock does
		// not honour the abort signal, so it records two calls; the real
		// `fetchLogout` is handed the signal and aborts (`http.ts`).
		// `tests/logout-liveness.test.ts` covers the journey end to end.
		// A fresh gate per call, so the superseded request can be left hanging —
		// which is what the abort does in the real implementation.
		const gates: Array<ReturnType<typeof deferred<void>>> = [];
		const deps = mockDeps({
			fetchLogout: vi.fn(() => {
				const gate = deferred<void>();
				gates.push(gate);
				return gate.promise;
			})
		});
		const store = makeStore(deps, authenticatedState);

		await store.send({ type: 'logout' }, (state) => {
			expect(state.status).toBe('loggingOut');
		});
		await store.send({ type: 'logout' }, (state) => {
			expect(state.status).toBe('loggingOut');
		});
		expect(deps.fetchLogout, 'the retry was swallowed').toHaveBeenCalledTimes(2);

		gates[1]!.resolve(undefined);
		await store.receive({ type: 'loggedOut', epoch: 2 }, (state) => {
			expect(state.status).toBe('anonymous');
		});
		store.assertNoPendingActions();
	});
});

describe('stale-feedback races', () => {
	it('slow resolve superseded by login: stale sessionResolved(null) does not clobber authenticated', async () => {
		// Hold the resolve open; log in while it is still in flight.
		const gate = deferred<SessionSnapshot | null>();
		const deps = mockDeps({ fetchSession: vi.fn(() => gate.promise) });
		const store = makeStore(deps);

		await store.send({ type: 'resolveSession' }, (state) => {
			expect(state.status).toBe('resolving');
		});
		// Explicit user intent supersedes the background resolve.
		await store.send({ type: 'login', seededUserId: 'seeded-agent' }, (state) => {
			expect(state.status).toBe('loggingIn');
		});
		await store.receive({ type: 'loginSucceeded' }, (state) => {
			expect(state.status).toBe('authenticated');
		});

		// The slow resolve finally lands anonymous — it must be discarded.
		gate.resolve(null);
		await store.receive({ type: 'sessionResolved' }, (state) => {
			expect(state.status).toBe('authenticated');
			expect(state.subject.kind).toBe('authenticated');
		});

		store.assertNoPendingActions();
	});

	it('logout during resolving: stale sessionResolved(session) does not resurrect the session', async () => {
		// Hold the resolve open; log out while it is still in flight.
		const gate = deferred<SessionSnapshot | null>();
		const deps = mockDeps({ fetchSession: vi.fn(() => gate.promise) });
		const store = makeStore(deps);

		await store.send({ type: 'resolveSession' }, (state) => {
			expect(state.status).toBe('resolving');
		});
		await store.send({ type: 'logout' }, (state) => {
			expect(state.status).toBe('loggingOut');
		});
		await store.receive({ type: 'loggedOut' }, (state) => {
			expect(state.status).toBe('anonymous');
		});

		// The slow resolve finally lands with a live session — it must NOT
		// resurrect `authenticated` after the user signed out.
		gate.resolve(session);
		await store.receive({ type: 'sessionResolved' }, (state) => {
			expect(state.status).toBe('anonymous');
			expect(state.subject.kind).toBe('anonymous');
		});

		store.assertNoPendingActions();
	});
});

describe('request-epoch feedback attribution', () => {
	// These races cannot be caught by status-equality guards alone: by the
	// time the stale feedback lands, a NEWER request of the same kind has put
	// the store back into the very status the guard checks for. Only the
	// epoch stamped into the feedback tells the two requests apart.

	it('resolve → logout → resolve: the first resolve cannot resurrect the dead session', async () => {
		const first = deferred<SessionSnapshot | null>();
		const second = deferred<SessionSnapshot | null>();
		const fetchSession = vi
			.fn<() => Promise<SessionSnapshot | null>>()
			.mockImplementationOnce(() => first.promise)
			.mockImplementationOnce(() => second.promise);
		const store = makeStore(mockDeps({ fetchSession }));

		await store.send({ type: 'resolveSession' }); // epoch 1 — held open
		await store.send({ type: 'logout' }); // epoch 2 — supersedes the resolve
		await store.receive({ type: 'loggedOut' }, (state) => {
			expect(state.status).toBe('anonymous');
		});
		await store.send({ type: 'resolveSession' }, (state) => {
			// epoch 3 — status is `resolving` AGAIN
			expect(state.status).toBe('resolving');
		});

		// The FIRST (pre-logout) resolve lands with a live session. Status
		// matches (`resolving`), so only the epoch guard can reject it — the
		// session the user signed out of must NOT be resurrected.
		first.resolve(session);
		await store.receive({ type: 'sessionResolved' }, (state) => {
			expect(state.status).toBe('resolving');
			expect(state.subject.kind).toBe('anonymous');
		});

		// The second resolve settles the truth: anonymous.
		second.resolve(null);
		await store.receive({ type: 'sessionResolved' }, (state) => {
			expect(state.status).toBe('anonymous');
			expect(state.subject.kind).toBe('anonymous');
		});

		expect(fetchSession).toHaveBeenCalledTimes(2);
		store.assertNoPendingActions();
	});

	it('slow login A + logout + login B: A\'s late success is not misattributed to B', async () => {
		const sessionB: SessionSnapshot = {
			subject_id: '3f2a58f0-0000-0000-0000-000000000002',
			display_name: 'Product Owner',
			roles: ['owner']
		};
		const loginA = deferred<SessionSnapshot>();
		const loginB = deferred<SessionSnapshot>();
		const fetchLogin = vi
			.fn<(seededUserId: string) => Promise<SessionSnapshot>>()
			.mockImplementationOnce(() => loginA.promise)
			.mockImplementationOnce(() => loginB.promise);
		const store = makeStore(mockDeps({ fetchLogin }));

		await store.send({ type: 'login', seededUserId: 'user-a' }); // epoch 1 — held open
		await store.send({ type: 'logout' }); // epoch 2 — user exits mid-login
		await store.receive({ type: 'loggedOut' }, (state) => {
			expect(state.status).toBe('anonymous');
		});
		await store.send({ type: 'login', seededUserId: 'user-b' }, (state) => {
			// epoch 3 — status is `loggingIn` AGAIN
			expect(state.status).toBe('loggingIn');
		});

		// Login A finally succeeds. Status matches (`loggingIn`), so only the
		// epoch guard can reject it — the store must NOT authenticate as A
		// while the user is waiting on B.
		loginA.resolve(session);
		await store.receive({ type: 'loginSucceeded' }, (state) => {
			expect(state.status).toBe('loggingIn');
			expect(state.subject.kind).toBe('anonymous');
		});

		// Login B lands and is the one that authenticates.
		loginB.resolve(sessionB);
		await store.receive({ type: 'loginSucceeded' }, (state) => {
			expect(state.status).toBe('authenticated');
			if (state.subject.kind === 'authenticated') {
				expect(state.subject.id).toBe(sessionB.subject_id);
			} else {
				expect.unreachable('subject must be authenticated');
			}
		});

		expect(fetchLogin).toHaveBeenCalledTimes(2);
		store.assertNoPendingActions();
	});
});
