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
	// DNS, TLS, CORS. There is no status because there was no response.
	if (thrown instanceof TypeError) {
		return { code: 'network', message: thrown.message };
	}

	if (thrown instanceof Error) {
		return { code: 'unknown', message: thrown.message };
	}

	return { code: 'unknown', message: String(thrown) };
}

/**
 * Whether a value is one of ours.
 *
 * Structural, not `instanceof`: these are plain objects so they survive
 * `structuredClone`, SSR serialisation and a `postMessage` boundary. A class
 * would not.
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
