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
 * Whether a rejection is a cancellation rather than a failure.
 *
 * Checked by `name`, not `instanceof DOMException`: a polyfilled or
 * non-browser runtime may reject with a plain `Error` named `AbortError`, and
 * core's own effect runner checks the name for the same reason
 * (`store.svelte.ts`, where it suppresses the console noise).
 */
function isAbort(thrown: unknown): boolean {
	return (
		typeof thrown === 'object' &&
		thrown !== null &&
		(thrown as { name?: unknown }).name === 'AbortError'
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
 */
export async function send(input: string, init: RequestInit): Promise<Response> {
	try {
		return await fetch(input, init);
	} catch (error) {
		if (isAbort(error)) throw error;
		throw UNREACHABLE;
	}
}
