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
import { establish, snapshot } from '../session.js';
import type { ServerContext } from '../server.js';

export async function accountRoutes(
	app: FastifyInstance,
	options: { context: ServerContext }
): Promise<void> {
	const { store, freshnessMs, rotateSessionOnPasswordChange, secureCookie } = options.context;

	app.get('/auth/account', async (request, reply) => {
		const current = requireAccount(request, reply, store);
		if (current === null) return reply;

		const { account } = current;
		return reply.status(200).send({
			email: account.email,
			email_verified: account.emailVerified,
			has_password: account.passwordHash !== null,
			mfa_enabled: account.mfaEnabled,
			providers: account.providers
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
			const current = requireAccount(request, reply, store);
			if (current === null) return reply;
			if (!requireFresh(reply, current, freshnessMs)) return reply;

			current.account.passwordHash = await hashPassword(request.body.password);

			if (!rotateSessionOnPasswordChange) {
				// **204 = changed, session untouched.** Read from the status.
				return reply.status(204).send();
			}

			// Rotating invalidates other devices, which is why many backends do it —
			// and it is the branch with handover logic on the client, where the new
			// snapshot has to cross into the session store.
			store.sessions.delete(current.session.id);
			establish(reply, store, current.account.id, Date.now(), secureCookie);
			return reply.status(200).send(snapshot(current.account));
		}
	);
}
