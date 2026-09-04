/**
 * The real live client over a scripted socket.
 *
 * Every other file in this directory tests the mock client, the heartbeat,
 * the queue or the router; this is the first to import `live-client.ts`.
 * R0.3.b lands the harness and a smoke test; the reconnection tests arrive
 * with R1.4.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createLiveWebSocket } from '../../src/lib/websocket/live-client.js';
import {
	ScriptedWebSocket,
	installScriptedWebSocket
} from '../helpers/scripted-websocket.js';
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

	it('W1 (pinned defect): a failed reconnect attempt is the last', async () => {
		// Pinned, not fixed: every connect() resets reconnectAttempts, including
		// the one the reconnect timer makes, and onclose only reschedules when
		// the previous status was 'connected' — which a failed attempt never
		// is. So the first retry that fails is the last: no backoff ladder, no
		// maxAttempts, no exhaustion event. This asserts that no third socket
		// is ever created and fails the moment R1.4 fixes it; remove it in that
		// commit. AUDIT-2026-09-03-FINDINGS W1.
		expectConsole('warn'); // '[WebSocket] Reconnection attempt 1 failed'
		const client = createLiveWebSocket({
			reconnect: {
				enabled: true,
				maxAttempts: 5,
				initialDelay: 100,
				maxDelay: 1000,
				backoffMultiplier: 2,
				jitter: false
			}
		});

		const connecting = client.connect('wss://x.example');
		ScriptedWebSocket.instances[0]!.open();
		await connecting;

		// An unclean drop schedules the first reconnect.
		ScriptedWebSocket.instances[0]!.closed(1006, false);
		expect(client.state.status).toBe('reconnecting');
		await vi.advanceTimersByTimeAsync(200);
		expect(ScriptedWebSocket.instances).toHaveLength(2);

		// The attempt fails.
		const retry = ScriptedWebSocket.instances[1]!;
		retry.error();
		retry.closed(1006, false);
		await vi.advanceTimersByTimeAsync(10_000);

		expect(ScriptedWebSocket.instances).toHaveLength(2);
		expect(client.state.status).toBe('disconnected');
	});
});
