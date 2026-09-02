/**
 * The twelve arms of `AuthError`, produced by a server rather than a fixture.
 *
 * The stub suite in `packages/auth` already checks that the *reader* decodes
 * each shape. What it cannot check is that anything ever emits them: every one
 * of those tests hands `authErrorFromResponse` a `Response` we wrote ourselves,
 * so a server that never sent `mfa_required` would look identical to one that
 * did.
 *
 * Two arms are deliberately absent from the table below, and both are noted
 * where they belong:
 *
 * - **`oauth_denied`** is produced by the client from the callback *query
 *   string*, not from any response body. The server's half — a 302 carrying
 *   `error=access_denied` — is asserted in `oauth.test.ts`.
 * - **`network`** cannot be sent at all. It is classified client-side from a
 *   `TypeError`, so the only honest way to reach it is to kill the server. See
 *   the last test.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// The `/errors` subpath, not the root barrel: the root pulls in Svelte
// components, which a Node-environment config has no plugin to transform.
import { isAuthError, toAuthError } from '@composable-svelte/auth/errors';

import { SEED, SEED_PASSWORD } from '../src/store.js';
import { startServer, type Harness } from './harness.js';

describe('every arm a server can send', () => {
	let h: Harness;

	beforeAll(async () => {
		h = await startServer();
	});
	afterAll(async () => {
		await h.stop();
	});

	const rejection = async (run: () => Promise<unknown>): Promise<Record<string, unknown>> => {
		const error = await run()
			.then(() => null)
			.catch((e: unknown) => e);
		expect(error, 'the call resolved instead of failing').not.toBeNull();
		return error as Record<string, unknown>;
	};

	it('invalid_credentials — a wrong password', async () => {
		const error = await rejection(() =>
			h.deps.login({ email: SEED.ada.email, password: 'nope' })
		);
		expect(error['code']).toBe('invalid_credentials');
	});

	it('mfa_required — an account with an authenticator, carrying a challenge id', async () => {
		// Reachable from no HTTP status. And `challenge_id` is mandatory: without
		// it the client degrades the whole thing to `unknown`, silently.
		const error = await rejection(() =>
			h.deps.login({ email: SEED.turing.email, password: SEED_PASSWORD })
		);
		expect(error['code']).toBe('mfa_required');
		expect(error['challengeId']).toEqual(expect.any(String));
		expect(error['methods']).toEqual(expect.arrayContaining(['totp']));
	});

	it('email_unverified — a confirmed address is required first', async () => {
		// Also body-only: a bare 403 reads as `unknown`, and the surface would show
		// "something went wrong" instead of offering another email.
		const email = `unverified-${Date.now()}@example.com`;
		await h.deps.signup({ email, password: SEED_PASSWORD });

		const error = await rejection(() => h.deps.login({ email, password: SEED_PASSWORD }));
		expect(error['code']).toBe('email_unverified');
		expect(error['email']).toBe(email);
	});

	it('email_taken — the address already has an account', async () => {
		const error = await rejection(() =>
			h.deps.signup({ email: SEED.ada.email, password: SEED_PASSWORD })
		);
		expect(error['code']).toBe('email_taken');
		expect(error['email']).toBe(SEED.ada.email);
	});

	it('account_locked — too many attempts, with a time to come back', async () => {
		const email = `locked-${Date.now()}@example.com`;
		for (let i = 0; i < 4; i += 1) {
			await h.deps.login({ email, password: 'wrong' }).catch(() => undefined);
		}
		const error = await rejection(() => h.deps.login({ email, password: 'wrong' }));
		expect(error['code']).toBe('account_locked');
		expect(error['until']).toEqual(expect.any(String));
		// ISO 8601, not a `Date` — every field crosses SSR hydration via
		// `JSON.stringify`, so a `Date` would arrive as a string while the type
		// still claimed `Date`.
		expect(Number.isFinite(Date.parse(error['until'] as string))).toBe(true);
	});

	it('rate_limited — with the delay taken from the header', async () => {
		const email = `limited-${Date.now()}@example.com`;
		await h.deps.requestMagicLink(email);

		const error = await rejection(() => h.deps.requestMagicLink(email));
		expect(error['code']).toBe('rate_limited');
		expect(error['retryAfterSeconds']).toEqual(expect.any(Number));
	});

	it('token_expired — a link that has already been spent', async () => {
		const email = `spent-${Date.now()}@example.com`;
		await h.deps.signup({ email, password: SEED_PASSWORD });
		const sent = [...h.store.outbox].reverse().find((s) => s.to === email);
		await h.deps.verifyEmail(sent!.token);

		const error = await rejection(() => h.deps.verifyEmail(sent!.token));
		expect(error['code']).toBe('token_expired');
	});

	it('oauth_state_mismatch — a code redeemed against the wrong nonce', async () => {
		// Body-only. It carries nothing else, deliberately: naming the reason would
		// tell an attacker whether a sign-in was in progress.
		const error = await rejection(() => h.deps.completeOAuth('github', 'made-up', 'also-made-up'));
		expect(error['code']).toBe('oauth_state_mismatch');
	});

	it('reauthentication_required — a session that never proved a credential', async () => {
		await h.deps.requestMagicLink(SEED.ada.email);
		const sent = [...h.store.outbox]
			.reverse()
			.find((s) => s.to === SEED.ada.email && s.kind === 'magic-link');
		await h.deps.signInWithMagicLink(sent!.token);

		const error = await rejection(() => h.deps.changePassword('a-brand-new-passphrase'));
		expect(error['code']).toBe('reauthentication_required');
		expect(error['methods']).toEqual(['password']);
	});

	it('unknown — a refusal with no arm of its own', async () => {
		// The unlink refusal. Sent as 422 rather than 409 precisely because a bare
		// 409 maps to `email_taken`, which would be nonsense on this branch.
		await h.deps.fetchLogin(SEED.hopper.id);
		const error = await rejection(() => h.deps.unlinkOAuthProvider('google'));
		expect(error['code']).toBe('unknown');
		expect(error['message']).toContain('no way to sign in');
	});

	it('unknown — an unrouted URL still arrives in the contract envelope', async () => {
		// Fastify's own 404 body uses `error` as a *string*, which the client's
		// reader discards entirely. `setNotFoundHandler` is what stops that, and
		// this is the arm that would notice if it were removed.
		const response = await h.fetch(`${h.baseUrl}/auth/not-a-route`, { method: 'POST' });
		const body = (await response.json()) as { error?: unknown };

		expect(response.status).toBe(404);
		expect(typeof body.error, 'the 404 body used `error` as a string, so it is ignored').toBe(
			'object'
		);
		expect((body.error as { code: string }).code).toBe('unknown');
	});

	it('unknown — a schema rejection keeps the envelope too', async () => {
		const response = await h.fetch(`${h.baseUrl}/auth/password-login`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email: 'no-password-field@example.com' })
		});
		const body = (await response.json()) as { error?: unknown };

		expect(response.status).toBe(400);
		expect(typeof body.error).toBe('object');
	});
});

describe('network', () => {
	it('is what the adapter reports when the server is gone', async () => {
		// The one arm no response can carry: it is produced from a rejected
		// `fetch`, so a stub that resolves can never reach it. Killing the server
		// is the only honest way — and the reason this fixture is more than a
		// tidier set of fixtures.
		//
		// Asserted on what the **adapter** throws, not on what `toAuthError` makes
		// of it. That distinction is the fix: the adapter used to let a raw
		// `TypeError` escape, breaking `AuthDependencies`' promise that every
		// member rejects with an `AuthError`, and leaving classification to a
		// heuristic that only knew four engine strings.
		const h = await startServer();
		await h.deps.fetchLogin(SEED.ada.id);

		await h.app.close();

		const thrown = await h.deps
			.fetchAccount()
			.then(() => null)
			.catch((e: unknown) => e);

		expect(thrown, 'the call succeeded against a closed server').not.toBeNull();
		expect(isAuthError(thrown), 'a raw TypeError escaped the adapter').toBe(true);
		expect(thrown).toMatchObject({ code: 'network' });

		// A sentence, not the engine's string. Components render `message`
		// straight into a banner, so the alternative is showing a person
		// "fetch failed" — which is what undici says here and Chrome does not.
		expect((thrown as { message: string }).message).toContain('Could not reach the server');

		// And it survives `toAuthError` unchanged, which is what every flow
		// reducer puts it through.
		expect(toAuthError(thrown)).toMatchObject({ code: 'network' });

		await h.stop();
	});
});
