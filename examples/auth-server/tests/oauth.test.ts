/**
 * The redirect, and the refusal.
 *
 * Two things here have never been exercised anywhere. The first is a real
 * round trip: `begin` → a 302 from an identity provider → a code redeemed
 * against the state that minted it. The second is the unlink refusal, which is
 * *the* design decision of the connected-accounts work — the client offers the
 * button and lets the backend decide — and which until now nothing had ever
 * actually refused.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { canUnlink } from '../src/routes/oauth.js';
import { SEED, createAccount } from '../src/store.js';
import { startServer, type Harness } from './harness.js';

describe('the OAuth round trip', () => {
	let h: Harness;

	beforeEach(async () => {
		h = await startServer();
	});
	afterEach(async () => {
		await h.stop();
	});

	/** Walk the provider's redirect and hand back the callback query. */
	async function authorize(
		authorizeUrl: string,
		extra: Record<string, string> = {}
	): Promise<URLSearchParams> {
		const url = new URL(authorizeUrl);
		for (const [key, value] of Object.entries(extra)) url.searchParams.set(key, value);

		const response = await h.fetch(url.toString(), { redirect: 'manual' });
		expect(response.status, 'the provider did not redirect').toBe(302);

		const location = response.headers.get('location');
		expect(location, 'the redirect carried no Location').not.toBeNull();
		return new URL(location!).searchParams;
	}

	it('hands out an absolute http(s) authorize URL with a nonce', async () => {
		const start = await h.deps.beginOAuth('github');

		// The client's decoder refuses anything that is not an absolute http(s)
		// URL — this value is the one thing in the package handed to
		// `location.assign`, so a `javascript:` URL would be script execution in
		// the app's own origin.
		const url = new URL(start.authorizeUrl);
		expect(['http:', 'https:']).toContain(url.protocol);
		expect(start.state).not.toBe('');
		expect(url.searchParams.get('state')).toBe(start.state);
	});

	it('completes a sign-in through a real 302', async () => {
		const start = await h.deps.beginOAuth('github');
		const back = await authorize(start.authorizeUrl);

		expect(back.get('state')).toBe(start.state);
		const code = back.get('code');
		expect(code, 'the provider came back without an authorization code').not.toBeNull();

		const session = await h.deps.completeOAuth('github', code!, start.state);
		expect(session.subject_id).toBe(SEED.ada.id);
		expect(await h.deps.fetchSession()).not.toBeNull();
	});

	it('comes back with access_denied when the user cancels', async () => {
		// The only way to reach `oauth_denied` through a real redirect. The client
		// reads it off the callback query rather than from a response body, which
		// is why the server's job here is only to send it.
		const start = await h.deps.beginOAuth('github');
		const back = await authorize(start.authorizeUrl, { deny: '1' });

		expect(back.get('error')).toBe('access_denied');
		expect(back.get('code')).toBeNull();
	});

	it('refuses a code redeemed against a different nonce', async () => {
		const first = await h.deps.beginOAuth('github');
		const second = await h.deps.beginOAuth('github');
		const back = await authorize(first.authorizeUrl);

		await expect(
			h.deps.completeOAuth('github', back.get('code')!, second.state)
		).rejects.toMatchObject({ code: 'oauth_state_mismatch' });
	});

	it('spends an authorization code exactly once', async () => {
		const start = await h.deps.beginOAuth('github');
		const back = await authorize(start.authorizeUrl);
		const code = back.get('code')!;

		await h.deps.completeOAuth('github', code, start.state);
		await expect(h.deps.completeOAuth('github', code, start.state)).rejects.toMatchObject({
			code: 'oauth_state_mismatch'
		});
	});

	it('refuses an unregistered redirect_uri', async () => {
		// A dev fixture that is an open redirect is still an open redirect.
		const start = await h.deps.beginOAuth('github');
		const url = new URL(start.authorizeUrl);
		url.searchParams.set('redirect_uri', 'http://evil.example/callback');

		const response = await h.fetch(url.toString(), { redirect: 'manual' });
		expect(response.status).toBe(400);
	});

	it('creates an OAuth account whose address is not treated as verified', async () => {
		// The provider asserting an address is not this server verifying it, and
		// that gap is what makes the unlink refusal a real case rather than a
		// contrived one.
		const start = await h.deps.beginOAuth('github');
		const back = await authorize(start.authorizeUrl, { login_hint: 'brand-new@example.com' });
		await h.deps.completeOAuth('github', back.get('code')!, start.state);

		const account = await h.deps.fetchAccount();
		expect(account.email).toBe('brand-new@example.com');
		expect(account.emailVerified, 'the provider’s claim was trusted').toBe(false);
		expect(account.hasPassword).toBe(false);
		expect(account.providers).toEqual(['github']);
	});
});

describe('linking a provider', () => {
	let h: Harness;

	beforeEach(async () => {
		h = await startServer();
	});
	afterEach(async () => {
		await h.stop();
	});

	/** Walk the provider and hand back the callback query. */
	async function authorize(
		authorizeUrl: string,
		extra: Record<string, string> = {}
	): Promise<URLSearchParams> {
		const url = new URL(authorizeUrl);
		for (const [key, value] of Object.entries(extra)) url.searchParams.set(key, value);
		const response = await h.fetch(url.toString(), { redirect: 'manual' });
		return new URL(response.headers.get('location')!).searchParams;
	}

	it('attaches to the session already in hand, and issues no session of its own', async () => {
		// The one outcome the contract forbids. A naive implementation reuses the
		// `complete` handler and rotates the cookie, which would be a second
		// sign-in nobody asked for.
		await h.deps.fetchLogin(SEED.turing.id);
		const before = h.jar.header();

		const start = await h.deps.beginOAuth('github');
		// `login_hint` so the provider returns *this* user's address. Without it
		// the fixture's `github` identity is ada, and linking would correctly be
		// refused as belonging to someone else — see the next test.
		const back = await authorize(start.authorizeUrl, { login_hint: SEED.turing.email });

		const seenBefore = h.jar.seen.length;
		await h.deps.linkOAuthProvider('github', back.get('code')!, start.state);

		expect(
			h.jar.seen.length,
			'linking a provider set a cookie, which would be a second sign-in'
		).toBe(seenBefore);
		expect(h.jar.header(), 'the session cookie changed during a link').toBe(before);

		const account = await h.deps.fetchAccount();
		expect(account.providers).toContain('github');
		expect(account.email, 'the link switched accounts').toBe(SEED.turing.email);
	});

	it('refuses to attach an identity that belongs to someone else', async () => {
		// Found by writing the test above wrongly: signed in as turing, linking
		// `github` returns ada's address. Silently attaching it would let one user
		// claim another's provider identity.
		await h.deps.fetchLogin(SEED.turing.id);

		const start = await h.deps.beginOAuth('github');
		const back = await authorize(start.authorizeUrl);

		await expect(
			h.deps.linkOAuthProvider('github', back.get('code')!, start.state)
		).rejects.toMatchObject({ code: 'unknown' });

		const account = await h.deps.fetchAccount();
		expect(account.providers, 'the identity was attached anyway').not.toContain('github');
	});
});

describe('the unlink rule', () => {
	let h: Harness;

	beforeEach(async () => {
		h = await startServer();
	});
	afterEach(async () => {
		await h.stop();
	});

	it('allows it when a password remains', async () => {
		await h.deps.fetchLogin(SEED.ada.id);
		await expect(h.deps.unlinkOAuthProvider('github')).resolves.not.toThrow();

		const account = await h.deps.fetchAccount();
		expect(account.providers).toEqual(['google']);
	});

	it('allows the last provider when the address is verified', async () => {
		// **The case the client structurally cannot decide.** No password, one
		// provider — the obvious client-side rule
		// (`hasPassword || providers.length > 1`) refuses this, and is wrong: a
		// magic link reaches her.
		await h.deps.fetchLogin(SEED.grace.id);

		const account = await h.deps.fetchAccount();
		expect(account.hasPassword).toBe(false);
		expect(account.providers).toEqual(['google']);
		expect(account.emailVerified).toBe(true);

		await expect(
			h.deps.unlinkOAuthProvider('google'),
			'refused an unlink that would have left a working way in'
		).resolves.not.toThrow();
	});

	it('refuses to strand an account whose address was never verified', async () => {
		// Hopper signed up through a provider, whose profile supplied an address
		// this server never confirmed. Disconnecting it locks him out.
		//
		// If someone later "tidies up" the seed by marking him verified, this test
		// goes red and the comment above says why. That is deliberate — the
		// documentation here is load-bearing.
		await h.deps.fetchLogin(SEED.hopper.id);

		const error = await h.deps
			.unlinkOAuthProvider('google')
			.then(() => null)
			.catch((e: unknown) => e);

		expect(error, 'the last way into an account was disconnected').not.toBeNull();
		// **`unknown`, not `email_taken`.** The refusal is sent as 422 precisely
		// because a bare 409 maps to `email_taken`, which would be nonsense here.
		expect(error).toMatchObject({ code: 'unknown' });
		expect((error as { message: string }).message).toContain('no way to sign in');

		const account = await h.deps.fetchAccount();
		expect(account.providers, 'the provider was detached despite the refusal').toEqual([
			'google'
		]);
	});
});

describe('canUnlink', () => {
	// A unit-level positive control for the rule the three tests above exercise
	// over HTTP: it names each clause separately, so a rule that collapsed into
	// "always true" could not pass by accident.
	const base = () => createAccount('someone@example.com');

	it('counts a password', () => {
		const account = base();
		account.passwordHash = 'scrypt$...';
		account.providers = ['google'];
		expect(canUnlink(account, 'google')).toBe(true);
	});

	it('counts another provider', () => {
		const account = base();
		account.providers = ['google', 'github'];
		expect(canUnlink(account, 'google')).toBe(true);
	});

	it('counts a verified address, and not an unverified one', () => {
		const verified = base();
		verified.providers = ['google'];
		verified.emailVerified = true;
		expect(canUnlink(verified, 'google')).toBe(true);

		const unverified = base();
		unverified.providers = ['google'];
		unverified.emailVerified = false;
		expect(canUnlink(unverified, 'google')).toBe(false);
	});
});
