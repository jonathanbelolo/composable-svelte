/**
 * The three calls `createHttpSessionDeps` makes.
 *
 * These are the ones the client's *session* store uses, as opposed to the flow
 * adapter. Two of them do not go through `authErrorFromResponse` at all — they
 * throw a plain `Error` with the body discarded — so there is no point crafting
 * a rich failure body for them.
 */

import type { FastifyInstance } from 'fastify';

import { requireAccount } from '../guard.js';
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
			const session = establish(
				reply,
				store,
				account.id,
				sessionWindows(options.context, true),
				secureCookie
			);
			return reply.status(200).send(snapshot(account, session));
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
		return reply.status(200).send(snapshot(current.account, current.session));
	});

	/**
	 * Extend the session's idle window.
	 *
	 * **`requireAccount` and deliberately no `requireFresh`.** Demanding a
	 * freshly proven credential to extend a session would mean only the session
	 * that least needs extending can be extended, and the endpoint would be
	 * decorative.
	 *
	 * **The session id is not rotated.** Two tabs refreshing concurrently would
	 * race, and the loser would hold a cookie the server has forgotten.
	 * Rotation belongs on authentication events, which is where it already is:
	 * `POST /auth/account/password` deletes and re-establishes.
	 *
	 * **POST, not GET**, and that is load-bearing even under `SameSite=Lax`:
	 * Lax withholds the cookie from a cross-site POST entirely, but *sends* it
	 * on a cross-site top-level GET navigation — so a GET version could be
	 * extended by luring someone into clicking a link.
	 *
	 * `currentSession` has already slid the window by the time this runs, so
	 * there is nothing left to do but report it.
	 */
	app.post('/auth/session/refresh', async (request, reply) => {
		const current = requireAccount(request, reply, store, { now, idleMs });
		if (current === null) return reply;

		return reply
			.status(200)
			.send({ expires_at: new Date(current.session.idleExpiresAt).toISOString() });
	});
}
