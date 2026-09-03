/**
 * The authenticator: challenge, enrolment, and management.
 *
 * Three of these five take **no request body**, and deliberately carry no body
 * schema. The client sends them with no `content-type` at all, and a schema
 * with required fields would turn every one into a 400 — a failure that would
 * look like a client bug and is not.
 */

import type { FastifyInstance } from 'fastify';

import { id, recoveryCodes } from '../crypto.js';
import { fail } from '../errors.js';
import { requireAccount, requireFresh } from '../guard.js';
import { currentSession, establish, proveCredential, snapshot } from '../session.js';
import { newSecret, otpauthUri, verifyTotp } from '../totp.js';
import type { ServerContext } from '../server.js';

export async function mfaRoutes(
	app: FastifyInstance,
	options: { context: ServerContext }
): Promise<void> {
	const { store, freshnessMs, secureCookie } = options.context;

	app.post<{ Body: { challenge_id: string; code: string; method: string } }>(
		'/auth/mfa/verify',
		{
			schema: {
				body: {
					type: 'object',
					required: ['challenge_id', 'code', 'method'],
					properties: {
						challenge_id: { type: 'string' },
						code: { type: 'string' },
						method: { type: 'string' }
					}
				}
			}
		},
		async (request, reply) => {
			const { challenge_id: challengeId, code, method } = request.body;

			const challenge = store.challenges.peek(challengeId);
			if (challenge === null) {
				return fail(reply, 410, 'token_expired', 'That sign-in attempt has expired. Start again.');
			}
			const account = store.accounts.get(challenge.accountId);
			if (account === undefined || account.mfaSecret === null) {
				return fail(reply, 410, 'token_expired', 'That sign-in attempt has expired. Start again.');
			}

			const accepted =
				method === 'recovery_code'
					? consumeRecoveryCode(account.recoveryCodes, code)
					: verifyTotp(account.mfaSecret, code.trim(), account.email);

			if (!accepted) {
				// The challenge survives a wrong code — mistyping six digits is the
				// commonest thing that happens here, and burning the challenge would
				// send the user back to the password screen for it.
				return fail(reply, 401, 'invalid_credentials', 'That code was not accepted.');
			}

			store.challenges.delete(challengeId);

			// **A session, always.** There is no 204 branch: a second factor that
			// verified without producing one would leave the user having proved who
			// they are and still signed out.
			const existing = currentSession(request, store);
			if (existing !== null && existing.accountId === account.id) {
				proveCredential(existing, Date.now());
			} else {
				establish(reply, store, account.id, Date.now(), secureCookie);
			}
			return reply.status(200).send(snapshot(account));
		}
	);

	/** No body, so no schema. Starts an enrolment without touching the account. */
	app.post('/auth/mfa/enrol', async (request, reply) => {
		const current = requireAccount(request, reply, store);
		if (current === null) return reply;

		const secret = newSecret();
		const enrolmentId = id();
		store.enrolments.put(enrolmentId, {
			accountId: current.account.id,
			secret,
			expiresAt: Date.now() + 10 * 60_000
		});

		// All three fields are required by the client's decoder: a secret with no
		// URI leaves an authenticator app unusable, a URI with no secret leaves
		// manual entry impossible.
		return reply.status(200).send({
			enrolment_id: enrolmentId,
			secret,
			otpauth_uri: otpauthUri(secret, current.account.email)
		});
	});

	app.post<{ Body: { enrolment_id: string; code: string } }>(
		'/auth/mfa/enrol/confirm',
		{
			schema: {
				body: {
					type: 'object',
					required: ['enrolment_id', 'code'],
					properties: { enrolment_id: { type: 'string' }, code: { type: 'string' } }
				}
			}
		},
		async (request, reply) => {
			const current = requireAccount(request, reply, store);
			if (current === null) return reply;

			const enrolment = store.enrolments.peek(request.body.enrolment_id);
			if (enrolment === null || enrolment.accountId !== current.account.id) {
				return fail(reply, 410, 'token_expired', 'That setup has expired. Start again.');
			}

			// Verified against the *enrolment's* secret, not the account's — the
			// whole point of confirmation is proving the new secret reached the
			// authenticator before it is attached to anything.
			if (!verifyTotp(enrolment.secret, request.body.code.trim(), current.account.email)) {
				return fail(reply, 401, 'invalid_credentials', 'That code was not accepted.');
			}

			store.enrolments.delete(request.body.enrolment_id);
			current.account.mfaSecret = enrolment.secret;
			current.account.mfaEnabled = true;
			current.account.recoveryCodes = recoveryCodes();

			return reply.status(200).send({ recovery_codes: current.account.recoveryCodes });
		}
	);

	/** No body. Sensitive, so it demands a freshly proven credential. */
	app.post('/auth/mfa/disable', async (request, reply) => {
		const current = requireAccount(request, reply, store);
		if (current === null) return reply;
		if (!requireFresh(reply, current, freshnessMs)) return reply;

		current.account.mfaEnabled = false;
		current.account.mfaSecret = null;
		// The codes die with the authenticator. Leaving them would let a surface
		// show a list that cannot be used for anything.
		current.account.recoveryCodes = [];

		return reply.status(204).send();
	});

	/** No body. Also sensitive — new codes invalidate whatever the user has saved. */
	app.post('/auth/mfa/recovery-codes', async (request, reply) => {
		const current = requireAccount(request, reply, store);
		if (current === null) return reply;
		if (!requireFresh(reply, current, freshnessMs)) return reply;

		if (!current.account.mfaEnabled) {
			return fail(reply, 422, 'unknown', 'Two-factor authentication is not turned on.');
		}

		current.account.recoveryCodes = recoveryCodes();
		// Never an empty array: the client's decoder refuses one, because a surface
		// showing no codes would tell the user they were finished when they were not.
		return reply.status(200).send({ recovery_codes: current.account.recoveryCodes });
	});
}

/** Consume a recovery code in place. Single use, by definition. */
function consumeRecoveryCode(codes: string[], candidate: string): boolean {
	const wanted = candidate.trim().toLowerCase();
	const index = codes.findIndex((code) => code.toLowerCase() === wanted);
	if (index < 0) return false;
	codes.splice(index, 1);
	return true;
}
