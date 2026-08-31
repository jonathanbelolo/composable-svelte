/**
 * Reading a failed response, which is the thing the old adapter did not do.
 *
 * `createHttpSessionDeps` threw `new Error(\`Login failed (${status})\`)` and
 * discarded the body, so every failure looked identical and the backend could
 * not have told you more even if it wanted to. These pin the two layers that
 * replace it: what the status code alone says, and what a body may add.
 *
 * The `mfa_required` cases matter most. A challenge with no id is not a
 * challenge — there is nothing to submit a code against — and accepting one
 * would hand a UI a dead end.
 */

import { describe, it, expect } from 'vitest';
import { authErrorFromResponse } from '../src/lib/http/errors.js';

function failure(
	status: number,
	body?: unknown,
	headers: Record<string, string> = {}
): Response {
	return new Response(body === undefined ? null : JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json', ...headers }
	});
}

describe('what the status code alone says', () => {
	it('reads 401 on a login as wrong credentials', async () => {
		const error = await authErrorFromResponse(failure(401), 'Sign-in failed.');

		expect(error.code).toBe('invalid_credentials');
		expect(error.message).toBe('Sign-in failed.');
	});

	it('reads 423 as a locked account', async () => {
		expect((await authErrorFromResponse(failure(423), 'x')).code).toBe('account_locked');
	});

	it('reads 429 as a rate limit', async () => {
		expect((await authErrorFromResponse(failure(429), 'x')).code).toBe('rate_limited');
	});

	it('reads 410 as an expired token', async () => {
		expect((await authErrorFromResponse(failure(410), 'x')).code).toBe('token_expired');
	});

	it('refuses to guess at 403, which could be either of two things', async () => {
		// Unverified email or a lockout — a status code cannot say which, and
		// claiming one would put the wrong recovery action in front of the user.
		const error = await authErrorFromResponse(failure(403), 'x');

		expect(error.code).toBe('unknown');
	});

	it('keeps the status on an unclassified failure, because a bug report needs it', async () => {
		const error = await authErrorFromResponse(failure(503), 'x');

		expect(error.code).toBe('unknown');
		expect(error.code === 'unknown' && error.status).toBe(503);
	});
});

describe('what a body may add', () => {
	it('lets the backend name a code the status could not express', async () => {
		const error = await authErrorFromResponse(
			failure(403, { error: { code: 'email_unverified', email: 'ada@example.com' } }),
			'x'
		);

		expect(error.code).toBe('email_unverified');
		expect(error.code === 'email_unverified' && error.email).toBe('ada@example.com');
	});

	it('carries an MFA challenge, which no status code can', async () => {
		// The reason the body layer exists at all.
		const error = await authErrorFromResponse(
			failure(401, {
				error: {
					code: 'mfa_required',
					message: 'Enter your authenticator code.',
					challenge_id: 'chal_abc',
					methods: ['totp', 'recovery_code']
				}
			}),
			'x'
		);

		expect(error.code).toBe('mfa_required');
		if (error.code !== 'mfa_required') throw new Error('narrowing failed');
		expect(error.challengeId).toBe('chal_abc');
		expect(error.methods).toEqual(['totp', 'recovery_code']);
	});

	it('rejects an MFA challenge with no id, because there is nothing to answer', async () => {
		const error = await authErrorFromResponse(
			failure(401, { error: { code: 'mfa_required', message: 'second factor' } }),
			'x'
		);

		expect(error.code, 'a challenge with no id was accepted as usable').toBe('unknown');
	});

	it('drops methods it does not understand rather than trusting them', async () => {
		const error = await authErrorFromResponse(
			failure(401, {
				error: { code: 'mfa_required', challenge_id: 'c1', methods: ['totp', 'telepathy'] }
			}),
			'x'
		);

		expect(error.code === 'mfa_required' && error.methods).toEqual(['totp']);
	});

	it('falls back to totp when every named method was dropped', async () => {
		// An empty list leaves a UI with no branch to offer.
		const error = await authErrorFromResponse(
			failure(401, { error: { code: 'mfa_required', challenge_id: 'c1', methods: ['telepathy'] } }),
			'x'
		);

		expect(error.code === 'mfa_required' && error.methods).toEqual(['totp']);
	});

	it('ignores a code it does not recognise and falls back to the status', async () => {
		// A body is not a licence to invent members of the union.
		const error = await authErrorFromResponse(
			failure(423, { error: { code: 'the_vibes_are_off' } }),
			'x'
		);

		expect(error.code).toBe('account_locked');
	});

	it('prefers the backend wording over the fallback', async () => {
		const error = await authErrorFromResponse(
			failure(401, { error: { message: 'That password is not right.' } }),
			'Sign-in failed.'
		);

		expect(error.message).toBe('That password is not right.');
	});
});

describe('rate limits', () => {
	it('reads Retry-After in seconds', async () => {
		const error = await authErrorFromResponse(failure(429, undefined, { 'retry-after': '30' }), 'x');

		expect(error.code === 'rate_limited' && error.retryAfterSeconds).toBe(30);
	});

	it('reads Retry-After as an HTTP date', async () => {
		// Core's parser handles both forms; this is why it is reused rather than
		// rewritten.
		const future = new Date(Date.now() + 45_000).toUTCString();
		const error = await authErrorFromResponse(failure(429, undefined, { 'retry-after': future }), 'x');

		expect(error.code === 'rate_limited' && error.retryAfterSeconds).toBeGreaterThan(30);
	});

	it('prefers the header over the body, because the header is the standard', async () => {
		const error = await authErrorFromResponse(
			failure(429, { error: { retry_after_seconds: 999 } }, { 'retry-after': '5' }),
			'x'
		);

		expect(error.code === 'rate_limited' && error.retryAfterSeconds).toBe(5);
	});

	it('uses the body when there is no header', async () => {
		const error = await authErrorFromResponse(failure(429, { error: { retry_after_seconds: 12 } }), 'x');

		expect(error.code === 'rate_limited' && error.retryAfterSeconds).toBe(12);
	});

	it('states no delay rather than inventing one', async () => {
		const error = await authErrorFromResponse(failure(429), 'x');

		expect(error.code === 'rate_limited' && error.retryAfterSeconds).toBeUndefined();
	});
});

describe('a failing response that is not JSON', () => {
	it('still classifies from the status', async () => {
		// An HTML error page from a proxy, an empty body, a plain-text stack
		// trace. None of these should turn a clean `invalid_credentials` into a
		// parse exception.
		const html = new Response('<!doctype html><title>502</title>', {
			status: 401,
			headers: { 'content-type': 'text/html' }
		});

		const error = await authErrorFromResponse(html, 'Sign-in failed.');

		expect(error.code).toBe('invalid_credentials');
		expect(error.message).toBe('Sign-in failed.');
	});

	it('survives a completely empty body', async () => {
		const empty = new Response(null, { status: 500 });

		expect((await authErrorFromResponse(empty, 'x')).code).toBe('unknown');
	});
});
