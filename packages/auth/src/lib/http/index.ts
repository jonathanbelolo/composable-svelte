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

import { createHttpSessionDeps, decodeSessionSnapshot } from '../session/http.js';
import { authErrorFromResponse } from './errors.js';

import type {
	AuthDependencies,
	LoginCredentials,
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
