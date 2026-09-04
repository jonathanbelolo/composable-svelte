/**
 * Subscription teardown must survive what real consumers actually return.
 *
 * `Effect.subscription`'s cleanup used to be stored and never called on some
 * paths, so none of this was reachable. Making it reachable — which chat's
 * socket lifetime depends on — exposed three holes in the store, all of them in
 * code that only runs once a cleanup genuinely fires.
 *
 * The reachability is not hypothetical. The shape this package documents for
 * `connectWebSocket` in its own styleguide returns nothing at all.
 */

import { describe, it, expect } from 'vitest';
import { expectConsole } from './helpers/console.js';
import { createStore } from '../src/lib/store.svelte';
import { Effect } from '../src/lib/effect';

type S = { n: number };
type A = { type: 'go' } | { type: 'stop' } | { type: 'ping' };

function storeWith(setup: (dispatch: (a: A) => void) => unknown) {
	return createStore<S, A>({
		initialState: { n: 0 },
		reducer: (state, action) => {
			if (action.type === 'go') return [state, Effect.subscription('sub', setup as never)];
			if (action.type === 'stop') return [state, Effect.cancel('sub')];
			return [{ n: state.n + 1 }, Effect.none()];
		}
	});
}

describe('subscription teardown', () => {
	it('survives a setup that returns nothing', () => {
		// The documented consumer shape. Storing `undefined` and later calling it
		// threw a synchronous TypeError out of destroy(), which the surrounding
		// `.catch` cannot see — so the remaining cleanups, the subscription map,
		// the debounce timers and the subscriber list were all left untouched.
		const store = storeWith(() => undefined);
		store.dispatch({ type: 'go' });

		expect(() => store.destroy?.()).not.toThrow();
	});

	it('survives a cleanup that throws synchronously', () => {
		expectConsole('error');
		const store = storeWith(() => () => {
			throw new Error('close failed');
		});
		store.dispatch({ type: 'go' });

		// Via Effect.cancel: the throw used to escape through dispatch() and out of
		// the caller's click handler, and the entry was never removed — so it threw
		// again at destroy().
		expect(() => store.dispatch({ type: 'stop' })).not.toThrow();
		expect(() => store.destroy?.()).not.toThrow();
	});

	it('still tears down everything after one cleanup fails', () => {
		expectConsole('error');
		let second = 0;
		const store = createStore<S, A>({
			initialState: { n: 0 },
			reducer: (state, action) => {
				if (action.type === 'go') {
					return [
						state,
						Effect.batch(
							Effect.subscription('bad', () => () => {
								throw new Error('nope');
							}),
							Effect.subscription('good', () => () => {
								second += 1;
							})
						)
					];
				}
				return [state, Effect.none()];
			}
		});
		store.dispatch({ type: 'go' });
		store.destroy?.();

		expect(second, 'a failing cleanup aborted the rest of teardown').toBe(1);
	});

	it('ignores dispatches from a subscription that has been cancelled', async () => {
		// A real socket's `close()` fires `onclose` asynchronously, and consumers
		// report that as a connection-state change. Without a gate, a deliberate
		// disconnect ends with the store believing the connection failed — and on
		// reconnect, the *old* socket's close clobbers the new one's healthy state.
		let late: (() => void) | null = null;
		const store = createStore<S, A>({
			initialState: { n: 0 },
			reducer: (state, action) => {
				if (action.type === 'go') {
					return [
						state,
						Effect.subscription('sub', (dispatch) => {
							return () => {
								late = () => dispatch({ type: 'ping' });
							};
						})
					];
				}
				if (action.type === 'stop') return [state, Effect.cancel('sub')];
				return [{ n: state.n + 1 }, Effect.none()];
			}
		});

		store.dispatch({ type: 'go' });
		store.dispatch({ type: 'stop' });
		expect(late, 'the control failed — cleanup never ran').not.toBeNull();

		late!();
		await new Promise((r) => setTimeout(r, 10));

		expect(store.state.n, 'a dead subscription still dispatched').toBe(0);
		store.destroy?.();
	});
});
