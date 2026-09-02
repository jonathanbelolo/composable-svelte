/**
 * The OAuth half of `createHttpAuthDeps()`, and the storage that actually ships.
 *
 * Both had zero coverage when they landed, which is the wrong place to have
 * none. Everything above the adapter runs against `createMockAuthDeps`, so a
 * wire mistake here is invisible until a real backend is attached — and
 * `decodeOAuthStart` holds a security check (`authorize_url` must be
 * `http(s):`) that nothing was exercising. Likewise every component test uses
 * the in-memory pending storage, so the `sessionStorage` implementation that
 * consumers get was asserted nowhere.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

import { createHttpAuthDeps } from '../src/lib/http/index.js';
import { MalformedSessionError } from '../src/lib/session/http.js';
import { createPendingOAuthStorage, createMockAuthDeps } from '../src/lib/index.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
	sessionStorage.clear();
});

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

const START = { authorize_url: 'https://provider.example/authorize?x=1', state: 'st_1' };

describe('what the adapter sends', () => {
	it('posts the provider in the body, never in the path', async () => {
		// A provider name is caller-supplied. In the path it would be the one
		// place this adapter had to escape it; in the body it is just a string.
		const calls = stubFetch(json(START));

		await createHttpAuthDeps('/api').beginOAuth('git hub/../admin');

		expect(calls[0]!.url).toBe('/api/auth/oauth/begin');
		expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ provider: 'git hub/../admin' });
		expect(calls[0]!.init.credentials).toBe('include');
	});

	it('sends the nonce with the exchange, so the backend can bind it', async () => {
		const calls = stubFetch(json({ subject_id: 'u1', display_name: 'Ada', roles: [] }));

		await createHttpAuthDeps('/api').completeOAuth('github', 'c_1', 'st_1');

		expect(calls[0]!.url).toBe('/api/auth/oauth/complete');
		expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
			provider: 'github',
			code: 'c_1',
			state: 'st_1'
		});
	});
});

describe('what the adapter refuses', () => {
	it('refuses an authorize_url that is not http(s)', async () => {
		// The security arm. This value is handed to `location.assign`, so a
		// compromised or misconfigured backend answering `javascript:` would be
		// executing script in the app's origin by way of a navigation.
		for (const authorize_url of [
			'javascript:alert(1)',
			'data:text/html,<script>x</script>',
			'file:///etc/passwd',
			'not a url at all'
		]) {
			stubFetch(json({ authorize_url, state: 'st_1' }));
			await expect(
				createHttpAuthDeps().beginOAuth('github'),
				`${authorize_url} was accepted`
			).rejects.toThrow(MalformedSessionError);
		}
	});

	it('refuses a start with a missing or empty nonce', async () => {
		for (const body of [
			{ authorize_url: 'https://p.example/a' },
			{ authorize_url: 'https://p.example/a', state: '' },
			{ state: 'st_1' },
			{ authorize_url: 'https://p.example/a', state: 7 }
		]) {
			stubFetch(json(body));
			await expect(
				createHttpAuthDeps().beginOAuth('github'),
				`${JSON.stringify(body)} was accepted`
			).rejects.toThrow(MalformedSessionError);
		}
	});

	it('accepts a well-formed start', async () => {
		stubFetch(json(START));
		await expect(createHttpAuthDeps().beginOAuth('github')).resolves.toEqual({
			authorizeUrl: START.authorize_url,
			state: 'st_1'
		});
	});
});

describe('what the adapter classifies', () => {
	it('carries the provider on a refusal the backend saw', async () => {
		stubFetch(
			json({ error: { code: 'oauth_denied', message: 'You cancelled.', provider: 'google' } }, 400)
		);

		await expect(createHttpAuthDeps().completeOAuth('google', 'c', 's')).rejects.toEqual({
			code: 'oauth_denied',
			message: 'You cancelled.',
			provider: 'google'
		});
	});

	it("accepts the backend's own verdict on the nonce", async () => {
		// A backend that verifies `state` server-side — which is the check that
		// counts — can report it, and `KNOWN_CODES` has to recognise the code or
		// it would be flattened to `unknown`.
		stubFetch(json({ error: { code: 'oauth_state_mismatch', message: 'Could not verify.' } }, 400));

		await expect(createHttpAuthDeps().completeOAuth('google', 'c', 's')).rejects.toEqual({
			code: 'oauth_state_mismatch',
			message: 'Could not verify.'
		});
	});
});

describe('the mock', () => {
	it('checks the nonce itself, so a broken client gate still shows up', async () => {
		// A fake that skipped this would let a test that broke the client-side
		// gate pass anyway.
		const api = createMockAuthDeps({ oauthState: 'st_real' });
		await expect(api.completeOAuth('github', 'code_demo', 'st_forged')).rejects.toMatchObject({
			code: 'oauth_state_mismatch'
		});
		await expect(api.completeOAuth('github', 'code_demo', 'st_real')).resolves.toMatchObject({
			display_name: expect.any(String)
		});
	});

	it('answers a well-formed authorize url the real decoder would accept', async () => {
		const { authorizeUrl, state } = await createMockAuthDeps().beginOAuth('github');
		expect(new URL(authorizeUrl).protocol).toBe('https:');
		expect(new URL(authorizeUrl).searchParams.get('provider')).toBe('github');
		expect(state).not.toBe('');
	});

	it('refuses a provider it does not offer', async () => {
		await expect(createMockAuthDeps().beginOAuth('myspace')).rejects.toMatchObject({
			code: 'unknown'
		});
	});
});

describe('the magic-link wire', () => {
	it('posts the address, and asks for nothing back', async () => {
		const calls = stubFetch(new Response(null, { status: 204 }));

		await createHttpAuthDeps('/api').requestMagicLink('ada@example.com');

		expect(calls[0]!.url).toBe('/api/auth/magic-link');
		expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ email: 'ada@example.com' });
	});

	it('POSTs the token in the body, not the query', async () => {
		// The same reason the surface waits for a press: a link that signs someone
		// in on GET is a link a mail scanner can spend.
		const calls = stubFetch(json({ subject_id: 'u1', display_name: 'Ada', roles: [] }));

		await createHttpAuthDeps('/api').signInWithMagicLink('tok_1');

		expect(calls[0]!.url).toBe('/api/auth/magic-link/signin');
		expect(calls[0]!.url).not.toContain('tok_1');
		expect(calls[0]!.init.method).toBe('POST');
		expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ token: 'tok_1' });
	});

	it('classifies a spent link as expired', async () => {
		stubFetch(json({ error: { code: 'token_expired', message: 'Already used.' } }, 410));

		await expect(createHttpAuthDeps().signInWithMagicLink('tok_1')).rejects.toMatchObject({
			code: 'token_expired'
		});
	});

	it('resolves the request for any address, so it is not an account oracle', async () => {
		const api = createMockAuthDeps();
		await expect(api.requestMagicLink('nobody@example.com')).resolves.toBeUndefined();
		await expect(api.requestMagicLink('ada@example.com')).resolves.toBeUndefined();
	});

	it('rejects a token the fake was not told to accept', async () => {
		const api = createMockAuthDeps({ magicLinkTokens: ['good'] });
		await expect(api.signInWithMagicLink('bad')).rejects.toMatchObject({ code: 'token_expired' });
		await expect(api.signInWithMagicLink('good')).resolves.toMatchObject({
			display_name: expect.any(String)
		});
	});
});

describe('the account wire', () => {
	it('reads the account with a GET, the second in this adapter', async () => {
		const calls = stubFetch(
			json({
				email: 'ada@example.com',
				email_verified: true,
				has_password: true,
				mfa_enabled: false,
				providers: ['github']
			})
		);

		await expect(createHttpAuthDeps('/api').fetchAccount()).resolves.toEqual({
			email: 'ada@example.com',
			emailVerified: true,
			hasPassword: true,
			mfaEnabled: false,
			providers: ['github'],
			// Absent on the wire is "no change pending", not missing data.
			pendingEmail: null
		});
		expect(calls[0]!.url).toBe('/api/auth/account');
		expect(calls[0]!.init.method).toBe('GET');
		expect(calls[0]!.init.credentials).toBe('include');
	});

	it('treats absent providers as none, and a wrong shape as malformed', async () => {
		stubFetch(json({ email: 'a@b.com', email_verified: true, has_password: false, mfa_enabled: true }));
		await expect(createHttpAuthDeps().fetchAccount()).resolves.toMatchObject({ providers: [] });

		stubFetch(
			json({ email: 'a@b.com', email_verified: true, has_password: false, mfa_enabled: true, providers: 'github' })
		);
		await expect(createHttpAuthDeps().fetchAccount()).rejects.toThrow(MalformedSessionError);
	});

	it('refuses an account missing a field a panel branches on', async () => {
		// Defaulting `has_password` would offer to change a password that does
		// not exist; defaulting `mfa_enabled` would tell someone their account is
		// less protected than it is. Both are worse than an error.
		for (const body of [
			{ email_verified: true, has_password: true, mfa_enabled: false },
			{ email: 'a@b.com', has_password: true, mfa_enabled: false },
			{ email: 'a@b.com', email_verified: true, mfa_enabled: false },
			{ email: 'a@b.com', email_verified: true, has_password: true }
		]) {
			stubFetch(json(body));
			await expect(
				createHttpAuthDeps().fetchAccount(),
				`${JSON.stringify(body)} was accepted`
			).rejects.toThrow(MalformedSessionError);
		}
	});

	it('sends only the new password, and reads 204 as "session untouched"', async () => {
		const calls = stubFetch(new Response(null, { status: 204 }));

		await expect(createHttpAuthDeps('/api').changePassword('hunter2-hunter2')).resolves.toBeNull();
		expect(calls[0]!.url).toBe('/api/auth/account/password');
		expect(JSON.parse(String(calls[0]!.init.body)), 'a current password was sent').toEqual({
			password: 'hunter2-hunter2'
		});
	});

	it('classifies a demand for proof, keeping the methods', async () => {
		stubFetch(
			json(
				{
					error: {
						code: 'reauthentication_required',
						message: 'Confirm it is you.',
						methods: ['password', 'totp', 'wallet-dance']
					}
				},
				403
			)
		);

		await expect(createHttpAuthDeps().changePassword('x')).rejects.toEqual({
			code: 'reauthentication_required',
			message: 'Confirm it is you.',
			// An unknown method is dropped rather than trusted, as `mfa_required`
			// does — a surface cannot prompt for something it has no idea about.
			methods: ['password', 'totp']
		});
	});

	it('falls back to a password challenge when the backend names no method', async () => {
		// `methods` is required on the arm, so there is no "demand with no way to
		// satisfy it" — which would strand the user on a prompt with nothing to
		// answer.
		stubFetch(json({ error: { code: 'reauthentication_required', message: 'Confirm.' } }, 403));

		await expect(createHttpAuthDeps().changePassword('x')).rejects.toMatchObject({
			methods: ['password']
		});
	});

	it('the fake can demand re-authentication, so that branch is reachable', async () => {
		const api = createMockAuthDeps({ reauthenticateFor: ['changePassword'] });
		await expect(api.changePassword('x')).rejects.toMatchObject({
			code: 'reauthentication_required'
		});
		await expect(api.fetchAccount()).resolves.toMatchObject({ email: expect.any(String) });
	});

	it('the fake reports the account it was configured with', async () => {
		const api = createMockAuthDeps({ account: { hasPassword: false, providers: ['google'] } });
		await expect(api.fetchAccount()).resolves.toMatchObject({
			hasPassword: false,
			providers: ['google'],
			email: 'ada@example.com'
		});
	});
});

describe('the pending storage that ships', () => {
	it('round-trips through sessionStorage, once', () => {
		const storage = createPendingOAuthStorage();
		storage.put({ provider: 'github', intent: 'signIn', state: 'st_1', returnTo: '/app' });

		expect(Object.keys(sessionStorage)).toEqual(['auth:oauth:pending']);
		expect(storage.take()).toEqual({
			provider: 'github',
			intent: 'signIn',
			state: 'st_1',
			returnTo: '/app'
		});
		expect(storage.take(), 'the nonce was reusable').toBeNull();
		expect(Object.keys(sessionStorage), 'the record outlived its use').toEqual([]);
	});

	it('overwrites rather than accumulating', () => {
		const storage = createPendingOAuthStorage();
		storage.put({ provider: 'a', intent: 'signIn', state: 'st_a', returnTo: null });
		storage.put({ provider: 'b', intent: 'link', state: 'st_b', returnTo: null });

		expect(Object.keys(sessionStorage)).toHaveLength(1);
		const taken = storage.take();
		expect(taken?.state).toBe('st_b');
		// The intent goes round with it — a record whose intent was dropped is
		// refused entirely, so this also pins that `put` writes it.
		expect(taken?.intent).toBe('link');
	});

	it('answers null for a record that was tampered with', () => {
		// "Cannot verify" is the honest verdict, and it is the one that lands on
		// `oauth_state_mismatch` rather than crashing the callback page.
		const storage = createPendingOAuthStorage();
		storage.put({ provider: 'github', intent: 'signIn', state: 'st_1', returnTo: null });

		sessionStorage.setItem('auth:oauth:pending', JSON.stringify({ provider: 'evil' }));
		expect(storage.take()).toBeNull();

		sessionStorage.setItem('auth:oauth:pending', 'not json at all');
		expect(storage.take()).toBeNull();
	});

	it('normalises returnTo on the way in, not only at the reducer', () => {
		const storage = createPendingOAuthStorage();
		storage.put({
			provider: 'github',
			intent: 'signIn',
			state: 'st_1',
			returnTo: 'https://evil.example'
		});
		expect(storage.take()?.returnTo).toBeNull();
	});
});
