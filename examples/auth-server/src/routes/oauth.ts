/**
 * OAuth: the four client endpoints, plus a stub identity provider.
 *
 * The stub is what makes the round trip testable at all. `beginOAuth` takes no
 * redirect URI — the backend owns it, registered with the provider — so an app
 * has exactly one callback URL, and without a provider to bounce off there is
 * nothing to bounce.
 *
 * ## What binds `state`, and what deliberately does not
 *
 * 1. `state` → the begin record, here. This is the CSRF binding the client
 *    structurally cannot perform: whoever controls the callback URL controls the
 *    client's copy of the nonce, so only the server's check counts.
 * 2. `code` → `state`, at the identity provider. The provider stamps the state
 *    it was handed into the code it mints, so a code from one sign-in cannot be
 *    redeemed against another's state.
 * 3. `state` → the *browser*: **this fixture binds nothing.** A production
 *    server would tie the state to a pre-session cookie. Here the browser-side
 *    half is the client's own `sessionStorage` record, and this server's job is
 *    only to prove the server-side half exists. Saying so is the difference
 *    between a fixture and a production server.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';

import { token as newToken } from '../crypto.js';
import { fail } from '../errors.js';
import { requireAccount, requireFresh } from '../guard.js';
import { establish, snapshot } from '../session.js';
import { createAccount, type Account } from '../store.js';
import type { ServerContext } from '../server.js';

const STATE_TTL_MS = 5 * 60_000;
const CODE_TTL_MS = 60_000;

/**
 * Who each provider says you are, absent a `login_hint`.
 *
 * Fixed per provider so a sign-in is reproducible. A test that wants a
 * different identity appends `login_hint` when it drives the authorize URL —
 * which is a real OAuth parameter, and legitimate here because the identity
 * provider is a *different party* that decides who signs in.
 */
const IDENTITIES: Record<string, string> = {
	github: 'ada@example.com',
	google: 'grace@example.com'
};

/** `http://host`, from the request. Never a constant — see `authorizeUrl` below. */
function origin(request: FastifyRequest): string {
	const host = request.headers.host ?? '127.0.0.1';
	return `http://${host}`;
}

/**
 * **The unlink rule.**
 *
 * An account may unlink a provider **iff, after the unlink, it retains at least
 * one credential the owner controls independently of the provider being
 * removed.**
 *
 * Counts as a credential:
 *  - a password;
 *  - another linked provider;
 *  - **a verified email address** — that is what makes a magic link deliverable
 *    to the owner.
 *
 * Does **not** count: an unverified address. A magic link to an address nobody
 * has proved control of is not a way in for the owner; it is a way in for
 * whoever holds that mailbox, which is exactly what verification establishes.
 *
 * That last clause is the whole design. It keeps the refusal reachable *and*
 * honest, and the case it describes is not contrived — it is what happens when
 * you sign up through Google, whose profile supplied an address this server
 * never verified. See `hopper` in the seed, and `grace` beside him: no password
 * and one provider, but a verified address, so unlinking is **allowed**. That
 * pair is why the client offers the button and lets the backend decide.
 */
export function canUnlink(account: Account, provider: string): boolean {
	if (account.passwordHash !== null) return true;
	if (account.providers.some((p) => p !== provider)) return true;
	return account.emailVerified;
}

export async function oauthRoutes(
	app: FastifyInstance,
	options: { context: ServerContext }
): Promise<void> {
	const { store, freshnessMs, callbackPath, secureCookie } = options.context;

	const providerBody = {
		type: 'object',
		required: ['provider'],
		properties: { provider: { type: 'string' } }
	} as const;

	const exchangeBody = {
		type: 'object',
		required: ['provider', 'code', 'state'],
		properties: {
			provider: { type: 'string' },
			code: { type: 'string' },
			state: { type: 'string' }
		}
	} as const;

	app.post<{ Body: { provider: string } }>(
		'/auth/oauth/begin',
		{ schema: { body: providerBody } },
		async (request, reply) => {
			const { provider } = request.body;
			const state = newToken();
			store.oauthStates.put(state, { provider, expiresAt: Date.now() + STATE_TTL_MS });

			// Built with `URL`, and with its origin taken from the request — never a
			// constant. A hardcoded port breaks the moment the server listens on an
			// ephemeral one, and the client's decoder reports that as
			// `MalformedSessionError`, which surfaces in entirely the wrong place.
			const authorize = new URL('/provider/authorize', origin(request));
			authorize.searchParams.set('client_id', 'fixture');
			authorize.searchParams.set('response_type', 'code');
			authorize.searchParams.set('state', state);
			authorize.searchParams.set('redirect_uri', `${origin(request)}${callbackPath}`);

			return reply.status(200).send({ authorize_url: authorize.toString(), state });
		}
	);

	/**
	 * The identity provider. A **different party** — it reads no app session.
	 *
	 * It validates `redirect_uri` against the one registered at construction. A
	 * dev fixture that is an open redirect is still an open redirect.
	 */
	app.get<{
		Querystring: {
			state?: string;
			redirect_uri?: string;
			deny?: string;
			login_hint?: string;
		};
	}>('/provider/authorize', async (request, reply) => {
		const { state, redirect_uri: redirectUri, deny, login_hint: hint } = request.query;

		if (typeof state !== 'string' || state === '') {
			return reply.status(400).send('missing state');
		}
		const expected = `${origin(request)}${callbackPath}`;
		if (redirectUri !== expected) {
			return reply.status(400).send('unregistered redirect_uri');
		}

		const back = new URL(redirectUri);
		back.searchParams.set('state', state);

		// Pressing "Cancel" at the provider. The only way to reach `oauth_denied`
		// through a real redirect rather than a hand-built query string.
		if (deny === '1') {
			back.searchParams.set('error', 'access_denied');
			return reply.redirect(back.toString(), 302);
		}

		const record = store.oauthStates.peek(state);
		const provider = record?.provider ?? 'github';
		const email = hint ?? IDENTITIES[provider] ?? `${provider}-user@example.com`;

		const code = newToken();
		store.oauthCodes.put(code, {
			state,
			provider,
			email: email.trim().toLowerCase(),
			// Recorded, and deliberately **not trusted** — see `complete`.
			providerVerifiedEmail: true,
			expiresAt: Date.now() + CODE_TTL_MS
		});

		back.searchParams.set('code', code);
		return reply.redirect(back.toString(), 302);
	});

	/** Read and spend a code, checking every binding. Shared by complete and link. */
	function redeem(
		provider: string,
		code: string,
		state: string
		// No `status` on the failure shape. It was written on all three returns and
		// read on none — the call sites branch on `reason` and state the number
		// themselves, so carrying it here was a third copy of a fact that already
		// existed twice, which is the shape that drifts.
	): { ok: true; email: string } | { ok: false; reason: 'state' | 'code' } {
		const begun = store.oauthStates.peek(state);
		if (begun === null || begun.provider !== provider) {
			return { ok: false, reason: 'state' };
		}

		const record = store.oauthCodes.take(code);
		if (record === null) return { ok: false, reason: 'code' };

		// The code carries the state it was minted against, so a code from one
		// sign-in cannot be redeemed against another's nonce.
		if (record.state !== state || record.provider !== provider) {
			return { ok: false, reason: 'state' };
		}

		store.oauthStates.delete(state);
		return { ok: true, email: record.email };
	}

	app.post<{ Body: { provider: string; code: string; state: string } }>(
		'/auth/oauth/complete',
		{ schema: { body: exchangeBody } },
		async (request, reply) => {
			const { provider, code, state } = request.body;
			const result = redeem(provider, code, state);

			if (!result.ok) {
				// `oauth_state_mismatch` is one of the six arms no status produces —
				// a bare 403 would read as `unknown`, losing the one thing the message
				// is for.
				return result.reason === 'state'
					? fail(reply, 403, 'oauth_state_mismatch', 'Please try signing in again.')
					: fail(reply, 410, 'token_expired', 'That sign-in has already been used.');
			}

			let account = store.byEmail(result.email);
			if (account === null) {
				account = createAccount(result.email);
				// **The provider's `email_verified` claim is recorded and not acted
				// on.** A provider asserting an address is not this server verifying
				// it, and the gap is exactly what makes `hopper` a real case: no
				// password, one provider, an address nobody here ever confirmed.
				account.emailVerified = false;
				store.accounts.set(account.id, account);
			}
			if (!account.providers.includes(provider)) account.providers.push(provider);

			// **`authenticatedAt: 0` — born stale.** An account at Google is not a
			// credential on this account.
			establish(reply, store, account.id, 0, secureCookie);
			return reply.status(200).send(snapshot(account));
		}
	);

	app.post<{ Body: { provider: string; code: string; state: string } }>(
		'/auth/oauth/link',
		{ schema: { body: exchangeBody } },
		async (request, reply) => {
			const current = requireAccount(request, reply, store);
			if (current === null) return reply;

			const { provider, code, state } = request.body;
			const result = redeem(provider, code, state);
			if (!result.ok) {
				return result.reason === 'state'
					? fail(reply, 403, 'oauth_state_mismatch', 'Please try connecting again.')
					: fail(reply, 410, 'token_expired', 'That connection attempt has already been used.');
			}

			const owner = store.byEmail(result.email);
			if (owner !== null && owner.id !== current.account.id) {
				return fail(
					reply,
					422,
					'unknown',
					'That account is already connected to a different user.'
				);
			}

			if (!current.account.providers.includes(provider)) {
				current.account.providers.push(provider);
			}

			// **204, and no `Set-Cookie`.** Linking attaches a provider to the
			// session the user already has; establishing one here would be a second
			// sign-in nobody asked for. A naive implementation reuses `complete` and
			// rotates the cookie, which is the one outcome the contract forbids.
			return reply.status(204).send();
		}
	);

	app.post<{ Body: { provider: string } }>(
		'/auth/oauth/unlink',
		{ schema: { body: providerBody } },
		async (request, reply) => {
			const current = requireAccount(request, reply, store);
			if (current === null) return reply;
			if (!requireFresh(reply, current, freshnessMs)) return reply;

			const { provider } = request.body;
			if (!current.account.providers.includes(provider)) {
				return fail(reply, 422, 'unknown', 'That account is not connected.');
			}

			if (!canUnlink(current.account, provider)) {
				// **422, not 409.** There is no `last_credential` arm in the client's
				// union, and a bare 409 maps to `email_taken` — comically wrong. 422
				// already maps to `unknown`, so even if this body were lost in a proxy
				// the verdict degrades to `unknown` rather than to a wrong code.
				//
				// The message carries the whole explanation, because on this branch
				// the message *is* the recovery: the client deliberately does not
				// decide this, and has nothing else to show.
				return fail(
					reply,
					422,
					'unknown',
					`Disconnecting ${provider} would leave this account with no way to sign in. ` +
						'Set a password or verify your email address first.'
				);
			}

			current.account.providers = current.account.providers.filter((p) => p !== provider);
			return reply.status(204).send();
		}
	);

}
