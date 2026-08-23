/**
 * A logout that never settles must not brick the store.
 *
 * From `status: 'loggingOut'` every action is a no-op except a matching
 * `loggedOut`, and the only thing that produces one is `fetchLogout`'s own
 * effect — a plain `Effect.run` with no timeout, no `AbortSignal` and no
 * cancellation. If that promise never settles, the store has no reachable exit:
 * `resolveSession` is blocked at reducer.ts:48-52, `login` at :116, a second
 * `logout` at :190, and all five feedback actions are rejected by their status
 * guards.
 *
 * What a user sees: they click sign out, `AuthGuard` keeps rendering the
 * authenticated UI (`showChildren` includes `loggingOut`) with
 * `isRevalidating: true`, and clicking sign out again does nothing. No error,
 * no timeout, forever.
 *
 * The asymmetry is the tell. `resolving` and `loggingIn` both have an escape —
 * `logout` is honoured from either — and the comment above that guard calls
 * logout "the user's exit hatch". It was the one operation with no exit hatch
 * of its own.
 */

import { describe, it, expect, vi } from 'vitest';
import { createStore } from '@composable-svelte/core';
import { sessionReducer, createInitialSessionState } from '../src/lib/session/reducer.js';
import type { SessionState, SessionAction, SessionDependencies } from '../src/lib/session/types.js';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A logout that never settles — a hung request, not a rejected one. */
function hungLogoutDeps(): SessionDependencies {
	return {
		fetchSession: vi.fn(async () => {
			throw new Error('not used');
		}),
		fetchLogin: vi.fn(async () => {
			throw new Error('not used');
		}),
		fetchLogout: vi.fn(() => new Promise<void>(() => {}))
	};
}

describe('a logout that never settles', () => {
	it('can be retried — the second dispatch is not swallowed', async () => {
		const deps = hungLogoutDeps();
		const store = createStore<SessionState, SessionAction, SessionDependencies>({
			initialState: createInitialSessionState(),
			reducer: sessionReducer,
			dependencies: deps
		});

		store.dispatch({ type: 'logout' });
		await wait(5);
		expect(store.state.status, 'precondition: the logout is in flight').toBe('loggingOut');
		expect(deps.fetchLogout).toHaveBeenCalledTimes(1);

		// The user gives up on the hung request and clicks sign out again.
		store.dispatch({ type: 'logout' });
		await wait(5);

		expect(
			deps.fetchLogout,
			'the retry was swallowed by the `loggingOut` guard — the store is stuck'
		).toHaveBeenCalledTimes(2);
	});

	it('a retry that succeeds reaches anonymous', async () => {
		// The journey that matters: first attempt hangs, second one works.
		// An array rather than a nullable binding: TS narrows a `let` that it
		// cannot see assigned to `null`, and `settleSecond?.()` then has no call
		// signatures.
		const settleSecond: Array<() => void> = [];
		let calls = 0;
		const deps: SessionDependencies = {
			fetchSession: vi.fn(async () => null),
			fetchLogin: vi.fn(async () => {
				throw new Error('not used');
			}),
			fetchLogout: vi.fn(() => {
				calls += 1;
				if (calls === 1) return new Promise<void>(() => {});
				return new Promise<void>((resolve) => {
					settleSecond.push(resolve);
				});
			})
		};

		const store = createStore<SessionState, SessionAction, SessionDependencies>({
			initialState: createInitialSessionState(),
			reducer: sessionReducer,
			dependencies: deps
		});

		store.dispatch({ type: 'logout' });
		await wait(5);
		store.dispatch({ type: 'logout' });
		await wait(5);

		settleSecond[0]?.();
		await wait(20);

		expect(store.state.status, 'the retry never completed').toBe('anonymous');
		expect(store.state.subject.kind).toBe('anonymous');
	});

	it('the superseded request cannot land after a retry', async () => {
		// The epoch guard's job: if the hung request eventually settles, its
		// `loggedOut` carries a stale epoch and must be ignored rather than
		// clobbering the state the retry produced.
		const settle: Array<() => void> = [];
		const deps: SessionDependencies = {
			fetchSession: vi.fn(async () => null),
			fetchLogin: vi.fn(async () => {
				throw new Error('not used');
			}),
			fetchLogout: vi.fn(() => new Promise<void>((resolve) => settle.push(resolve)))
		};

		const store = createStore<SessionState, SessionAction, SessionDependencies>({
			initialState: createInitialSessionState(),
			reducer: sessionReducer,
			dependencies: deps
		});

		store.dispatch({ type: 'logout' });
		await wait(5);
		store.dispatch({ type: 'logout' });
		await wait(5);

		// Second finishes, then the first finally does too.
		settle[1]?.();
		await wait(20);
		const afterRetry = store.state;

		settle[0]?.();
		await wait(20);

		expect(store.state.status).toBe('anonymous');
		expect(store.state.epoch, 'the stale request moved the epoch').toBe(afterRetry.epoch);
	});
});
