/**
 * The Composable Rust adapter, extended to the full flow surface.
 *
 * `createHttpSessionDeps` covers the three session calls and is unchanged.
 * This adds the flow calls on top and, more importantly, **reads the response
 * body on failure** — which is what makes {@link AuthError} reachable rather
 * than merely representable.
 *
 * Nothing here is required. Every member is injected, so a backend of another
 * shape supplies its own object; this one exists so the common case is one
 * function call.
 */

import {
	createHttpSessionDeps,
	decodeSessionSnapshot,
	MalformedSessionError
} from '../session/http.js';
import { authErrorFromResponse } from './errors.js';

import type {
	AuthDependencies,
	LoginCredentials,
	MfaEnrolmentResult,
	MfaEnrolmentStart,
	MfaMethod,
	SignupCredentials,
	SignupOutcome
} from '../deps.js';
import type { SessionSnapshot } from '../subject/types.js';

/**
 * Build the full auth dependencies against `baseUrl` (default: same origin).
 *
 * ⚠️ Same-site only, for the reason `createHttpSessionDeps` documents: the
 * backend issues its session cookie with `SameSite=Lax`, so a `baseUrl` on a
 * different site never carries it and every resolve comes back anonymous.
 *
 * @example
 * ```ts
 * import { createSessionStore } from '@composable-svelte/auth';
 * import { createHttpAuthDeps } from '@composable-svelte/auth/http';
 *
 * const deps = createHttpAuthDeps();
 * const session = createSessionStore(deps);
 * ```
 */
export function createHttpAuthDeps(baseUrl: string = ''): AuthDependencies {
	const base = baseUrl.replace(/\/+$/, '');
	const url = (path: string): string => `${base}${path}`;

	return {
		...createHttpSessionDeps(baseUrl),

		async login(credentials: LoginCredentials, signal?: AbortSignal): Promise<SessionSnapshot> {
			const response = await fetch(url('/auth/password-login'), {
				method: 'POST',
				credentials: 'include',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					email: credentials.email,
					password: credentials.password,
					...(credentials.rememberMe !== undefined && { remember_me: credentials.rememberMe })
				}),
				...(signal !== undefined && { signal })
			});

			if (!response.ok) {
				// The whole point. The old adapter threw the status in a sentence and
				// discarded the body; this reads both, so `mfa_required` arrives with
				// its challenge and a rate limit arrives with its delay.
				throw await authErrorFromResponse(response, 'Sign-in failed.');
			}

			return decodeSessionSnapshot(response);
		},

		async signup(credentials: SignupCredentials, signal?: AbortSignal): Promise<SignupOutcome> {
			const response = await fetch(url('/auth/signup'), {
				method: 'POST',
				credentials: 'include',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ email: credentials.email, password: credentials.password }),
				...(signal !== undefined && { signal })
			});

			if (!response.ok) {
				throw await authErrorFromResponse(response, 'Could not create the account.');
			}

			// `202 Accepted` is the conventional "we have taken it, but it is not
			// finished" — here, an account that exists but cannot be used until the
			// address is confirmed. Read the status rather than sniffing the body:
			// a backend that answers 202 with an explanatory JSON object should not
			// have that mistaken for a malformed session.
			if (response.status === 202) {
				return { kind: 'verificationRequired', email: credentials.email };
			}

			// Anything else must be a session, and `decodeSessionSnapshot` refuses
			// to guess — a 200 carrying "check your email" throws
			// `MalformedSessionError` rather than fabricating a signed-in user.
			return { kind: 'session', session: await decodeSessionSnapshot(response) };
		},

		async verifyEmail(token: string, signal?: AbortSignal): Promise<SessionSnapshot | null> {
			const response = await fetch(url('/auth/verify-email'), {
				method: 'POST',
				credentials: 'include',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ token }),
				...(signal !== undefined && { signal })
			});

			if (!response.ok) {
				throw await authErrorFromResponse(response, 'That link is no longer valid.');
			}

			// `204 No Content` is "verified, but not signed in" — the address is
			// confirmed and the user still has to sign in. Read the status rather
			// than the body, for the reason `signup` documents.
			if (response.status === 204) return null;

			return decodeSessionSnapshot(response);
		},

		async requestPasswordReset(email: string, signal?: AbortSignal): Promise<void> {
			const response = await fetch(url('/auth/request-password-reset'), {
				method: 'POST',
				credentials: 'include',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ email }),
				...(signal !== undefined && { signal })
			});

			// A 404 here would be the account-existence oracle the whole flow is
			// shaped to avoid, so it is not special-cased into a success: a backend
			// that answers 404 is misconfigured and should be told so loudly rather
			// than have the client paper over it.
			if (!response.ok) {
				throw await authErrorFromResponse(response, 'Could not send a reset link.');
			}
		},

		async resetPassword(
			token: string,
			password: string,
			signal?: AbortSignal
		): Promise<SessionSnapshot | null> {
			const response = await fetch(url('/auth/reset-password'), {
				method: 'POST',
				credentials: 'include',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ token, password }),
				...(signal !== undefined && { signal })
			});

			if (!response.ok) {
				throw await authErrorFromResponse(response, 'That reset link is no longer valid.');
			}

			// `204` is "changed, now sign in" — read the status, not the body, for
			// the reason `verifyEmail` documents.
			if (response.status === 204) return null;

			return decodeSessionSnapshot(response);
		},

		async verifyMfaChallenge(
			challengeId: string,
			code: string,
			method: MfaMethod,
			signal?: AbortSignal
		): Promise<SessionSnapshot> {
			const response = await fetch(url('/auth/mfa/verify'), {
				method: 'POST',
				credentials: 'include',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ challenge_id: challengeId, code, method }),
				...(signal !== undefined && { signal })
			});

			if (!response.ok) {
				throw await authErrorFromResponse(response, 'That code was not accepted.');
			}

			// A session, always. There is no 204 branch here: a second factor that
			// verified without producing a session would leave the user having
			// proved who they are and still signed out.
			return decodeSessionSnapshot(response);
		},

		async beginMfaEnrolment(signal?: AbortSignal): Promise<MfaEnrolmentStart> {
			const response = await fetch(url('/auth/mfa/enrol'), {
				method: 'POST',
				credentials: 'include',
				...(signal !== undefined && { signal })
			});

			if (!response.ok) {
				throw await authErrorFromResponse(response, 'Could not start setting up authentication.');
			}

			return decodeEnrolmentStart(response);
		},

		async confirmMfaEnrolment(
			enrolmentId: string,
			code: string,
			signal?: AbortSignal
		): Promise<MfaEnrolmentResult> {
			const response = await fetch(url('/auth/mfa/enrol/confirm'), {
				method: 'POST',
				credentials: 'include',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ enrolment_id: enrolmentId, code }),
				...(signal !== undefined && { signal })
			});

			if (!response.ok) {
				throw await authErrorFromResponse(response, 'That code was not accepted.');
			}

			return decodeEnrolmentResult(response);
		},

		async resendVerification(email: string, signal?: AbortSignal): Promise<void> {
			const response = await fetch(url('/auth/resend-verification'), {
				method: 'POST',
				credentials: 'include',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ email }),
				...(signal !== undefined && { signal })
			});

			if (!response.ok) {
				throw await authErrorFromResponse(response, 'Could not send another email.');
			}
		}
	};
}

export { authErrorFromResponse } from './errors.js';

/**
 * Read an enrolment start, refusing to guess.
 *
 * Hand-written rather than Zod: this mirrors `decodeSessionSnapshot`, which is
 * hand-written for the same reason — the wire shape is the backend's contract,
 * not a form's, and a validation failure here is a misconfiguration to report
 * rather than a message to show a user.
 *
 * Both fields are required. A secret with no URI leaves an authenticator app
 * unusable; a URI with no secret leaves manual entry impossible. Half of this
 * is not a usable enrolment.
 */
async function decodeEnrolmentStart(response: Response): Promise<MfaEnrolmentStart> {
	const payload = await readJson(response);

	const enrolmentId = payload['enrolment_id'];
	const secret = payload['secret'];
	const otpauthUri = payload['otpauth_uri'];

	if (typeof enrolmentId !== 'string' || typeof secret !== 'string' || typeof otpauthUri !== 'string') {
		throw new MalformedSessionError(
			'enrolment must carry enrolment_id, secret and otpauth_uri as strings'
		);
	}

	return { enrolmentId, secret, otpauthUri };
}

/**
 * Read the recovery codes.
 *
 * An empty array is refused rather than passed through. Recovery codes are the
 * only way back in after a lost device, and a surface that showed none would
 * tell the user they were finished when they were not.
 */
async function decodeEnrolmentResult(response: Response): Promise<MfaEnrolmentResult> {
	const payload = await readJson(response);
	const codes = payload['recovery_codes'];

	if (!Array.isArray(codes) || codes.some((code) => typeof code !== 'string')) {
		throw new MalformedSessionError('recovery_codes must be an array of strings');
	}
	if (codes.length === 0) {
		throw new MalformedSessionError('recovery_codes was empty');
	}

	return { recoveryCodes: codes as readonly string[] };
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
	let payload: unknown;
	try {
		payload = await response.json();
	} catch {
		throw new MalformedSessionError('body is not JSON');
	}
	if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
		throw new MalformedSessionError('body is not a JSON object');
	}
	return payload as Record<string, unknown>;
}
