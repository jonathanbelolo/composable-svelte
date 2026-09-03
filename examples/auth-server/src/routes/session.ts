/**
 * The three calls `createHttpSessionDeps` makes.
 *
 * These are the ones the client's *session* store uses, as opposed to the flow
 * adapter. Two of them do not go through `authErrorFromResponse` at all — they
 * throw a plain `Error` with the body discarded — so there is no point crafting
 * a rich failure body for them.
 */

import type { FastifyInstance } from 'fastify';

import { clear, currentAccount, establish, sessionWindows, snapshot } from '../session.js';
import type { ServerContext } from '../server.js';

export async function sessionRoutes(
	app: FastifyInstance,
	options: { context: ServerContext }
): Promise<void> {
	const { store, secureCookie, now, idleMs, absoluteMs } = options.context;

	/**
	 * The seeded dev sign-in: pick an account by id, no credential.
	 *
	 * **Must answer 200 with the session body.** `fetchLogin` calls
	 * `decodeSessionSnapshot` unconditionally, so a 204 here throws
	 * `MalformedSessionError` rather than signing anyone in.
	 *
	 * Its failure path throws a plain `Error` on the client with the body
	 * discarded, so this sends a bare status — an error envelope here would be
	 * written and never read.
	 *
	 * `authenticatedAt` is set to now: this is an explicit developer action
	 * naming an account, and it is the endpoint the guard demos sign in through.
	 * It is compiled out of production builds in the real backend.
	 */
	app.post<{ Body: { user_id: string } }>(
		'/auth/login',
		{
			schema: {
				body: {
					type: 'object',
					required: ['user_id'],
					properties: { user_id: { type: 'string' } }
				}
			}
		},
		async (request, reply) => {
			const account = store.accounts.get(request.body.user_id);
			if (account === undefined) {
				return reply.status(404).send();
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

	/**
	 * Sign out.
	 *
	 * **No body schema.** The client sends this with no body and no
	 * `content-type`; a schema with required fields would turn every logout into
	 * a 400. The same applies to the three MFA endpoints that take no body.
	 *
	 * 204, because the client never reads the response.
	 */
	app.post('/auth/logout', async (request, reply) => {
		const current = currentAccount(request, store, { now, idleMs });
		clear(reply, store, current === null ? null : current.session, secureCookie);
		return reply.status(204).send();
	});

	/**
	 * Who am I.
	 *
	 * Anonymous is 401 **or** 204 — the client treats both identically, and which
	 * one this sends is a server option so a test can prove that.
	 */
	app.get('/auth/session', async (request, reply) => {
		const current = currentAccount(request, store, { now, idleMs });
		if (current === null) {
			return reply.status(options.context.anonymousStatus).send();
		}
		return reply.status(200).send(snapshot(current.account));
	});
}
