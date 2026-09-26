/**
 * The one place `fetch` is called, so a transport failure is classified rather
 * than guessed at.
 *
 * `toAuthError` has a heuristic for this — it matches four engine strings and
 * calls anything else `unknown` — and its own comment says why that is
 * temporary: *"A dependency that knows it was doing I/O should report
 * `{ code: 'network' }` itself … the HTTP adapter will."* This is the adapter
 * doing it.
 *
 * The heuristic exists because a `TypeError` from a dependency is ambiguous: a
 * null dereference inside the dependency throws one too, and calling that
 * `network` told a developer their `Cannot read properties of undefined` was a
 * connectivity problem. **Wrapping the `fetch` call itself removes the
 * ambiguity entirely** — a rejection from `fetch` and nothing else is, by
 * construction, a request that never reached a verdict. So no string matching
 * is needed, and engine phrasings the heuristic never covered — undici's
 * `terminated`, React Native's `Network request failed`, Deno's `error sending
 * request for url` — are classified correctly for the first time.
 *
 * The heuristic stays where it is. It is the fallback for a hand-written
 * adapter, which is under no obligation to come through here.
 */

import type { NetworkError } from '../errors/types.js';

/**
 * Whether a rejection is a standard abort or the exact request signal reason.
 *
 * Checked by `name`, not `instanceof DOMException`: a polyfilled or
 * non-browser runtime may reject with a plain `Error` named `AbortError`, and
 * core's own effect runner checks the name for the same reason
 * (`store.svelte.ts`, where it suppresses the console noise).
 */
export function isCancellation(thrown: unknown, signal?: AbortSignal | null): boolean {
	return (
		(signal?.aborted === true && thrown === signal.reason) ||
		(typeof thrown === 'object' &&
		thrown !== null &&
		(thrown as { name?: unknown }).name === 'AbortError')
	);
}

/**
 * What the user is told when the request never left.
 *
 * A sentence rather than the engine's string. Components render `error.message`
 * straight into a banner, so the alternative is showing somebody "fetch failed".
 * The code is what a caller branches on; the message is what a person reads.
 */
const UNREACHABLE: NetworkError = {
	code: 'network',
	message: 'Could not reach the server. Check your connection and try again.'
};

/**
 * `fetch`, with transport failures reported as {@link NetworkError}.
 *
 * Rejects with an `AuthError` — never a raw `TypeError` — which is the promise
 * `AuthDependencies` makes on behalf of every member. An abort passes through
 * untouched: it is a cancellation, `toAuthError` already classifies it, and a
 * caller holding its own `AbortSignal` needs to keep telling the two apart.
 * Custom reasons retain identity here; the effect runner may only recognize
 * standard AbortError cancellation for its own error-reporting policy.
 */
export async function send(
	input: string,
	init: RequestInit,
	customFetch?: typeof fetch
): Promise<Response> {
	try {
		const fetchFn = customFetch ?? fetch;
		return await fetchFn(input, init);
	} catch (error) {
		if (isCancellation(error, init.signal)) throw error;
		throw UNREACHABLE;
	}
}

/** Read bytes separately from JSON parsing so a stream failure is not bad JSON. */
export async function readResponseJson(response: Response, signal?: AbortSignal): Promise<unknown> {
	if (response.bodyUsed || response.body?.locked) {
		throw new TypeError('Response body is already used or locked');
	}
	// Native Response.text() in Chromium replaces a stream's rejection reason
	// with TypeError("Failed to fetch"). Read through the standard stream reader
	// so caller cancellation identity survives in both browsers and Node.
	const reader = response.body?.getReader();
	const decoder = new TextDecoder();
	const chunks: string[] = [];
	try {
		if (reader) {
			for (;;) {
				const { value, done } = await reader.read();
				if (done) break;
				chunks.push(decoder.decode(value, { stream: true }));
			}
		}
		chunks.push(decoder.decode());
	} catch (error) {
		if (isCancellation(error, signal)) throw error;
		throw UNREACHABLE;
	} finally {
		reader?.releaseLock();
	}
	return JSON.parse(chunks.join(''));
}
