/**
 * The read model, and the one action the spine ships.
 *
 * `GET /auth/account` is the settings read the session deliberately does not
 * carry: the session answers "who am I", this answers "what is my account
 * like". All four of `email`, `email_verified`, `has_password` and
 * `mfa_enabled` are required by the client's decoder, which refuses rather than
 * defaults — a surface that defaulted `has_password` would offer to *change* a
 * password that does not exist.
 */

import type { FastifyInstance } from 'fastify';

import { hashPassword } from '../crypto.js';
import { requireAccount, requireFresh } from '../guard.js';
import { clear, establish, sessionWindows, snapshot } from '../session.js';
import { fail } from '../errors.js';
import { HOUR, issue } from './credentials.js';
import type { ServerContext } from '../server.js';

export async function accountRoutes(
	app: FastifyInstance,
	options: { context: ServerContext }
): Promise<void> {
	const { store, freshnessMs, rotateSessionOnPasswordChange, secureCookie, now, idleMs, absoluteMs } = options.context;

	app.get('/auth/account', async (request, reply) => {
		const current = requireAccount(request, reply, store, { now, idleMs });
		if (current === null) return reply;

		const { account } = current;
		// `null` rather than omitted when nothing is pending: the client's decoder
		// treats absent and null the same, but a surface reading the raw body
		// should not have to distinguish "no change" from "this backend is old".
		const pending = store.pendingEmails.peek(account.id);
		return reply.status(200).send({
			email: account.email,
			email_verified: account.emailVerified,
			has_password: account.passwordHash !== null,
			mfa_enabled: account.mfaEnabled,
			providers: account.providers,
			pending_email: pending?.email ?? null
		});
	});

	/**
	 * Set or change the password.
	 *
	 * **No current password is asked for**, which is the contract: the client
	 * cannot know whether the account has one, so the backend decides what proof
	 * it wants. Here that is the freshness window, answered with
	 * `reauthentication_required`.
	 */
	app.post<{ Body: { password: string } }>(
		'/auth/account/password',
		{
			schema: {
				body: {
					type: 'object',
					required: ['password'],
					properties: { password: { type: 'string' } }
				}
			}
		},
		async (request, reply) => {
			const current = requireAccount(request, reply, store, { now, idleMs });
			if (current === null) return reply;
			if (!requireFresh(reply, current, { freshnessMs, now })) return reply;

			current.account.passwordHash = await hashPassword(request.body.password);

			if (!rotateSessionOnPasswordChange) {
				// **204 = changed, session untouched.** Read from the status.
				return reply.status(204).send();
			}

			// Rotating invalidates other devices, which is why many backends do it —
			// and it is the branch with handover logic on the client, where the new
			// snapshot has to cross into the session store.
			store.sessions.delete(current.session.id);
			const session = establish(
				reply,
				store,
				current.account.id,
				sessionWindows(options.context, true),
				secureCookie
			);
			return reply.status(200).send(snapshot(current.account, session));
		}
	);

	/**
	 * Ask to move the account to a different address.
	 *
	 * The link goes to the **new** address — that is the whole proof: confirming
	 * it demonstrates control of the mailbox being moved to. Nothing changes
	 * until it is followed.
	 *
	 * `email_taken` names the address, and this is the one endpoint where that
	 * is right rather than an oracle: the caller is already authenticated as
	 * themselves, so the only thing disclosed is disclosed to its owner.
	 * `request-password-reset` takes the opposite posture for the opposite
	 * reason — it is reachable by anyone.
	 */
	app.post<{ Body: { email: string } }>(
		'/auth/account/email',
		{
			schema: {
				body: { type: 'object', required: ['email'], properties: { email: { type: 'string' } } }
			}
		},
		async (request, reply) => {
			const current = requireAccount(request, reply, store, { now, idleMs });
			if (current === null) return reply;
			if (!requireFresh(reply, current, { freshnessMs, now })) return reply;

			const wanted = request.body.email.trim().toLowerCase();

			if (wanted === current.account.email) {
				// 422, which the client reads as `unknown` — deliberately not
				// `email_taken`, which would be true and useless: the account it is
				// taken by is this one.
				return fail(reply, 422, 'unknown', 'That is already your address.');
			}
			if (store.byEmail(wanted) !== null) {
				return fail(reply, 409, 'email_taken', 'That address already has an account.', {
					email: wanted
				});
			}

			const token = issue(store, current.account, 'change-email', now, HOUR, wanted);
			store.pendingEmails.put(current.account.id, {
				accountId: current.account.id,
				email: wanted,
				token,
				expiresAt: now() + HOUR
			});

			return reply.status(204).send();
		}
	);

	/**
	 * Send the confirmation link again.
	 *
	 * **No body**, and no body schema — the pending address lives on the server,
	 * so there is nothing for the client to send back. A schema with required
	 * fields would turn every resend into a 400.
	 *
	 * Re-issuing supersedes: the new token replaces the record, and the old link
	 * stops working because confirmation compares the token it was issued with.
	 */
	app.post('/auth/account/email/resend', async (request, reply) => {
		const current = requireAccount(request, reply, store, { now, idleMs });
		if (current === null) return reply;

		const pending = store.pendingEmails.peek(current.account.id);
		if (pending === null) {
			return fail(reply, 422, 'unknown', 'There is no email change to confirm.');
		}
		// Someone may have claimed it since the request.
		if (store.byEmail(pending.email) !== null) {
			return fail(reply, 409, 'email_taken', 'That address already has an account.', {
				email: pending.email
			});
		}

		const token = issue(store, current.account, 'change-email', now, HOUR, pending.email);
		store.pendingEmails.put(current.account.id, { ...pending, token, expiresAt: now() + HOUR });

		return reply.status(204).send();
	});

	/**
	 * Confirm the change.
	 *
	 * **`requireAccount` but not `requireFresh`.** A live session is required —
	 * accepting the token alone would let a forwarded mail or a mail scanner
	 * complete an identity change silently — but demanding a *freshly proven*
	 * credential as well would strand a user who followed the link an hour
	 * after asking for it, having already proved freshness to ask.
	 */
	app.post<{ Body: { token: string } }>(
		'/auth/account/email/confirm',
		{
			schema: {
				body: { type: 'object', required: ['token'], properties: { token: { type: 'string' } } }
			}
		},
		async (request, reply) => {
			const current = requireAccount(request, reply, store, { now, idleMs });
			if (current === null) return reply;

			// **`peek`, not `take`.** A single-use token must be spent only when it
			// is actually used. Consuming first and validating after meant posting
			// a *verification* link here destroyed it and then answered 410 — the
			// user's link dead, for pasting it into the wrong page.
			const record = store.tokens.peek(request.body.token);
			if (record === null || record.kind !== 'change-email') {
				return fail(reply, 410, 'token_expired', 'That link is no longer valid.');
			}
			if (record.accountId !== current.account.id) {
				// Someone else's link, on this session. Same answer as an expired
				// one: naming the difference would confirm the link exists.
				return fail(reply, 410, 'token_expired', 'That link is no longer valid.');
			}

			const pending = store.pendingEmails.peek(current.account.id);
			// **Compare the token.** Requesting twice overwrites this record while
			// the first token is still live; without this the older link would
			// apply the newer address — a link doing something its mail did not say.
			if (pending === null || pending.token !== request.body.token) {
				return fail(reply, 410, 'token_expired', 'That link is no longer valid.');
			}
			// Checked again here, not only at request time: the address can be
			// claimed in between, and that race is the whole reason to re-check.
			if (store.byEmail(pending.email) !== null) {
				return fail(reply, 409, 'email_taken', 'That address already has an account.', {
					email: pending.email
				});
			}

			// Everything checked out, so now the link is spent.
			store.tokens.delete(request.body.token);
			store.pendingEmails.delete(current.account.id);
			current.account.email = pending.email;
			// Confirmed by construction: the link went to this address and was
			// followed from it.
			current.account.emailVerified = true;

			return reply.status(200).send({ email: current.account.email });
		}
	);

	/**
	 * Delete the account.
	 *
	 * Every session goes, not just this one — leaving another tab holding a
	 * cookie for an account that no longer exists would read there as an
	 * ordinary 401 eventually, but only after a request that need not happen.
	 */
	app.delete('/auth/account', async (request, reply) => {
		const current = requireAccount(request, reply, store, { now, idleMs });
		if (current === null) return reply;
		if (!requireFresh(reply, current, { freshnessMs, now })) return reply;

		const id = current.account.id;
		for (const [sid, session] of [...store.sessions]) {
			if (session.accountId === id) store.sessions.delete(sid);
		}
		store.pendingEmails.delete(id);
		store.accounts.delete(id);

		clear(reply, store, null, secureCookie);
		return reply.status(204).send();
	});
}
