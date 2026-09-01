/**
 * `createMockAuthDeps` — the fake every demo and most tests run on.
 *
 * It ships on its own subpath, which makes it public API, and it had no tests
 * at all: `component-coverage.test.ts` follows `.svelte` imports, so a plain
 * `.ts` module that nothing imports from a test is invisible to it.
 *
 * A fake being wrong is worse than a component being wrong. A component fails
 * in front of someone; a fake fails by making a broken thing look like it
 * works — which is exactly what the abort arm below caught.
 */

import { describe, it, expect } from 'vitest';

import { createMockAuthDeps } from '../src/lib/testing/index.js';
import type { AuthError } from '../src/lib/errors/types.js';

const credentials = { email: 'ada@example.com', password: 'correct-horse', rememberMe: false };

describe('signing in', () => {
	it('returns a session by default', async () => {
		const deps = createMockAuthDeps();
		await expect(deps.login(credentials)).resolves.toMatchObject({ display_name: 'Ada Lovelace' });
	});

	it('returns the session it was given', async () => {
		const session = { subject_id: 'x', display_name: 'Grace', roles: ['admin'] };
		const deps = createMockAuthDeps({ session });
		await expect(deps.login(credentials)).resolves.toEqual(session);
	});

	it('accepts one account and rejects the rest', async () => {
		// What lets a demo show both outcomes without a toggle.
		const deps = createMockAuthDeps({
			accepts: { email: credentials.email, password: credentials.password }
		});

		await expect(deps.login(credentials)).resolves.toBeDefined();
		await expect(deps.login({ ...credentials, password: 'wrong' })).rejects.toMatchObject({
			code: 'invalid_credentials'
		});
	});

	it('rejects with the exact failure it was handed', async () => {
		// The point of the fake. A fake that rejects with a bare `Error` produces
		// `code: 'unknown'` — the flattening the union exists to prevent — and the
		// MFA branch becomes unreachable in every demo and test built on it.
		const failWith: AuthError = {
			code: 'mfa_required',
			message: 'Enter your code.',
			challengeId: 'chal_1',
			methods: ['totp']
		};
		const deps = createMockAuthDeps({ failWith });

		await expect(deps.login(credentials)).rejects.toEqual(failWith);
	});

	it('fails before checking the credentials, so `failWith` always wins', async () => {
		const deps = createMockAuthDeps({
			failWith: { code: 'rate_limited', message: 'slow down' },
			accepts: { email: credentials.email, password: credentials.password }
		});

		// Correct credentials, and it still fails — which is what "always fails
		// this way" has to mean for a branch demo to work.
		await expect(deps.login(credentials)).rejects.toMatchObject({ code: 'rate_limited' });
	});
});

describe('signing up', () => {
	it('defaults to the branch that demands more of a surface', async () => {
		// `verificationRequired` by default, deliberately: a demo that only ever
		// shows the auto-login path never exercises the terminal panel, which is
		// the half of signup that is easy to get wrong.
		await expect(createMockAuthDeps().signup(credentials)).resolves.toEqual({
			kind: 'verificationRequired',
			email: credentials.email
		});
	});

	it('issues a session when asked to', async () => {
		const deps = createMockAuthDeps({ signupOutcome: 'session' });

		await expect(deps.signup(credentials)).resolves.toMatchObject({
			kind: 'session',
			session: { display_name: 'Ada Lovelace' }
		});
	});

	it('rejects a taken address with the real arm', async () => {
		// A fake that rejects with a bare `Error` produces `code: 'unknown'` and
		// makes the "sign in instead" branch unreachable everywhere it is used.
		const deps = createMockAuthDeps({ takenEmails: ['taken@example.com'] });

		await expect(deps.signup({ ...credentials, email: 'taken@example.com' })).rejects.toMatchObject(
			{ code: 'email_taken', email: 'taken@example.com' }
		);
		await expect(deps.signup({ ...credentials, email: 'free@example.com' })).resolves.toBeDefined();
	});

	it('lets `failWith` win over a free address', async () => {
		const deps = createMockAuthDeps({
			failWith: { code: 'rate_limited', message: 'slow down' },
			takenEmails: ['taken@example.com']
		});

		await expect(deps.signup({ ...credentials, email: 'free@example.com' })).rejects.toMatchObject({
			code: 'rate_limited'
		});
	});

	it('honours the abort signal, as every member must', async () => {
		const controller = new AbortController();
		controller.abort();

		await expect(
			createMockAuthDeps().signup(credentials, controller.signal)
		).rejects.toMatchObject({ name: 'AbortError' });
	});
});

describe('confirming an address', () => {
	it('defaults to verified-without-a-session', async () => {
		await expect(createMockAuthDeps().verifyEmail('tok_1')).resolves.toBeNull();
	});

	it('issues a session when asked to', async () => {
		const deps = createMockAuthDeps({ verifyOutcome: 'session' });
		await expect(deps.verifyEmail('tok_1')).resolves.toMatchObject({ display_name: 'Ada Lovelace' });
	});

	it('rejects a listed token as expired', async () => {
		// The failure the whole surface exists to handle — a link opened a week
		// late is the ordinary case here, not the exceptional one.
		const deps = createMockAuthDeps({ expiredTokens: ['stale'] });

		await expect(deps.verifyEmail('stale')).rejects.toMatchObject({ code: 'token_expired' });
		await expect(deps.verifyEmail('fresh')).resolves.toBeNull();
	});

	it('resends without saying whether the address exists', async () => {
		// Answering differently for a known and an unknown address is an
		// account-existence oracle, so the fake resolves for both.
		const deps = createMockAuthDeps();

		await expect(deps.resendVerification('ada@example.com')).resolves.toBeUndefined();
		await expect(deps.resendVerification('nobody@example.com')).resolves.toBeUndefined();
	});

	it('honours the abort signal on both calls', async () => {
		const controller = new AbortController();
		controller.abort();
		const deps = createMockAuthDeps();

		await expect(deps.verifyEmail('t', controller.signal)).rejects.toMatchObject({
			name: 'AbortError'
		});
		await expect(deps.resendVerification('a@b.com', controller.signal)).rejects.toMatchObject({
			name: 'AbortError'
		});
	});
});

describe('password recovery', () => {
	it('accepts a reset request for any address at all', async () => {
		// A fake that rejected for unknown addresses would let a surface be built
		// on an account-existence oracle and pass its own tests.
		const deps = createMockAuthDeps();

		await expect(deps.requestPasswordReset('ada@example.com')).resolves.toBeUndefined();
		await expect(deps.requestPasswordReset('nobody@example.com')).resolves.toBeUndefined();
	});

	it('defaults to a reset that does not sign you in', async () => {
		await expect(createMockAuthDeps().resetPassword('tok', 'pw')).resolves.toBeNull();
	});

	it('issues a session when asked to', async () => {
		const deps = createMockAuthDeps({ resetOutcome: 'session' });
		await expect(deps.resetPassword('tok', 'pw')).resolves.toMatchObject({
			display_name: 'Ada Lovelace'
		});
	});

	it('rejects a listed reset token as expired', async () => {
		const deps = createMockAuthDeps({ expiredResetTokens: ['stale'] });

		await expect(deps.resetPassword('stale', 'pw')).rejects.toMatchObject({
			code: 'token_expired'
		});
		await expect(deps.resetPassword('fresh', 'pw')).resolves.toBeNull();
	});

	it('keeps its expired lists apart', async () => {
		// So a demo can have a live verification link and a dead reset link at
		// once, which is the state a user who ignored one mail is actually in.
		const deps = createMockAuthDeps({ expiredTokens: ['verify-stale'] });

		await expect(deps.verifyEmail('verify-stale')).rejects.toMatchObject({
			code: 'token_expired'
		});
		await expect(deps.resetPassword('verify-stale', 'pw')).resolves.toBeNull();
	});

	it('honours the abort signal on both calls', async () => {
		const controller = new AbortController();
		controller.abort();
		const deps = createMockAuthDeps();

		await expect(deps.requestPasswordReset('a@b.com', controller.signal)).rejects.toMatchObject({
			name: 'AbortError'
		});
		await expect(deps.resetPassword('t', 'pw', controller.signal)).rejects.toMatchObject({
			name: 'AbortError'
		});
	});
});

describe('cancellation', () => {
	it('refuses an already-aborted signal, latency or not', async () => {
		// The arm that found a defect. `wait` checked the signal only inside the
		// `latencyMs > 0` branch, and zero is the default — so at the setting every
		// test uses, a cancelled request resolved *successfully*. A flow that had
		// stopped cancelling would have looked fine here.
		const controller = new AbortController();
		controller.abort();

		for (const latencyMs of [0, 10]) {
			const deps = createMockAuthDeps({ latencyMs });
			await expect(
				deps.login(credentials, controller.signal),
				`latencyMs: ${latencyMs}`
			).rejects.toMatchObject({ name: 'AbortError' });
		}
	});

	it('refuses a signal aborted while the request is in flight', async () => {
		const deps = createMockAuthDeps({ latencyMs: 50 });
		const controller = new AbortController();
		const pending = deps.login(credentials, controller.signal);

		controller.abort();

		await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
	});

	it('lets an untouched signal through', async () => {
		// The non-vacuity arm: every assertion above is satisfied by a fake that
		// rejects unconditionally.
		const deps = createMockAuthDeps({ latencyMs: 10 });
		const controller = new AbortController();

		await expect(deps.login(credentials, controller.signal)).resolves.toBeDefined();
	});
});

describe('the session calls', () => {
	it('starts anonymous rather than silently signing someone in', async () => {
		// A demo that wants an authenticated start dispatches `sessionEstablished`
		// and says so, instead of a resolve deciding it.
		const deps = createMockAuthDeps();
		await expect(deps.fetchSession()).resolves.toBeNull();
	});

	it('still covers the seeded-user path', async () => {
		const deps = createMockAuthDeps();
		await expect(deps.fetchLogin('seeded-agent')).resolves.toMatchObject({
			display_name: 'Ada Lovelace'
		});
		await expect(deps.fetchLogout()).resolves.toBeUndefined();
	});
});
