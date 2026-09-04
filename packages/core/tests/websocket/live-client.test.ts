/**
 * The real live client over a scripted socket.
 *
 * Every other file in this directory tests the mock client, the heartbeat,
 * the queue or the router; this is the first to import `live-client.ts`.
 * R0.3.b landed the harness and a smoke test; R1.4 adds the behaviour tests.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createLiveWebSocket } from '../../src/lib/websocket/live-client.js';
import {
	ScriptedWebSocket,
	installScriptedWebSocket
} from '../helpers/scripted-websocket.js';
import { WS_ERROR_CODES, type WebSocketEvent } from '../../src/lib/websocket/types.js';


beforeEach(() => {
	vi.useFakeTimers();
	installScriptedWebSocket();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('createLiveWebSocket over a scripted socket', () => {
	it('connects when the socket opens, and closes it on disconnect', async () => {
		const client = createLiveWebSocket();

		const connecting = client.connect('wss://x.example');
		const socket = ScriptedWebSocket.instances[0]!;
		expect(socket.url).toBe('wss://x.example');
		expect(client.state.status).toBe('connecting');

		socket.open();
		await connecting;
		expect(client.state.status).toBe('connected');

		await client.disconnect();
		expect(client.state.status).toBe('disconnected');
		expect(socket.closeCalls).toEqual([{ code: 1000, reason: '' }]);
	});

	describe('the reconnect ladder (W1)', () => {
		// Every connect() reset reconnectAttempts, including the one the reconnect
		// timer made, and onclose rescheduled only from a socket that had been
		// connected — which a failed attempt never was. So the first failed
		// retry was the last: no ladder, no maxAttempts, no exhaustion event.
		const ladder = {
			enabled: true,
			maxAttempts: 3,
			initialDelay: 100,
			maxDelay: 1000,
			backoffMultiplier: 2,
			jitter: false
		};

		async function connected() {
			const client = createLiveWebSocket({ reconnect: ladder });
			const events: WebSocketEvent[] = [];
			client.subscribeToEvents((event) => events.push(event));
			const connecting = client.connect('wss://x.example');
			ScriptedWebSocket.instances[0]!.open();
			await connecting;
			return { client, events, sockets: ScriptedWebSocket.instances };
		}

		it('an unclean drop climbs the backoff to maxAttempts and then reports MAX_RECONNECTS', async () => {
			const { client, events, sockets } = await connected();

			sockets[0]!.closed(1006, false);
			expect(client.state.status).toBe('reconnecting');
			expect(client.state.reconnectAttempts).toBe(1);
			expect(events.at(-1)).toMatchObject({ type: 'reconnecting', attempt: 1, delay: 100, maxAttempts: 3 });

			await vi.advanceTimersByTimeAsync(100);
			expect(sockets).toHaveLength(2);

			// The attempt fails: still reconnecting, and the next rung is longer.
			sockets[1]!.error();
			expect(client.state.status).toBe('reconnecting');
			expect(client.state.reconnectAttempts).toBe(2);
			expect(events.at(-1)).toMatchObject({ type: 'reconnecting', attempt: 2, delay: 200 });
			sockets[1]!.closed(1006, false); // the close that follows an error is a no-op

			await vi.advanceTimersByTimeAsync(199);
			expect(sockets, 'the backoff was not honoured').toHaveLength(2);
			await vi.advanceTimersByTimeAsync(1);
			expect(sockets).toHaveLength(3);

			sockets[2]!.error();
			expect(events.at(-1)).toMatchObject({ type: 'reconnecting', attempt: 3, delay: 400 });
			await vi.advanceTimersByTimeAsync(400);
			expect(sockets).toHaveLength(4);

			// The third and last attempt fails: exhausted.
			sockets[3]!.error();
			expect(client.state.status).toBe('failed');
			expect(client.state.lastError?.code).toBe(WS_ERROR_CODES.MAX_RECONNECTS);
			expect(events.some((e) => e.type === 'error' && e.error.code === WS_ERROR_CODES.MAX_RECONNECTS)).toBe(true);

			await vi.advanceTimersByTimeAsync(10_000);
			expect(sockets, 'attempted again after giving up').toHaveLength(4);
		});

		it("a successful attempt emits reconnected with the ladder's total delay and resets the counter", async () => {
			const { client, events, sockets } = await connected();

			sockets[0]!.closed(1006, false);
			await vi.advanceTimersByTimeAsync(100);
			sockets[1]!.error();
			await vi.advanceTimersByTimeAsync(200);
			sockets[2]!.open();

			expect(client.state.status).toBe('connected');
			expect(client.state.reconnectAttempts).toBe(0);
			expect(client.stats.reconnects).toBe(1);
			expect(events.at(-1)).toMatchObject({ type: 'reconnected', attempts: 2, totalDelay: 300 });

			// A later drop starts a fresh ladder.
			sockets[2]!.closed(1006, false);
			expect(events.at(-1)).toMatchObject({ type: 'reconnecting', attempt: 1, delay: 100 });
		});
	});

	describe('disconnect() detaches the socket (W2, W6)', () => {
		it("the old socket's late close after disconnect() then connect() is ignored", async () => {
			const client = createLiveWebSocket({ reconnect: { enabled: true, maxAttempts: 3, initialDelay: 100, maxDelay: 1000, backoffMultiplier: 2, jitter: false } });
			const events: WebSocketEvent[] = [];
			client.subscribeToEvents((event) => events.push(event));

			const first = client.connect('wss://x.example');
			ScriptedWebSocket.instances[0]!.open();
			await first;

			await client.disconnect();
			// Synchronous, and clean: nothing else will report it now that the
			// socket is detached.
			expect(events.at(-1)).toMatchObject({ type: 'disconnected', code: 1000, wasClean: true });
			expect(ScriptedWebSocket.instances[0]!.closeCalls).toEqual([{ code: 1000, reason: '' }]);
			const eventsAfterDisconnect = events.length;

			const second = client.connect('wss://x.example');
			ScriptedWebSocket.instances[1]!.open();
			await second;
			expect(client.state.status).toBe('connected');

			// The first socket's close arrives late, as a real socket's does.
			ScriptedWebSocket.instances[0]!.closed(1006, false);
			expect(client.state.status).toBe('connected');
			expect(events.slice(eventsAfterDisconnect).map((e) => e.type)).toEqual(['connected']);
			await vi.advanceTimersByTimeAsync(10_000);
			expect(ScriptedWebSocket.instances).toHaveLength(2);
		});

		it('disconnect() while connecting rejects the pending connect', async () => {
			const client = createLiveWebSocket();
			const connecting = client.connect('wss://x.example');
			const rejected = expect(connecting).rejects.toThrow(/before the connection opened/);

			await client.disconnect();

			await rejected;
			expect(client.state.status).toBe('disconnected');
		});
	});
});
