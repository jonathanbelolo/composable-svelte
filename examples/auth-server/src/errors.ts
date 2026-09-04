/**
 * The error envelope, in one place.
 *
 * The client reads failures with `authErrorFromResponse`
 * (`packages/auth/src/lib/http/errors.ts`), and three properties of that reader
 * decide everything here:
 *
 * 1. **The body's `error.code` beats the HTTP status.** So every failure this
 *    server sends names its code explicitly rather than hoping a status maps.
 * 2. **Six arms are unreachable from any status**: `mfa_required`,
 *    `email_unverified`, `oauth_denied`, `oauth_state_mismatch`,
 *    `reauthentication_required`, `network`. A bare 403 is read as `unknown`,
 *    not "forbidden".
 * 3. **The wrapper must be an object.** `readErrorBody` requires
 *    `body.error` to be a non-null object; Fastify's own default error and 404
 *    bodies use `error` as a *string*, so they are silently ignored and the
 *    status alone decides. `installErrorHandlers` exists to stop any route
 *    leaking that shape.
 */

import type { FastifyError, FastifyInstance, FastifyReply } from 'fastify';

/** The twelve arms of the client's `AuthError` union. */
export type AuthErrorCode =
	| 'invalid_credentials'
	| 'mfa_required'
	| 'email_unverified'
	| 'email_taken'
	| 'account_locked'
	| 'rate_limited'
	| 'token_expired'
	| 'oauth_denied'
	| 'oauth_state_mismatch'
	| 'reauthentication_required'
	| 'network'
	| 'unknown';

/**
 * The per-arm payload, in the client's wire names.
 *
 * Camel here, snake on the wire — the translation happens in `fail`, once,
 * rather than at eighteen call sites where one could be spelled wrong.
 */
export interface FailDetail {
	challengeId?: string | undefined;
	/**
	 * **Must be an array.** The client does `(body.methods ?? [...]).filter(...)`
	 * with no `Array.isArray` guard, so a scalar here throws a `TypeError` inside
	 * the adapter instead of producing an `AuthError` at all.
	 *
	 * The legal contents differ by arm: MFA accepts only `totp` and
	 * `recovery_code` (a `password` sent there is filtered out, silently changing
	 * the list); re-authentication also accepts `password`.
	 */
	methods?: readonly string[] | undefined;
	email?: string | undefined;
	/** ISO 8601. Absent means indefinite. */
	lockedUntil?: string | undefined;
	provider?: string | undefined;
	retryAfterSeconds?: number | undefined;
}

/**
 * Send a failure the client can branch on.
 *
 * `message` is never empty: the client uses `??`, so `null` falls back to its
 * own wording but `""` is preserved and shown as a blank banner.
 */
export function fail(
	reply: FastifyReply,
	status: number,
	code: AuthErrorCode,
	message: string,
	detail: FailDetail = {}
): FastifyReply {
	return reply.status(status).send({
		error: {
			code,
			message,
			...(detail.challengeId !== undefined && { challenge_id: detail.challengeId }),
			...(detail.methods !== undefined && { methods: [...detail.methods] }),
			...(detail.email !== undefined && { email: detail.email }),
			...(detail.lockedUntil !== undefined && { locked_until: detail.lockedUntil }),
			...(detail.provider !== undefined && { provider: detail.provider }),
			...(detail.retryAfterSeconds !== undefined && {
				retry_after_seconds: detail.retryAfterSeconds
			})
		}
	});
}

/**
 * Make every unhandled path emit the envelope too.
 *
 * Without this, a schema validation failure or a typo'd URL answers with
 * Fastify's default `{statusCode, error: "Bad Request", message}` — where
 * `error` is a *string*. The client's reader requires an object, so it discards
 * the body and falls back to the status map: a 400 becomes `unknown` with the
 * adapter's generic fallback message, and a 404 becomes `unknown` too. Neither
 * is wrong exactly, but both throw away the explanation, and a route that
 * accidentally 500s would look identical to one that deliberately refused.
 */
export function installErrorHandlers(app: FastifyInstance): void {
	app.setErrorHandler((error: FastifyError, _request, reply) => {
		const status = typeof error.statusCode === 'number' ? error.statusCode : 500;

		// A schema rejection is the caller's fault and its message is useful; a
		// 500 is ours and its message may not be safe to hand out.
		const message =
			status >= 500 ? 'The reference server failed to handle that request.' : error.message;

		void fail(reply, status, 'unknown', message);
	});

	app.setNotFoundHandler((request, reply) => {
		void fail(reply, 404, 'unknown', `No route for ${request.method} ${request.url}.`);
	});
}
