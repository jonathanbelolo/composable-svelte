/**
 * The collaborative WebSocket must have an owner.
 *
 * `deps.connectWebSocket` returns a cleanup function. `connectToConversation`
 * assigned it to a `const` inside an async closure and let it fall out of scope,
 * under a comment reading "Store cleanup function (would need to be tracked in
 * state)". Nothing ever called it. So:
 *
 *  - `disconnectFromConversation` returned an `Effect.run` with an empty body and
 *    a comment claiming "Cleanup handled by WebSocket manager" — there was no
 *    manager on that path, and nothing held a reference to anything. The state
 *    said `disconnected` over a socket that was still open, still delivering
 *    messages, and still running whatever heartbeat the consumer had started.
 *  - `reconnectRequested` re-dispatched `connectToConversation`, opening a second
 *    socket without closing the first.
 *  - Store teardown reached none of it.
 *
 * `Effect.subscription` is the shape that fixes all three: the store keeps the
 * cleanup, `Effect.cancel` runs it, `destroy()` runs it, and re-registering the
 * same id cancels the previous one first — which is why `reconnectRequested`
 * needs no change of its own.
 *
 * These are the first tests this reducer has ever had.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { createStore } from '@composable-svelte/core';
import { collaborativeReducer } from '../src/lib/streaming-chat/collaborative-reducer.js';
import { createInitialCollaborativeState } from '../src/lib/streaming-chat/collaborative-types.js';
import type {
	CollaborativeStreamingChatState,
	CollaborativeAction,
	WebSocketConnectionState
} from '../src/lib/streaming-chat/collaborative-types.js';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

let cleanup: Array<() => void> = [];
afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

/**
 * A fake transport that counts opens and closes.
 *
 * `onCleanup` lets a test run arbitrary code at teardown — which is how the
 * runaway guard below simulates a consumer whose close handler reports a
 * connection-state change.
 */
function makeStore(options: { onCleanup?: (dispatch: (a: CollaborativeAction) => void) => void } = {}) {
	const calls = { opened: 0, closed: 0 };
	let lastDispatch: ((a: CollaborativeAction) => void) | null = null;

	const store = createStore<CollaborativeStreamingChatState, CollaborativeAction>({
		initialState: createInitialCollaborativeState(),
		reducer: collaborativeReducer,
		dependencies: {
			connectWebSocket: (
				_conversationId: string,
				_userId: string,
				_onMessage: (m: unknown) => void,
				onConnectionChange: (s: WebSocketConnectionState) => void
			) => {
				calls.opened += 1;
				onConnectionChange({ status: 'connected', connectedAt: 0 });
				return () => {
					calls.closed += 1;
					if (options.onCleanup && lastDispatch) options.onCleanup(lastDispatch);
				};
			},
			sendWebSocketMessage: () => {},
			getTimestamp: () => 0
		} as never
	});
	lastDispatch = (a) => store.dispatch(a);
	cleanup.push(() => store.destroy?.());
	return { store, calls };
}

const connect = { type: 'connectToConversation', conversationId: 'c1', userId: 'u1' } as const;

describe('the collaborative socket', () => {
	it('opens exactly one connection', async () => {
		const { store, calls } = makeStore();
		store.dispatch(connect);
		await wait(20);

		expect(calls.opened).toBe(1);
		expect(calls.closed).toBe(0);
	});

	it('closes it on disconnect', async () => {
		const { store, calls } = makeStore();
		store.dispatch(connect);
		await wait(20);
		expect(calls.opened, 'the control failed — nothing was ever opened').toBe(1);

		store.dispatch({ type: 'disconnectFromConversation' });
		await wait(20);

		// The defect: the state said disconnected while the socket stayed open.
		expect(calls.closed, 'disconnect did not close the socket').toBe(1);
		expect(store.state.connection.status).toBe('disconnected');
	});

	it('closes before it reopens on reconnect', async () => {
		const { store, calls } = makeStore();
		store.dispatch(connect);
		await wait(20);

		store.dispatch({ type: 'reconnectRequested' });
		await wait(30);

		expect(calls.opened, 'reconnect did not reopen').toBe(2);
		// The defect: a second socket was opened while the first stayed open.
		expect(calls.closed, 'reconnect leaked the previous socket').toBe(1);
		expect(calls.opened - calls.closed, 'more than one socket is live').toBe(1);
	});

	it('does not stack sockets when connect is dispatched twice', async () => {
		const { store, calls } = makeStore();
		store.dispatch(connect);
		store.dispatch(connect);
		await wait(30);

		expect(calls.opened - calls.closed, 'two sockets are live at once').toBe(1);
	});

	it('closes it when the store is destroyed', async () => {
		const { store, calls } = makeStore();
		store.dispatch(connect);
		await wait(20);
		expect(calls.opened).toBe(1);

		store.destroy?.();
		await wait(20);

		expect(calls.closed, 'the socket outlived the store').toBe(1);
	});

	/**
	 * The runaway guard, and the reason this file exists in this shape.
	 *
	 * The media pass shipped a defect of exactly this form: repairing a feature's
	 * entry made a broken exit reachable, and the exit re-triggered the entry — an
	 * unbounded loop billing an API every 1.5 seconds, with no UI to stop it.
	 *
	 * Here the equivalent edge would be a cleanup that reports a connection-state
	 * change which something turns back into a connect. Nothing does that today,
	 * and nothing may: `connectionStateChanged` must stay a pure state write. This
	 * test is what fails if anyone ever wires it up.
	 */
	it('a cleanup that reports a failure does not cascade into more connections', async () => {
		const { store, calls } = makeStore({
			onCleanup: (dispatch) =>
				dispatch({
					type: 'connectionStateChanged',
					connection: { status: 'failed', reason: 'closed', canRetry: true }
				})
		});

		store.dispatch(connect);
		await wait(20);
		store.dispatch({ type: 'disconnectFromConversation' });
		await wait(60);

		expect(calls.opened, 'a cleanup re-entered the connect path').toBe(1);
		expect(calls.closed).toBe(1);
	});
});
