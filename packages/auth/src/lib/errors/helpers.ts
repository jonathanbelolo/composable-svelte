/**
 * Building and narrowing {@link AuthError}s.
 *
 * Two audiences. A dependency implementation calls the constructors to report
 * what the backend said; a reducer or a component calls the guards to decide
 * what to do about it.
 */

import type { AuthError, MfaRequiredError } from './types.js';

/**
 * Wrap something thrown into an `AuthError`.
 *
 * Every dependency is injected, so anything can come back out of one —
 * including a `TypeError` from `fetch` when the network is down, and an
 * `AbortError` when an effect is cancelled. Both are `network`: neither reached
 * a verdict, and a caller that retries on one should retry on the other.
 *
 * A value that is already an `AuthError` passes through, so a dependency can
 * report precisely and still be wrapped defensively by its caller.
 */
export function toAuthError(thrown: unknown): AuthError {
	if (isAuthError(thrown)) return thrown;

	if (thrown instanceof DOMException && thrown.name === 'AbortError') {
		return { code: 'network', message: 'The request was cancelled.' };
	}

	// `fetch` rejects with a TypeError for every transport failure — offline,
	// DNS, TLS, CORS — but so does every null-dereference in the dependency
	// itself. Classifying all of them as `network` told a developer their
	// `Cannot read properties of undefined` was a connectivity problem, and told
	// the user to retry something that will fail identically forever.
	//
	// So the message has to earn it. The four strings below are what Chrome,
	// Firefox, Safari and undici produce for a transport failure; anything else
	// is `unknown`, which is the safe way to be wrong — it claims nothing about
	// the cause and offers no retry.
	//
	// This is a heuristic and it is temporary. A dependency that knows it was
	// doing I/O should report `{ code: 'network' }` itself, which
	// `toAuthError` passes straight through; the HTTP adapter will.
	if (thrown instanceof TypeError && looksLikeTransportFailure(thrown.message)) {
		return { code: 'network', message: thrown.message };
	}

	if (thrown instanceof Error) {
		return { code: 'unknown', message: thrown.message };
	}

	return { code: 'unknown', message: String(thrown) };
}

/** What the engines say when `fetch` never reached a server. */
function looksLikeTransportFailure(message: string): boolean {
	return /failed to fetch|networkerror|load failed|fetch failed/i.test(message);
}

/**
 * Whether a value is one of ours.
 *
 * Structural, not `instanceof`: these are plain objects so they survive
 * `structuredClone`, `JSON` round-tripping and a `postMessage` boundary. A class
 * would survive none of the three.
 *
 * JSON is the one that constrains the union's *fields*, not just its identity —
 * core hydrates SSR state with `JSON.stringify`/`parse`, which silently turns a
 * `Date` into a string while the type still claims `Date`. So every field here
 * is a JSON primitive, and `auth-error.test.ts` round-trips all eight arms.
 */
export function isAuthError(value: unknown): value is AuthError {
	if (typeof value !== 'object' || value === null) return false;

	const candidate = value as { code?: unknown; message?: unknown };
	return typeof candidate.code === 'string' && typeof candidate.message === 'string';
}

/**
 * Whether this failure is the login flow asking for a second factor.
 *
 * A type guard rather than a `code === 'mfa_required'` comparison so the
 * `challengeId` narrows with it — that is the whole reason a caller checks.
 */
export function isMfaRequired(error: AuthError | null): error is MfaRequiredError {
	return error !== null && error.code === 'mfa_required';
}

/**
 * How long to wait before retrying, in seconds, or `null` if retrying now is
 * pointless.
 *
 * `null` for `invalid_credentials` and `account_locked` is the point: those do
 * not become true by waiting, and a UI that offers "try again" for them is
 * lying. A rate limit without a stated delay returns `null` too — guessing an
 * interval is how a client turns one rate limit into several.
 */
export function retryDelaySeconds(error: AuthError): number | null {
	switch (error.code) {
		case 'rate_limited':
			return error.retryAfterSeconds ?? null;
		case 'network':
			return 0;
		default:
			return null;
	}
}
