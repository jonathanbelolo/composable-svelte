/**
 * The failure union, and the two things it has to get right.
 *
 * It replaced `error: string | null`, which was built from `error.message` over
 * a `createHttpSessionDeps` that discarded every non-2xx body — so every failure
 * arrived as `"Login failed (401)"` and nothing could tell "wrong password" from
 * "confirm your email" from "now enter your second factor".
 *
 * The two properties worth pinning are that **an unrecognised failure is still a
 * failure** (never fail open), and that the arms carrying payload narrow to it —
 * `challengeId` is the whole reason the union exists, and a guard that does not
 * narrow would leave callers casting.
 */

import { describe, it, expect } from 'vitest';
import {
	toAuthError,
	isAuthError,
	isMfaRequired,
	retryDelaySeconds,
	type AuthError
} from '../src/lib/errors/index.js';

describe('wrapping what a dependency throws', () => {
	it('passes an AuthError through unchanged', () => {
		// A dependency that reports precisely must not have its work undone by a
		// caller wrapping defensively.
		const reported: AuthError = {
			code: 'mfa_required',
			message: 'Enter your authenticator code.',
			challengeId: 'chal_123',
			methods: ['totp']
		};

		expect(toAuthError(reported)).toBe(reported);
	});

	it('reads an abort as network, not as unknown', () => {
		// Cancellation reaches no verdict, exactly like being offline. A caller
		// deciding whether to retry should treat them the same.
		const aborted = new DOMException('The operation was aborted.', 'AbortError');

		expect(toAuthError(aborted).code).toBe('network');
	});

	it('reads the TypeError fetch throws as network', () => {
		// `fetch` rejects with TypeError for offline, DNS, TLS and CORS. There is
		// no status because there was no response.
		expect(toAuthError(new TypeError('Failed to fetch')).code).toBe('network');
	});

	it('keeps the message of an ordinary Error', () => {
		const wrapped = toAuthError(new Error('the backend said no'));

		expect(wrapped.code).toBe('unknown');
		expect(wrapped.message).toBe('the backend said no');
	});

	it('survives something that is not an Error at all', () => {
		// A dependency is injected, so it can throw anything — including a string
		// or a rejected promise carrying an object. This must not itself throw.
		expect(toAuthError('nope')).toEqual({ code: 'unknown', message: 'nope' });
		expect(toAuthError(undefined).code).toBe('unknown');
	});
});

describe('recognising our own errors', () => {
	it('is structural, so an error survives serialisation', () => {
		// These cross an SSR boundary and `structuredClone`. A class checked with
		// `instanceof` would not survive either, which is why they are plain
		// objects and why this guard reads the shape.
		const error: AuthError = { code: 'network', message: 'offline' };
		const roundTripped = JSON.parse(JSON.stringify(error));

		expect(isAuthError(roundTripped)).toBe(true);
	});

	it('rejects things that merely look adjacent', () => {
		expect(isAuthError(null)).toBe(false);
		expect(isAuthError('invalid_credentials')).toBe(false);
		expect(isAuthError({ code: 'network' })).toBe(false);
		expect(isAuthError({ message: 'no code' })).toBe(false);
	});
});

describe('the MFA branch', () => {
	it('narrows to the challenge, which is the point of the guard', () => {
		const error: AuthError = {
			code: 'mfa_required',
			message: 'Second factor required.',
			challengeId: 'chal_abc',
			methods: ['totp', 'recovery_code']
		};

		if (!isMfaRequired(error)) throw new Error('guard failed to narrow');

		// Reachable without a cast only because the guard narrowed.
		expect(error.challengeId).toBe('chal_abc');
		expect(error.methods).toContain('recovery_code');
	});

	it('is false for null and for every other code', () => {
		expect(isMfaRequired(null)).toBe(false);
		expect(isMfaRequired({ code: 'invalid_credentials', message: 'no' })).toBe(false);
	});
});

describe('whether retrying could possibly help', () => {
	it('says no to the failures that waiting does not fix', () => {
		// A UI offering "try again" for these is lying to the user.
		expect(retryDelaySeconds({ code: 'invalid_credentials', message: '' })).toBeNull();
		expect(retryDelaySeconds({ code: 'account_locked', message: '' })).toBeNull();
		expect(retryDelaySeconds({ code: 'token_expired', message: '' })).toBeNull();
	});

	it('says now for a network failure', () => {
		expect(retryDelaySeconds({ code: 'network', message: '' })).toBe(0);
	});

	it('reports a rate limit delay when the backend stated one', () => {
		expect(
			retryDelaySeconds({ code: 'rate_limited', message: '', retryAfterSeconds: 30 })
		).toBe(30);
	});

	it('refuses to guess a delay the backend did not state', () => {
		// Inventing an interval is how one rate limit becomes several.
		expect(retryDelaySeconds({ code: 'rate_limited', message: '' })).toBeNull();
	});
});
