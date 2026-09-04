/**
 * Effect.websocket over the real live client and a scripted socket.
 *
 * `Effect.websocket.connect(client, id, url)` is a subscription; the store
 * runs the previous subscription's cleanup — `client.disconnect()` — before
 * the next one with the same id sets up. Before R1.4.d, disconnect() nulled
 * the socket with its handlers attached, so the old socket's late close ran
 * against the new connection: status 'reconnecting' with an OPEN socket, and
 * an action dispatched for a connection the store had already replaced
 * (AUDIT-2026-09-03-FINDINGS W6).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createStore } from '../../src/lib/store.svelte.js';
import { Effect } from '../../src/lib/effect.js';
import '../../src/lib/websocket/effect-websocket.js';
import { createLiveWebSocket } from '../../src/lib/websocket/live-client.js';
import type { WebSocketEvent } from '../../src/lib/websocket/types.js';
import { ScriptedWebSocket, installScriptedWebSocket } from '../helpers/scripted-websocket.js';

beforeEach(() => {
	vi.useFakeTimers();
	installScriptedWebSocket();
});

afterEach(() => {
	vi.useRealTimers();
});

interface State {
	events: string[];
	connections: number;
}
type Action = { type: 'connect' } | { type: 'socket'; event: WebSocketEvent };

describe('Effect.websocket.connect under the same subscription id', () => {
	it('the replaced connection cannot dispatch after its cleanup', async () => {
		const client = createLiveWebSocket({ reconnect: { enabled: true, maxAttempts: 3, initialDelay: 100, maxDelay: 1000, backoffMultiplier: 2, jitter: false } });
		const store = createStore<State, Action>({
			initialState: { events: [], connections: 0 },
			reducer: (state, action) => {
				switch (action.type) {
					case 'connect':
						return [
							{ ...state, connections: state.connections + 1 },
							Effect.websocket.connect(client, 'chat', 'wss://x.example', undefined, (event) => ({ type: 'socket', event }))
						];
					case 'socket':
						return [{ ...state, events: [...state.events, action.event.type] }, Effect.none()];
				}
			},
			dependencies: {}
		});

		store.dispatch({ type: 'connect' });
		ScriptedWebSocket.instances[0]!.open();
		await vi.advanceTimersByTimeAsync(0);
		expect(store.state.events).toEqual(['connected']);

		// The same id again: cleanup of the first (disconnect), then the second.
		store.dispatch({ type: 'connect' });
		await vi.advanceTimersByTimeAsync(0);
		expect(ScriptedWebSocket.instances).toHaveLength(2);
		ScriptedWebSocket.instances[1]!.open();
		await vi.advanceTimersByTimeAsync(0);
		const before = store.state.events.slice();

		// The first socket's late close: nothing reaches the store, and no
		// reconnect is scheduled for a connection that was replaced.
		ScriptedWebSocket.instances[0]!.closed(1006, false);
		await vi.advanceTimersByTimeAsync(10_000);

		expect(store.state.events).toEqual(before);
		expect(client.state.status).toBe('connected');
		expect(ScriptedWebSocket.instances).toHaveLength(2);
		store.destroy();
	});
});
