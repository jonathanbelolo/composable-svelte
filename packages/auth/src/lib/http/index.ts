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
import { send } from './transport.js';

import type {
	AuthDependencies,
	LoginCredentials,
	MfaEnrolmentResult,
	MfaEnrolmentStart,
	AccountSnapshot,
	MfaMethod,
	OAuthStart,
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
			const response = await send(url('/auth/password-login'), {
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
			const response = await send(url('/auth/signup'), {
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
			const response = await send(url('/auth/verify-email'), {
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
			const response = await send(url('/auth/request-password-reset'), {
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
			const response = await send(url('/auth/reset-password'), {
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
			const response = await send(url('/auth/mfa/verify'), {
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
			const response = await send(url('/auth/mfa/enrol'), {
				method: 'POST',
				credentials: 'include',
				...(signal !== undefined && { signal })
			});

			if (!response.ok) {
				throw await authErrorFromResponse(response, 'Could not start setting up authentication.');
			}

			return decodeEnrolmentStart(response);
		},

		async requestMagicLink(email: string, signal?: AbortSignal): Promise<void> {
			const response = await send(url('/auth/magic-link'), {
				method: 'POST',
				credentials: 'include',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ email }),
				...(signal !== undefined && { signal })
			});

			if (!response.ok) {
				throw await authErrorFromResponse(response, 'Could not send that link.');
			}
		},

		async signInWithMagicLink(token: string, signal?: AbortSignal): Promise<SessionSnapshot> {
			const response = await send(url('/auth/magic-link/signin'), {
				method: 'POST',
				credentials: 'include',
				headers: { 'content-type': 'application/json' },
				// POST, and the token in the body rather than the query — which is
				// the same reason the surface waits for a press. A link that signs
				// someone in on GET is a link a mail scanner can spend.
				body: JSON.stringify({ token }),
				...(signal !== undefined && { signal })
			});

			if (!response.ok) {
				throw await authErrorFromResponse(response, 'That sign-in link is no longer valid.');
			}

			return decodeSessionSnapshot(response);
		},

		async fetchAccount(signal?: AbortSignal): Promise<AccountSnapshot> {
			// The second read in this adapter, and the second non-POST. `GET`
			// because it is a read: the settings surface asks this on entry and
			// again after anything changes.
			const response = await send(url('/auth/account'), {
				method: 'GET',
				credentials: 'include',
				...(signal !== undefined && { signal })
			});

			if (!response.ok) {
				throw await authErrorFromResponse(response, 'Could not load your account.');
			}

			return decodeAccountSnapshot(response);
		},

		async changePassword(
			newPassword: string,
			signal?: AbortSignal
		): Promise<SessionSnapshot | null> {
			const response = await send(url('/auth/account/password'), {
				method: 'POST',
				credentials: 'include',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ password: newPassword }),
				...(signal !== undefined && { signal })
			});

			if (!response.ok) {
				throw await authErrorFromResponse(response, 'Could not change your password.');
			}

			// `204 No Content` is "changed, session untouched" — the same contract
			// `resetPassword` uses. Read the status rather than sniffing the body.
			if (response.status === 204) return null;

			return decodeSessionSnapshot(response);
		},

		async disableMfa(signal?: AbortSignal): Promise<void> {
			const response = await send(url('/auth/mfa/disable'), {
				method: 'POST',
				credentials: 'include',
				...(signal !== undefined && { signal })
			});

			if (!response.ok) {
				throw await authErrorFromResponse(response, 'Could not turn that off.');
			}
		},

		async regenerateRecoveryCodes(signal?: AbortSignal): Promise<MfaEnrolmentResult> {
			const response = await send(url('/auth/mfa/recovery-codes'), {
				method: 'POST',
				credentials: 'include',
				...(signal !== undefined && { signal })
			});

			if (!response.ok) {
				throw await authErrorFromResponse(response, 'Could not issue new codes.');
			}

			// The same decoder enrolment uses, which refuses an empty array: a
			// surface that showed none would tell the user they were finished when
			// they were not.
			return decodeEnrolmentResult(response);
		},

		async linkOAuthProvider(
			provider: string,
			code: string,
			state: string,
			signal?: AbortSignal
		): Promise<void> {
			const response = await send(url('/auth/oauth/link'), {
				method: 'POST',
				credentials: 'include',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ provider, code, state }),
				...(signal !== undefined && { signal })
			});

			if (!response.ok) {
				throw await authErrorFromResponse(response, 'Could not link that account.');
			}
			// Nothing is decoded, deliberately. A link that returned a session
			// would be a second sign-in nobody asked for, and reading one here
			// would invite a backend to send it.
		},

		async unlinkOAuthProvider(provider: string, signal?: AbortSignal): Promise<void> {
			const response = await send(url('/auth/oauth/unlink'), {
				method: 'POST',
				credentials: 'include',
				headers: { 'content-type': 'application/json' },
				// In the body, never the path — the rule `beginOAuth` states.
				body: JSON.stringify({ provider }),
				...(signal !== undefined && { signal })
			});

			if (!response.ok) {
				throw await authErrorFromResponse(response, 'Could not unlink that account.');
			}
		},

		async beginOAuth(provider: string, signal?: AbortSignal): Promise<OAuthStart> {
			const response = await send(url('/auth/oauth/begin'), {
				method: 'POST',
				credentials: 'include',
				headers: { 'content-type': 'application/json' },
				// In the body, like every other endpoint here. Never interpolated
				// into the path: a provider name is caller-supplied, and a path is
				// the one place this adapter would have to escape it.
				body: JSON.stringify({ provider }),
				...(signal !== undefined && { signal })
			});

			if (!response.ok) {
				throw await authErrorFromResponse(response, 'Could not start that sign-in.');
			}

			return decodeOAuthStart(response);
		},

		async completeOAuth(
			provider: string,
			code: string,
			state: string,
			signal?: AbortSignal
		): Promise<SessionSnapshot> {
			const response = await send(url('/auth/oauth/complete'), {
				method: 'POST',
				credentials: 'include',
				headers: { 'content-type': 'application/json' },
				// `state` is sent so the backend can bind it to the exchange. The
				// client checked it too, but only the backend's check counts —
				// whoever controls the callback URL controls the client's copy.
				body: JSON.stringify({ provider, code, state }),
				...(signal !== undefined && { signal })
			});

			if (!response.ok) {
				throw await authErrorFromResponse(response, 'Could not finish that sign-in.');
			}

			return decodeSessionSnapshot(response);
		},

		async confirmMfaEnrolment(
			enrolmentId: string,
			code: string,
			signal?: AbortSignal
		): Promise<MfaEnrolmentResult> {
			const response = await send(url('/auth/mfa/enrol/confirm'), {
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
			const response = await send(url('/auth/resend-verification'), {
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
/**
 * The authorize URL and nonce, validated.
 *
 * The protocol check is the one that matters and it does not belong further
 * down. This is the only value in the package that gets handed to
 * `location.assign`, so a compromised or merely misconfigured backend returning
 * `javascript:…` would be executing script in the app's origin by way of a
 * navigation. `decodeEnrolmentStart` refuses to guess for the same reason;
 * `createBrowserRedirect` checks again, because a hand-written adapter is not
 * obliged to come through here.
 */
/**
 * The account read model, validated.
 *
 * Refuses rather than guesses, like every decoder here. A settings surface that
 * defaulted `hasPassword` would offer to change a password that does not exist,
 * and one that defaulted `mfaEnabled` would tell someone their account is less
 * protected than it is — both are worse than an error.
 */
async function decodeAccountSnapshot(response: Response): Promise<AccountSnapshot> {
	const payload = await readJson(response);

	const email = payload['email'];
	const emailVerified = payload['email_verified'];
	const hasPassword = payload['has_password'];
	const mfaEnabled = payload['mfa_enabled'];
	const providers = payload['providers'];

	if (
		typeof email !== 'string' ||
		typeof emailVerified !== 'boolean' ||
		typeof hasPassword !== 'boolean' ||
		typeof mfaEnabled !== 'boolean'
	) {
		throw new MalformedSessionError(
			'account must carry email, email_verified, has_password and mfa_enabled'
		);
	}

	// Absent is an empty list — a backend with no OAuth configured has no reason
	// to send the key. A present-but-wrong value is refused.
	if (providers !== undefined && !Array.isArray(providers)) {
		throw new MalformedSessionError('account providers must be an array when present');
	}

	return {
		email,
		emailVerified,
		hasPassword,
		mfaEnabled,
		providers: ((providers ?? []) as unknown[]).filter(
			(entry): entry is string => typeof entry === 'string'
		)
	};
}

async function decodeOAuthStart(response: Response): Promise<OAuthStart> {
	const payload = await readJson(response);

	const authorizeUrl = payload['authorize_url'];
	const state = payload['state'];

	if (typeof authorizeUrl !== 'string' || typeof state !== 'string' || state === '') {
		throw new MalformedSessionError(
			'oauth start must carry authorize_url and a non-empty state as strings'
		);
	}

	let parsed: URL;
	try {
		parsed = new URL(authorizeUrl);
	} catch {
		throw new MalformedSessionError('oauth start authorize_url is not a URL');
	}
	if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
		throw new MalformedSessionError(
			`oauth start authorize_url must be http(s), not ${parsed.protocol}`
		);
	}

	return { authorizeUrl, state };
}

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
