/**
 * `createHttpAuthDeps()` — the wire contract for every call beyond the session.
 *
 * This shipped with no tests at all, which is the wrong place to have none:
 * everything above it runs against `createMockAuthDeps`, so the adapter is the
 * one layer where a mistake is invisible until a real backend is attached.
 *
 * The interesting decision is how the two outcomes are told apart. `202
 * Accepted` means "taken, but not finished" — an account that exists and cannot
 * be used until its address is confirmed. Anything else must decode as a
 * session, and `decodeSessionSnapshot` refuses to guess, so a 200 carrying
 * "check your email" is a `MalformedSessionError` rather than a fabricated
 * signed-in user.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

import { createHttpAuthDeps } from '../src/lib/http/index.js';
import { MalformedSessionError } from '../src/lib/session/http.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

/** Capture what the adapter sent, and answer with what a backend would. */
function stubFetch(response: Response) {
	const calls: Array<{ url: string; init: RequestInit }> = [];
	globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		calls.push({ url: String(input), init: init ?? {} });
		return response;
	}) as typeof fetch;
	return calls;
}

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});

const credentials = { email: 'ada@example.com', password: 'correct-horse-battery' };

describe('what it sends', () => {
	it('posts the credentials as JSON, with cookies', async () => {
		const calls = stubFetch(json({ subject_id: 'u1' }, 201));

		await createHttpAuthDeps().signup(credentials);

		expect(calls).toHaveLength(1);
		expect(calls[0]!.url).toBe('/auth/signup');
		expect(calls[0]!.init.method).toBe('POST');
		// The session cookie is HttpOnly and server-owned; without this the
		// backend cannot set it and every later resolve comes back anonymous.
		expect(calls[0]!.init.credentials).toBe('include');
		expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
			email: 'ada@example.com',
			password: 'correct-horse-battery'
		});
	});

	it('honours a base url without doubling the slash', async () => {
		const calls = stubFetch(json({ subject_id: 'u1' }, 201));

		await createHttpAuthDeps('https://api.example.com/').signup(credentials);

		expect(calls[0]!.url).toBe('https://api.example.com/auth/signup');
	});

	it('forwards the abort signal', async () => {
		// Cancellation is how a superseded signup stops mattering. An adapter that
		// drops the signal makes the flow's supersession a fiction while every
		// test above it still passes, because they all run on the mock.
		const calls = stubFetch(json({ subject_id: 'u1' }, 201));
		const controller = new AbortController();

		await createHttpAuthDeps().signup(credentials, controller.signal);

		expect(calls[0]!.init.signal).toBe(controller.signal);
	});
});

describe('telling the two outcomes apart', () => {
	it('reads 202 as an account awaiting confirmation', async () => {
		stubFetch(new Response(null, { status: 202 }));

		await expect(createHttpAuthDeps().signup(credentials)).resolves.toEqual({
			kind: 'verificationRequired',
			email: 'ada@example.com'
		});
	});

	it('reads 202 with an explanatory body the same way', async () => {
		// The reason this branches on status rather than sniffing the body: a 202
		// carrying JSON must not be mistaken for a malformed session.
		stubFetch(json({ message: 'Check your email.' }, 202));

		const outcome = await createHttpAuthDeps().signup(credentials);

		expect(outcome.kind).toBe('verificationRequired');
	});

	it('reads a session body as a session', async () => {
		stubFetch(json({ subject_id: 'u1', display_name: 'Ada', roles: ['member'] }, 201));

		await expect(createHttpAuthDeps().signup(credentials)).resolves.toEqual({
			kind: 'session',
			session: { subject_id: 'u1', display_name: 'Ada', roles: ['member'] }
		});
	});

	it('refuses to invent a session from a 200 that carries none', async () => {
		// A backend answering 200 for "check your email" is outside the contract,
		// and the failure has to be loud. Quietly returning a session-shaped
		// nothing would sign in an account that does not exist yet.
		stubFetch(json({ message: 'Check your email.' }, 200));

		await expect(createHttpAuthDeps().signup(credentials)).rejects.toBeInstanceOf(
			MalformedSessionError
		);
	});
});

describe('when it fails', () => {
	it('reads the body rather than discarding it', async () => {
		// The whole point of the adapter. The old one threw the status in a
		// sentence, so `email_taken` could not have reached a surface.
		stubFetch(
			json({ error: { code: 'email_taken', message: 'Already registered.', email: 'ada@example.com' } }, 409)
		);

		await expect(createHttpAuthDeps().signup(credentials)).rejects.toMatchObject({
			code: 'email_taken',
			message: 'Already registered.',
			email: 'ada@example.com'
		});
	});

	it('falls back to the status when there is no body', async () => {
		stubFetch(new Response(null, { status: 409 }));

		await expect(createHttpAuthDeps().signup(credentials)).rejects.toMatchObject({
			code: 'email_taken',
			message: 'Could not create the account.'
		});
	});

	it('rejects with an AuthError, never a bare Error', async () => {
		// Every dependency reports failure by rejecting with an `AuthError`; the
		// flow's `toAuthError` passes one straight through, and a bare `Error`
		// would be flattened to `unknown` at exactly the wrong moment.
		stubFetch(new Response('<html>gateway</html>', { status: 502 }));

		await expect(createHttpAuthDeps().signup(credentials)).rejects.toMatchObject({
			code: 'unknown',
			status: 502
		});
	});
});

describe('verifyEmail', () => {
	it('posts the token and reads a session', async () => {
		const calls = stubFetch(json({ subject_id: 'u1' }, 200));

		await expect(createHttpAuthDeps().verifyEmail('tok_1')).resolves.toEqual({ subject_id: 'u1' });
		expect(calls[0]!.url).toBe('/auth/verify-email');
		expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ token: 'tok_1' });
	});

	it('reads 204 as verified-but-not-signed-in', async () => {
		// A success. The address is confirmed and the user still has to sign in;
		// `null` is the answer, not a failure.
		stubFetch(new Response(null, { status: 204 }));

		await expect(createHttpAuthDeps().verifyEmail('tok_1')).resolves.toBeNull();
	});

	it('reads a dead link as `token_expired`', async () => {
		stubFetch(new Response(null, { status: 410 }));

		await expect(createHttpAuthDeps().verifyEmail('stale')).rejects.toMatchObject({
			code: 'token_expired',
			message: 'That link is no longer valid.'
		});
	});

	it('forwards the abort signal', async () => {
		const calls = stubFetch(new Response(null, { status: 204 }));
		const controller = new AbortController();

		await createHttpAuthDeps().verifyEmail('tok_1', controller.signal);

		expect(calls[0]!.init.signal).toBe(controller.signal);
	});
});

describe('resendVerification', () => {
	it('posts the address and resolves on 204', async () => {
		const calls = stubFetch(new Response(null, { status: 204 }));

		await expect(createHttpAuthDeps().resendVerification('ada@example.com')).resolves.toBeUndefined();
		expect(calls[0]!.url).toBe('/auth/resend-verification');
		expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ email: 'ada@example.com' });
	});

	it('surfaces a rate limit rather than swallowing it', async () => {
		// The one failure a resend button reliably produces, and the user needs to
		// be told to wait rather than to keep clicking.
		stubFetch(new Response(null, { status: 429, headers: { 'retry-after': '30' } }));

		await expect(createHttpAuthDeps().resendVerification('ada@example.com')).rejects.toMatchObject({
			code: 'rate_limited',
			retryAfterSeconds: 30
		});
	});
});

describe('requestPasswordReset', () => {
	it('posts the address and resolves on 204', async () => {
		const calls = stubFetch(new Response(null, { status: 204 }));

		await expect(
			createHttpAuthDeps().requestPasswordReset('ada@example.com')
		).resolves.toBeUndefined();
		expect(calls[0]!.url).toBe('/auth/request-password-reset');
		expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ email: 'ada@example.com' });
	});

	it('does not quietly turn a 404 into a success', async () => {
		// A backend answering 404 for an unknown address IS the account-existence
		// oracle this flow is shaped to avoid. Swallowing it would hide a
		// misconfiguration behind a UI that looks correct — the failure has to be
		// loud enough that someone fixes the backend.
		stubFetch(new Response(null, { status: 404 }));

		await expect(createHttpAuthDeps().requestPasswordReset('nobody@example.com')).rejects.toBeDefined();
	});

	it('surfaces a rate limit with its delay', async () => {
		stubFetch(new Response(null, { status: 429, headers: { 'retry-after': '60' } }));

		await expect(
			createHttpAuthDeps().requestPasswordReset('ada@example.com')
		).rejects.toMatchObject({ code: 'rate_limited', retryAfterSeconds: 60 });
	});
});

describe('resetPassword', () => {
	it('posts the token and the new password', async () => {
		const calls = stubFetch(new Response(null, { status: 204 }));

		await expect(createHttpAuthDeps().resetPassword('tok_1', 'hunter22222222')).resolves.toBeNull();
		expect(calls[0]!.url).toBe('/auth/reset-password');
		expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
			token: 'tok_1',
			password: 'hunter22222222'
		});
	});

	it('reads a session body as a session', async () => {
		stubFetch(json({ subject_id: 'u1' }, 200));

		await expect(createHttpAuthDeps().resetPassword('tok_1', 'pw')).resolves.toEqual({
			subject_id: 'u1'
		});
	});

	it('reads a dead link as `token_expired`', async () => {
		stubFetch(new Response(null, { status: 410 }));

		await expect(createHttpAuthDeps().resetPassword('stale', 'pw')).rejects.toMatchObject({
			code: 'token_expired',
			message: 'That reset link is no longer valid.'
		});
	});

	it('forwards the abort signal', async () => {
		const calls = stubFetch(new Response(null, { status: 204 }));
		const controller = new AbortController();

		await createHttpAuthDeps().resetPassword('tok_1', 'pw', controller.signal);

		expect(calls[0]!.init.signal).toBe(controller.signal);
	});
});

describe('verifyMfaChallenge', () => {
	it('posts the challenge, the code and the method', async () => {
		const calls = stubFetch(json({ subject_id: 'u1' }, 200));

		await expect(
			createHttpAuthDeps().verifyMfaChallenge('chal_1', '123456', 'totp')
		).resolves.toEqual({ subject_id: 'u1' });
		expect(calls[0]!.url).toBe('/auth/mfa/verify');
		expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
			challenge_id: 'chal_1',
			code: '123456',
			method: 'totp'
		});
	});

	it('refuses to succeed without a session', async () => {
		// There is no 204 branch on purpose: a second factor that verified and
		// produced no session would leave the user having proved who they are and
		// still signed out.
		stubFetch(new Response(null, { status: 204 }));

		await expect(
			createHttpAuthDeps().verifyMfaChallenge('chal_1', '123456', 'totp')
		).rejects.toBeInstanceOf(MalformedSessionError);
	});

	it('keeps a wrong code and an expired challenge apart', async () => {
		stubFetch(new Response(null, { status: 401 }));
		await expect(
			createHttpAuthDeps().verifyMfaChallenge('c', '000000', 'totp')
		).rejects.toMatchObject({ code: 'invalid_credentials' });

		stubFetch(new Response(null, { status: 410 }));
		await expect(
			createHttpAuthDeps().verifyMfaChallenge('c', '123456', 'totp')
		).rejects.toMatchObject({ code: 'token_expired' });
	});
});

describe('MFA enrolment over the wire', () => {
	it('reads a start', async () => {
		const calls = stubFetch(
			json({ enrolment_id: 'enr_1', secret: 'JBSW', otpauth_uri: 'otpauth://totp/x' }, 200)
		);

		await expect(createHttpAuthDeps().beginMfaEnrolment()).resolves.toEqual({
			enrolmentId: 'enr_1',
			secret: 'JBSW',
			otpauthUri: 'otpauth://totp/x'
		});
		expect(calls[0]!.url).toBe('/auth/mfa/enrol');
	});

	it('refuses half a start', async () => {
		// A secret with no URI leaves an authenticator app unusable; a URI with no
		// secret leaves manual entry impossible. Half of this is not an enrolment.
		stubFetch(json({ enrolment_id: 'enr_1', secret: 'JBSW' }, 200));

		await expect(createHttpAuthDeps().beginMfaEnrolment()).rejects.toBeInstanceOf(
			MalformedSessionError
		);
	});

	it('reads the recovery codes', async () => {
		const calls = stubFetch(json({ recovery_codes: ['aaa', 'bbb'] }, 200));

		await expect(createHttpAuthDeps().confirmMfaEnrolment('enr_1', '123456')).resolves.toEqual({
			recoveryCodes: ['aaa', 'bbb']
		});
		expect(calls[0]!.url).toBe('/auth/mfa/enrol/confirm');
		expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
			enrolment_id: 'enr_1',
			code: '123456'
		});
	});

	it('refuses an empty set of recovery codes', async () => {
		// They are the only way back in after a lost device. Zero of them would
		// tell the user they were finished when they were not.
		stubFetch(json({ recovery_codes: [] }, 200));

		await expect(createHttpAuthDeps().confirmMfaEnrolment('enr_1', '123456')).rejects.toBeInstanceOf(
			MalformedSessionError
		);
	});

	it('forwards the abort signal on all three', async () => {
		const controller = new AbortController();

		for (const call of [
			(d: ReturnType<typeof createHttpAuthDeps>) =>
				d.verifyMfaChallenge('c', '1', 'totp', controller.signal),
			(d: ReturnType<typeof createHttpAuthDeps>) => d.beginMfaEnrolment(controller.signal),
			(d: ReturnType<typeof createHttpAuthDeps>) =>
				d.confirmMfaEnrolment('e', '1', controller.signal)
		]) {
			const calls = stubFetch(
				json({ subject_id: 'u', enrolment_id: 'e', secret: 's', otpauth_uri: 'o', recovery_codes: ['a'] }, 200)
			);
			await call(createHttpAuthDeps());
			expect(calls[0]!.init.signal).toBe(controller.signal);
		}
	});
});
