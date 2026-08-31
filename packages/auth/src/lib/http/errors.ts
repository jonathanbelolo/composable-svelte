/**
 * Turning an HTTP failure into an {@link AuthError}.
 *
 * The adapter this replaces threw `new Error(\`Login failed (${status})\`)` and
 * dropped the response body on the floor. That is why every failure used to
 * look the same, and why the backend could not have told you more even if it
 * wanted to.
 *
 * Two layers, so any backend works:
 *
 * 1. **The status code**, which every backend already sends. This alone
 *    distinguishes a wrong password from a lockout from a rate limit.
 * 2. **An optional `{ error: { code, … } }` body**, which overrides and enriches
 *    it. This is the only way `mfa_required` can carry its `challengeId` — no
 *    status code can.
 *
 * A backend that sends nothing gets layer one and degrades gracefully. One that
 * sends a body it did not have to send gets exactly what it asked for.
 */

import { parseRetryAfter } from '@composable-svelte/core/api';

import type { AuthError, AuthErrorCode } from '../errors/types.js';
import type { AuthErrorBody } from '../deps.js';

/** Codes an adapter may name in a body. Anything else is ignored, not trusted. */
/**
 * Every code a body is allowed to name.
 *
 * Keyed off a `Record<AuthErrorCode, true>` rather than an array with
 * `satisfies AuthErrorCode[]`. That form checks the values are assignable but
 * not that they are exhaustive, so a ninth arm could join the union and simply
 * never be accepted from a backend — a silent hole. A missing key here is a
 * compile error.
 */
const KNOWN_CODES = new Set<string>(
	Object.keys({
		invalid_credentials: true,
		mfa_required: true,
		email_unverified: true,
		email_taken: true,
		account_locked: true,
		rate_limited: true,
		token_expired: true,
		network: true,
		unknown: true
	} satisfies Record<AuthErrorCode, true>)
);

const KNOWN_METHODS = new Set(['totp', 'recovery_code']);

/**
 * What the status code alone says.
 *
 * `401` is `invalid_credentials` rather than `unknown` because on a login
 * endpoint that is what it means; a 401 on a *session* endpoint means anonymous
 * and is handled before this is ever called.
 */
function fromStatus(status: number): AuthErrorCode {
	switch (status) {
		case 401:
			return 'invalid_credentials';
		case 403:
			// Ambiguous on purpose: could be an unverified email or a lockout, and
			// only a body can say which. `unknown` claims nothing.
			return 'unknown';
		case 409:
			// The signup case: an account already exists for this address.
			return 'email_taken';
		case 410:
			return 'token_expired';
		case 423:
			return 'account_locked';
		case 429:
			return 'rate_limited';
		default:
			return 'unknown';
	}
}

/** Headers as a plain record, which is what core's `Retry-After` parser reads. */
function headerRecord(headers: Headers): Record<string, string> {
	const record: Record<string, string> = {};
	headers.forEach((value, key) => {
		record[key] = value;
	});
	return record;
}

/**
 * Read the body without letting it break the failure path.
 *
 * A failing response very often is not JSON at all — an HTML error page from a
 * proxy, an empty body, a plain-text stack trace. None of that should turn a
 * clean `invalid_credentials` into a parse exception, so anything unreadable is
 * simply absent.
 */
async function readErrorBody(response: Response): Promise<AuthErrorBody['error']> {
	try {
		const parsed: unknown = await response.json();
		if (typeof parsed !== 'object' || parsed === null) return undefined;

		const body = parsed as AuthErrorBody;
		return typeof body.error === 'object' && body.error !== null ? body.error : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Build the error for a failed auth response.
 *
 * `fallbackMessage` is used only when neither the body nor anything else
 * supplied wording — a user should never be shown an empty string.
 */
export async function authErrorFromResponse(
	response: Response,
	fallbackMessage: string
): Promise<AuthError> {
	const body = await readErrorBody(response);
	const headers = headerRecord(response.headers);

	const code: AuthErrorCode =
		body?.code !== undefined && KNOWN_CODES.has(body.code)
			? (body.code as AuthErrorCode)
			: fromStatus(response.status);

	const message = body?.message ?? fallbackMessage;

	switch (code) {
		case 'mfa_required': {
			// Without a challenge id there is nothing to submit a code against, so
			// this is not a usable MFA challenge however the backend labelled it.
			if (body?.challenge_id === undefined) {
				return { code: 'unknown', message, status: response.status };
			}

			const methods = (body.methods ?? ['totp']).filter((m) => KNOWN_METHODS.has(m));

			return {
				code: 'mfa_required',
				message,
				challengeId: body.challenge_id,
				// An empty list would leave a UI with no branch to offer. TOTP is the
				// assumption a backend that named no method is most likely making.
				methods: methods.length > 0 ? (methods as ('totp' | 'recovery_code')[]) : ['totp']
			};
		}

		case 'rate_limited': {
			// `Retry-After` is the standard and wins; core's parser handles both the
			// delay-seconds and HTTP-date forms and answers in milliseconds.
			const headerMs = parseRetryAfter(headers);
			const seconds =
				headerMs !== null ? Math.ceil(headerMs / 1000) : body?.retry_after_seconds;

			return {
				code: 'rate_limited',
				message,
				...(seconds !== undefined && { retryAfterSeconds: seconds })
			};
		}

		case 'account_locked':
			return {
				code: 'account_locked',
				message,
				...(body?.locked_until !== undefined && { until: body.locked_until })
			};

		case 'email_unverified':
			return {
				code: 'email_unverified',
				message,
				...(body?.email !== undefined && { email: body.email })
			};

		case 'email_taken':
			return {
				code: 'email_taken',
				message,
				...(body?.email !== undefined && { email: body.email })
			};

		case 'unknown':
			return { code: 'unknown', message, status: response.status };

		default:
			return { code, message };
	}
}
