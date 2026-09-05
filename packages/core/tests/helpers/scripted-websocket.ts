/**
 * A scripted `WebSocket` for testing the real live client.
 *
 * `createLiveWebSocket` constructs `new WebSocket(url, protocols)` at call time
 * and compares `readyState` against the global class's statics
 * (`live-client.ts`), so replacing `globalThis.WebSocket` per test drives the
 * real connect, close, reconnect and timeout logic — none of which
 * `createMockWebSocket` reaches, because it replaces the whole client. Until
 * this file nothing in `tests/websocket/` imported `live-client.ts`
 * (`plans/hardening/AUDIT-2026-09-03-FINDINGS.md`, STRUCTURAL).
 *
 * The test side drives events explicitly: `open()`, `message()`, `error()`,
 * `closed()`. Nothing happens on its own, so a test says exactly what the
 * network did and when.
 *
 * `installScriptedWebSocket` registers its own `onTestFinished`, which puts
 * the native class back and empties `instances`; no file-level hook to forget.
 */

import { onTestFinished } from 'vitest';

type Handler = ((event: any) => void) | null;

export class ScriptedWebSocket {
	static readonly CONNECTING = 0;
	static readonly OPEN = 1;
	static readonly CLOSING = 2;
	static readonly CLOSED = 3;

	/** Every socket constructed since `installScriptedWebSocket()`, in order. */
	static instances: ScriptedWebSocket[] = [];

	readyState: number = ScriptedWebSocket.CONNECTING;
	readonly url: string;
	readonly protocols: string[];
	readonly sent: unknown[] = [];
	readonly closeCalls: Array<{ code: number | undefined; reason: string | undefined }> = [];

	onopen: Handler = null;
	onmessage: Handler = null;
	onerror: Handler = null;
	onclose: Handler = null;

	constructor(url: string, protocols?: string | string[]) {
		this.url = url;
		this.protocols = protocols === undefined ? [] : Array.isArray(protocols) ? protocols : [protocols];
		ScriptedWebSocket.instances.push(this);
	}

	send(data: unknown): void {
		if (this.readyState !== ScriptedWebSocket.OPEN) {
			throw new DOMException('Still in CONNECTING state.', 'InvalidStateError');
		}
		this.sent.push(data);
	}

	close(code?: number, reason?: string): void {
		this.closeCalls.push({ code, reason });
		if (this.readyState === ScriptedWebSocket.CLOSED) return;
		this.readyState = ScriptedWebSocket.CLOSING;
	}

	// ---- test side ----

	open(): void {
		this.readyState = ScriptedWebSocket.OPEN;
		this.onopen?.({ type: 'open' });
	}

	message(data: unknown): void {
		this.onmessage?.({ data });
	}

	/**
	 * In a browser the task that fires `error` first sets `readyState` to
	 * CLOSED ("feedback from the protocol": readyState, then error, then close),
	 * so a handler never sees an OPEN socket in `onerror`. The first form left
	 * `readyState` untouched, an order no browser produces, and the live
	 * client's "never opened" test passed against it (R1-REVIEW 1.1).
	 */
	error(): void {
		this.readyState = ScriptedWebSocket.CLOSED;
		this.onerror?.({ type: 'error' });
	}

	closed(code = 1006, wasClean = false, reason = ''): void {
		this.readyState = ScriptedWebSocket.CLOSED;
		this.onclose?.({ code, reason, wasClean });
	}
}

/** Install for the current test; returns the class so a test can read `instances`. */
export function installScriptedWebSocket(): typeof ScriptedWebSocket {
	const original = globalThis.WebSocket;
	ScriptedWebSocket.instances = [];
	(globalThis as { WebSocket: unknown }).WebSocket = ScriptedWebSocket;
	onTestFinished(() => {
		(globalThis as { WebSocket: unknown }).WebSocket = original;
		ScriptedWebSocket.instances = [];
	});
	return ScriptedWebSocket;
}
