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
import { WS_ERROR_CODES, type ReconnectConfig, type WebSocketEvent } from '../../src/lib/websocket/types.js';
import { createHeartbeat } from '../../src/lib/websocket/heartbeat.js';
import { createQueuedWebSocket } from '../../src/lib/websocket/message-queue.js';
import { expectConsole } from '../helpers/console.js';


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

	describe('which closes reconnect (W3, W8)', () => {
		const ladder = { enabled: true, maxAttempts: 3, initialDelay: 100, maxDelay: 1000, backoffMultiplier: 2, jitter: false };

		async function connectedWith(reconnect: ReconnectConfig = ladder) {
			const client = createLiveWebSocket({ reconnect });
			const events: WebSocketEvent[] = [];
			client.subscribeToEvents((event) => events.push(event));
			const connecting = client.connect('wss://x.example');
			ScriptedWebSocket.instances[0]!.open();
			await connecting;
			return { client, events };
		}

		it.each([1001, 1006, 1011, 1012, 1013, 1014])('a server close with code %i reconnects, clean or not', async (code) => {
			// Keyed on wasClean, a server going away or restarting — a clean
			// close frame — never reconnected.
			const { client } = await connectedWith();
			ScriptedWebSocket.instances[0]!.closed(code, true, 'server');
			expect(client.state.status).toBe('reconnecting');
		});

		it.each([1000, 1005, 1008, 4000])('a close with code %i does not reconnect', async (code) => {
			const { client, events } = await connectedWith();
			ScriptedWebSocket.instances[0]!.closed(code, true);
			expect(client.state.status).toBe('disconnected');
			expect(events.some((e) => e.type === 'reconnecting')).toBe(false);
			await vi.advanceTimersByTimeAsync(10_000);
			expect(ScriptedWebSocket.instances).toHaveLength(1);
		});

		it('shouldReconnect overrides the table', async () => {
			const { client } = await connectedWith({ ...ladder, shouldReconnect: (e) => e.code === 4000 });
			ScriptedWebSocket.instances[0]!.closed(4000, true);
			expect(client.state.status).toBe('reconnecting');

			const other = createLiveWebSocket({ reconnect: { ...ladder, shouldReconnect: (e) => e.code === 4000 } });
			const connecting = other.connect('wss://y.example');
			ScriptedWebSocket.instances.at(-1)!.open();
			await connecting;
			ScriptedWebSocket.instances.at(-1)!.closed(1006, false);
			expect(other.state.status).toBe('disconnected');
		});

		it('an error on an established socket does not suppress the reconnect its close would start', async () => {
			// onerror set status 'failed', so the close that followed found no
			// 'connected' to reconnect from.
			const { client, events } = await connectedWith();
			ScriptedWebSocket.instances[0]!.error();
			expect(client.state.status).toBe('connected');
			expect(events.at(-1)?.type).toBe('error');

			ScriptedWebSocket.instances[0]!.closed(1006, false);
			expect(client.state.status).toBe('reconnecting');
		});
	});

	describe('the heartbeat over the live client (W4)', () => {
		const ladder = { enabled: true, maxAttempts: 3, initialDelay: 100, maxDelay: 1000, backoffMultiplier: 2, jitter: false };

		async function withHeartbeat(config: Parameters<typeof createHeartbeat>[1]) {
			const client = createLiveWebSocket({ reconnect: ladder });
			const events: WebSocketEvent[] = [];
			client.subscribeToEvents((event) => events.push(event));
			const heartbeat = createHeartbeat(client, config);
			client.subscribeToEvents((event) => {
				if (event.type === 'connected') heartbeat.start();
				else if (event.type === 'disconnected') heartbeat.stop();
			});
			const connecting = client.connect('wss://x.example');
			ScriptedWebSocket.instances[0]!.open();
			await connecting;
			return { client, events, heartbeat };
		}

		it('a pong timeout reconnects instead of disconnecting for good', async () => {
			// The heartbeat called disconnect(1001, …): the client forgot the URL
			// and never reconnected, and 1001 is a code a browser refuses from
			// script, so the real socket stayed open behind a disconnected state.
			expectConsole('warn'); // '[WebSocket] Pong timeout'
			const { client, events, heartbeat } = await withHeartbeat({ enabled: true, interval: 100, timeout: 50 });
			const first = ScriptedWebSocket.instances[0]!;

			await vi.advanceTimersByTimeAsync(100);
			// The framing the docs describe: the ping goes through the serializer.
			expect(first.sent).toEqual(['"PING"']);

			await vi.advanceTimersByTimeAsync(50);
			expect(first.closeCalls.at(-1)).toEqual({ code: 1000, reason: 'Pong timeout' });
			expect(events.slice(-2).map((e) => e.type)).toEqual(['disconnected', 'reconnecting']);
			expect(events.at(-2)).toMatchObject({ reason: 'Pong timeout', wasClean: false });
			expect(heartbeat.isRunning).toBe(false);

			await vi.advanceTimersByTimeAsync(100);
			expect(ScriptedWebSocket.instances).toHaveLength(2);
			ScriptedWebSocket.instances[1]!.open();
			expect(client.state.status).toBe('connected');
			expect(heartbeat.isRunning).toBe(true);
		});

		it('the documented object pong matches', async () => {
			// `message.data === pongMessage` could never be true for an object.
			const { client, events } = await withHeartbeat({
				enabled: true,
				interval: 100,
				timeout: 50,
				pingMessage: { type: 'ping' },
				pongMessage: { type: 'pong' }
			});
			const socket = ScriptedWebSocket.instances[0]!;

			await vi.advanceTimersByTimeAsync(100);
			expect(socket.sent).toEqual(['{"type":"ping"}']);
			socket.message('{"type":"pong"}');

			await vi.advanceTimersByTimeAsync(50);
			expect(client.state.status).toBe('connected');
			expect(events.some((e) => e.type === 'reconnecting')).toBe(false);
		});

		it('isPong recognises a pong whose fields vary', async () => {
			const { client } = await withHeartbeat({
				enabled: true,
				interval: 100,
				timeout: 50,
				pingMessage: { type: 'ping' },
				isPong: (data) => (data as { type?: string })?.type === 'pong'
			});
			const socket = ScriptedWebSocket.instances[0]!;

			await vi.advanceTimersByTimeAsync(100);
			socket.message('{"type":"pong","timestamp":12345}');
			await vi.advanceTimersByTimeAsync(50);

			expect(client.state.status).toBe('connected');
		});
	});

	describe('createQueuedWebSocket over the live client (W5)', () => {
		it('a send right after disconnect() resolves and is queued for the next connection', async () => {
			// The wrapper's boolean flipped on the close *event*, which the first
			// form reported a task later, so a send right after disconnect()
			// reached the closed socket and rejected.
			const client = createLiveWebSocket({ reconnect: { enabled: false } });
			const queued = createQueuedWebSocket(client, 100);

			const first = queued.connect('wss://x.example');
			ScriptedWebSocket.instances[0]!.open();
			await first;
			await queued.send({ type: 'live' });
			expect(ScriptedWebSocket.instances[0]!.sent).toEqual(['{"type":"live"}']);

			await queued.disconnect();
			await expect(queued.send({ type: 'after' })).resolves.toBeUndefined();
			expect(queued.stats.messagesQueued).toBe(1);

			const second = queued.connect('wss://x.example');
			ScriptedWebSocket.instances[1]!.open();
			await second;
			expect(ScriptedWebSocket.instances[1]!.sent).toEqual(['{"type":"after"}']);
			expect(queued.stats.messagesQueued).toBe(0);
		});
	});
});
