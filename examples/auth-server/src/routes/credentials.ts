/**
 * Everything that establishes a session from something the user knows or can
 * receive: passwords, signup, email verification, recovery, magic links.
 *
 * Two rules run through the whole file.
 *
 * **No account-existence oracle.** `resend-verification`,
 * `request-password-reset` and `magic-link` succeed for every address, whether
 * or not an account exists. The client documents this as the reason those flows
 * are shaped the way they are, and a 404 here would undo it. What differs is
 * the outbox, not the response.
 *
 * **Sessions from a link are born stale.** A magic link proves control of a
 * mailbox, not knowledge of a credential on this account — see `session.ts`.
 */

import type { FastifyInstance } from 'fastify';

import { hashPassword, id, token as newToken, verifyPassword } from '../crypto.js';
import { fail } from '../errors.js';
import { currentSession, establish, proveCredential, sessionWindows, snapshot } from '../session.js';
import { createAccount, type Account, type Store, type TokenKind } from '../store.js';
import type { ServerContext } from '../server.js';

const HOUR = 60 * 60 * 1000;

/** Wrong passwords tolerated in a window before the account locks. */
const LOCK_AFTER = 3;
const LOCK_WINDOW_MS = 60_000;

/** Magic links per address per window. One, so the second request always 429s. */
const LINK_LIMIT = 1;
const LINK_WINDOW_MS = 60_000;

function issue(store: Store, account: Account, kind: TokenKind, ttlMs = HOUR): string {
	const value = newToken();
	store.tokens.put(value, { accountId: account.id, kind, expiresAt: Date.now() + ttlMs });
	store.outbox.push({ to: account.email, kind, token: value });
	return value;
}

export async function credentialRoutes(
	app: FastifyInstance,
	options: { context: ServerContext }
): Promise<void> {
	const { store, secureCookie, now, idleMs, absoluteMs } = options.context;

	const emailPassword = {
		type: 'object',
		required: ['email', 'password'],
		properties: {
			email: { type: 'string' },
			password: { type: 'string' },
			remember_me: { type: 'boolean' }
		}
	} as const;

	const emailOnly = {
		type: 'object',
		required: ['email'],
		properties: { email: { type: 'string' } }
	} as const;

	const tokenOnly = {
		type: 'object',
		required: ['token'],
		properties: { token: { type: 'string' } }
	} as const;

	app.post<{ Body: { email: string; password: string; remember_me?: boolean } }>(
		'/auth/password-login',
		{ schema: { body: emailPassword } },
		async (request, reply) => {
			const { email, password } = request.body;
			const lockKey = `lock:${email.trim().toLowerCase()}`;

			const locked = (wait: number) =>
				fail(reply, 423, 'account_locked', 'Too many attempts. Try again shortly.', {
					lockedUntil: new Date(Date.now() + wait * 1000).toISOString()
				});

			// **Checked before the password is verified.** Afterwards would mean a
			// locked account that supplies the right password sails through, which
			// makes it not a lockout but a hint about which password was right.
			const already = store.rateStatus(lockKey, LOCK_AFTER);
			if (already !== null) return locked(already);

			const account = store.byEmail(email);
			const ok =
				account !== null &&
				account.passwordHash !== null &&
				(await verifyPassword(password, account.passwordHash));

			if (!ok) {
				// One counter for both "no such account" and "wrong password", so the
				// lockout cannot be used to tell them apart.
				const wait = store.rateLimit(lockKey, LOCK_AFTER, LOCK_WINDOW_MS);
				if (wait !== null) return locked(wait);
				return fail(reply, 401, 'invalid_credentials', 'That email or password is not right.');
			}

			store.clearRate(lockKey);

			// `email_unverified` is one of the six arms no status can produce — a
			// bare 403 would be read as `unknown`, and the client would show
			// "something went wrong" instead of offering to resend the email.
			if (!account.emailVerified) {
				return fail(reply, 403, 'email_unverified', 'Confirm your email address first.', {
					email: account.email
				});
			}

			if (account.mfaEnabled && account.mfaSecret !== null) {
				const challengeId = id();
				store.challenges.put(challengeId, {
					accountId: account.id,
					expiresAt: Date.now() + 5 * 60_000
				});
				// `challenge_id` is mandatory. Without it the client degrades the whole
				// thing to `unknown` — silently — and the second-factor step becomes
				// unreachable in a way that looks like a UI bug three layers away.
				return fail(reply, 401, 'mfa_required', 'Enter the code from your authenticator.', {
					challengeId,
					// Only `totp` and `recovery_code` are legal here. A `password` sent
					// in this list is filtered out by the client, silently producing a
					// different list than the one this server sent.
					methods: account.recoveryCodes.length > 0 ? ['totp', 'recovery_code'] : ['totp']
				});
			}

			// Signing in as the account already in the cookie refreshes that session
			// rather than minting a second one. That is what closes the
			// re-authentication loop — prompt, sign in again, retry — with no
			// twenty-third endpoint.
			const existing = currentSession(request, store, { now, idleMs });
			if (existing !== null && existing.accountId === account.id) {
				proveCredential(existing, Date.now());
				return reply.status(200).send(snapshot(account));
			}

			establish(
				reply,
				store,
				account.id,
				sessionWindows(options.context, true),
				secureCookie
			);
			return reply.status(200).send(snapshot(account));
		}
	);

	app.post<{ Body: { email: string; password: string } }>(
		'/auth/signup',
		{ schema: { body: emailPassword } },
		async (request, reply) => {
			const { email, password } = request.body;

			if (store.byEmail(email) !== null) {
				return fail(reply, 409, 'email_taken', 'An account already uses that address.', {
					email: email.trim().toLowerCase()
				});
			}

			const account = createAccount(email);
			account.passwordHash = await hashPassword(password);
			store.accounts.set(account.id, account);
			issue(store, account, 'verify-email');

			// **202, and the client reads the status, never the body.** A 200 here
			// carrying an explanatory object would be decoded as a session and throw
			// `MalformedSessionError`.
			return reply.status(202).send({ status: 'verification_required' });
		}
	);

	app.post<{ Body: { token: string } }>(
		'/auth/verify-email',
		{ schema: { body: tokenOnly } },
		async (request, reply) => {
			const record = store.tokens.take(request.body.token);
			if (record === null || record.kind !== 'verify-email') {
				return fail(reply, 410, 'token_expired', 'That link is no longer valid.');
			}
			const account = store.accounts.get(record.accountId);
			if (account === undefined) {
				return fail(reply, 410, 'token_expired', 'That link is no longer valid.');
			}

			account.emailVerified = true;
			// **204 = verified, but not signed in.** Read from the status.
			return reply.status(204).send();
		}
	);

	app.post<{ Body: { email: string } }>(
		'/auth/resend-verification',
		{ schema: { body: emailOnly } },
		async (request, reply) => {
			const account = store.byEmail(request.body.email);
			if (account !== null && !account.emailVerified) issue(store, account, 'verify-email');
			// 204 whatever happened above. The outbox differs; the response does not.
			return reply.status(204).send();
		}
	);

	app.post<{ Body: { email: string } }>(
		'/auth/request-password-reset',
		{ schema: { body: emailOnly } },
		async (request, reply) => {
			const account = store.byEmail(request.body.email);
			if (account !== null) issue(store, account, 'reset-password');
			return reply.status(204).send();
		}
	);

	app.post<{ Body: { token: string; password: string } }>(
		'/auth/reset-password',
		{
			schema: {
				body: {
					type: 'object',
					required: ['token', 'password'],
					properties: { token: { type: 'string' }, password: { type: 'string' } }
				}
			}
		},
		async (request, reply) => {
			const record = store.tokens.take(request.body.token);
			if (record === null || record.kind !== 'reset-password') {
				return fail(reply, 410, 'token_expired', 'That reset link is no longer valid.');
			}
			const account = store.accounts.get(record.accountId);
			if (account === undefined) {
				return fail(reply, 410, 'token_expired', 'That reset link is no longer valid.');
			}

			account.passwordHash = await hashPassword(request.body.password);
			// Resetting proves control of the mailbox, so it also verifies the
			// address — there is no way to have followed the link otherwise.
			account.emailVerified = true;
			store.clearRate(`lock:${account.email}`);

			// **204 = changed, now sign in.**
			return reply.status(204).send();
		}
	);

	app.post<{ Body: { email: string } }>(
		'/auth/magic-link',
		{ schema: { body: emailOnly } },
		async (request, reply) => {
			const address = request.body.email.trim().toLowerCase();

			// Keyed by address, so a test picks a unique one and gets a deterministic
			// 429 on the second call — no sleeping and no fake timers.
			const wait = store.rateLimit(`magic:${address}`, LINK_LIMIT, LINK_WINDOW_MS);
			if (wait !== null) {
				// Both the header and the body field, with **different** values on
				// purpose: the client is documented to prefer the header, and sending
				// the same number twice would make that untestable.
				void reply.header('retry-after', String(wait));
				return fail(reply, 429, 'rate_limited', 'A link was just sent. Check your inbox.', {
					retryAfterSeconds: wait + 900
				});
			}

			const account = store.byEmail(address);
			if (account !== null) issue(store, account, 'magic-link', 15 * 60_000);
			return reply.status(204).send();
		}
	);

	app.post<{ Body: { token: string } }>(
		'/auth/magic-link/signin',
		{ schema: { body: tokenOnly } },
		async (request, reply) => {
			const record = store.tokens.take(request.body.token);
			if (record === null || record.kind !== 'magic-link') {
				return fail(reply, 410, 'token_expired', 'That sign-in link is no longer valid.');
			}
			const account = store.accounts.get(record.accountId);
			if (account === undefined) {
				return fail(reply, 410, 'token_expired', 'That sign-in link is no longer valid.');
			}

			// Following a link proves the address is reachable, so it verifies it.
			account.emailVerified = true;

			// **`authenticatedAt: 0` — born stale.** Reaching a mailbox is not
			// proving a credential on this account, so sensitive operations will
			// demand re-authentication. This is the policy that makes
			// `reauthentication_required` reachable with no configuration at all.
			establish(
				reply,
				store,
				account.id,
				// `authenticatedAt: 0` — no credential of this account was proven,
				// which is what makes `reauthentication_required` reachable honestly.
				sessionWindows(options.context, false),
				secureCookie
			);
			return reply.status(200).send(snapshot(account));
		}
	);
}
