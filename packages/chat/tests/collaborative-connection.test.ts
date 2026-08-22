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
 * `reportOnClose` models the one thing a real `WebSocket` consumer does that the
 * naive fake does not: `close()` fires `onclose` on a later task, and the
 * standard shape reports that through the very `onConnectionChange` callback the
 * reducer handed in. So the report must go through *that* callback, not through
 * `store.dispatch` — otherwise the test bypasses the exact seam the fix installs
 * and proves nothing about it.
 */
function makeStore(options: { reportOnClose?: WebSocketConnectionState } = {}) {
	const calls = { opened: 0, closed: 0 };

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
					if (options.reportOnClose) {
						// Asynchronously, like a real onclose.
						const report = options.reportOnClose;
						setTimeout(() => onConnectionChange(report), 0);
					}
				};
			},
			sendWebSocketMessage: () => {},
			getTimestamp: () => 0
		} as never
	});
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
	 * The runaway guard — aimed at the door that is actually open.
	 *
	 * The first version of this test triggered cleanup through
	 * `disconnectFromConversation`, and that case nulls `conversationId` in the
	 * same reducer return, *before* the effect runs. So by the time the cleanup
	 * dispatched anything, every auto-reconnect edge was already short-circuited
	 * by the `!state.conversationId` guard. The test could not fail: adding the
	 * exact edge its comment forbade would have left it green.
	 *
	 * Reconnect is the dangerous path, because there `conversationId` survives.
	 * That is where a cleanup reporting a failure could feed back into another
	 * connect, and where the media pass's defect would live if it were here.
	 */
	it('a cleanup that reports a failure does not cascade, on the reconnect path', async () => {
		const { store, calls } = makeStore({
			reportOnClose: { status: 'failed', reason: 'closed', canRetry: true }
		});

		store.dispatch(connect);
		await wait(20);

		// conversationId is still set here — the guard that saved the old test is
		// not in play.
		expect(store.state.conversationId, 'the control failed').toBe('c1');
		store.dispatch({ type: 'reconnectRequested' });
		await wait(80);

		expect(calls.opened, 'the cleanup fed back into another connection').toBe(2);
		expect(calls.opened - calls.closed, 'more than one socket is live').toBe(1);
	});

	/**
	 * The other half of the same hazard, and the one that bites a real consumer.
	 *
	 * A real socket's `close()` fires `onclose` on a later task, and the standard
	 * shape reports that through `onConnectionChange`. Without a gate, the dead
	 * socket's close overwrites the live socket's state: a deliberate disconnect
	 * ends up displaying "connection failed", and a reconnect ends up reporting
	 * failed while a healthy socket delivers messages.
	 */
	it('a dead socket cannot clobber the connection state', async () => {
		const { store } = makeStore({
			reportOnClose: { status: 'failed', reason: 'socket closed', canRetry: true }
		});

		store.dispatch(connect);
		await wait(20);
		store.dispatch({ type: 'disconnectFromConversation' });
		await wait(40);

		expect(
			store.state.connection.status,
			'the closing socket reported failure over a deliberate disconnect'
		).toBe('disconnected');
	});
});

const ME = 'u1';

/** A connected store whose outgoing frames land in `sent`. */
function connected(sent: unknown[]) {
	const store = createStore<CollaborativeStreamingChatState, CollaborativeAction>({
		initialState: createInitialCollaborativeState(),
		reducer: collaborativeReducer,
		dependencies: {
			connectWebSocket: (
				_conversationId: string,
				_userId: string,
				_onMessage: (m: unknown) => void,
				onConnectionChange: (state: WebSocketConnectionState) => void
			) => {
				onConnectionChange({ status: 'connected', connectedAt: 0 });
				return () => {};
			},
			sendWebSocketMessage: async (message: unknown) => {
				sent.push(message);
			},
			getTimestamp: () => 0
		} as never
	});
	cleanup.push(() => store.destroy?.());
	store.dispatch({ type: 'connectToConversation', conversationId: 'c1', userId: ME });
	return store;
}

describe('what actually leaves the browser', () => {
	// `usePresenceTracking` and `useHeartbeat` are documented as tracking status
	// and keeping the connection alive. Both dispatched actions whose reducer
	// cases returned `Effect.none()`, so no frame ever left: a keep-alive that
	// kept nothing alive, and a presence change nobody else could see.
	//
	// The rule now is directional — a change to *my own* state is broadcast, a
	// change to anyone else's arrived from the wire — which is also what stops it
	// echoing.

	it('broadcasts my own presence change', async () => {
		const sent: unknown[] = [];
		const store = connected(sent);

		store.dispatch({ type: 'userPresenceChanged', userId: ME, presence: 'away' });
		await wait(10);

		expect(sent).toEqual([{ type: 'presence_changed', userId: ME, presence: 'away' }]);
	});

	it('does not echo someone else’s presence change back at them', async () => {
		const sent: unknown[] = [];
		const store = connected(sent);

		store.dispatch({ type: 'userPresenceChanged', userId: 'someone-else', presence: 'away' });
		await wait(10);

		expect(sent, 'a remote change was reflected back to the server').toEqual([]);
	});

	it('broadcasts my own heartbeat', async () => {
		const sent: unknown[] = [];
		const store = connected(sent);

		store.dispatch({ type: 'heartbeatReceived', userId: ME, timestamp: 1234 });
		await wait(10);

		expect(sent).toEqual([{ type: 'heartbeat', userId: ME, timestamp: 1234 }]);
	});

	it('does not echo someone else’s heartbeat', async () => {
		const sent: unknown[] = [];
		const store = connected(sent);

		store.dispatch({ type: 'heartbeatReceived', userId: 'someone-else', timestamp: 1234 });
		await wait(10);

		expect(sent).toEqual([]);
	});
});
