/**
 * The auth I/O every flow runs over.
 *
 * `SessionDependencies` covers what the session machine itself needs — resolve,
 * seeded login, logout. The flows need more, and this is where it goes: each
 * member is injected, so a backend of any shape can satisfy it and a test can
 * replace it with `vi.fn()`.
 *
 * **Every member reports failure by rejecting with an {@link AuthError}.** That
 * is the contract that makes the union worth having: a dependency that throws a
 * bare `Error` still works — `toAuthError` wraps it as `unknown` — but nothing
 * downstream can then tell "wrong password" from "confirm your email first",
 * and an MFA challenge has nowhere to put its id. `createHttpAuthDeps` does the
 * classification for the Composable Rust shape; a hand-written adapter should
 * do the same.
 */

import type { AuthError } from './errors/types.js';
import type { SessionDependencies } from './session/types.js';
import type { SessionSnapshot } from './subject/types.js';

/** What a password sign-in submits. */
export interface LoginCredentials {
	email: string;
	password: string;
	/**
	 * Ask the backend for a longer-lived session.
	 *
	 * Advisory: session lifetime is the server's decision and this is a request,
	 * not an instruction. The client never sees the cookie and cannot verify the
	 * outcome.
	 */
	rememberMe?: boolean | undefined;
}

export interface AuthDependencies extends SessionDependencies {
	/**
	 * Sign in with an email and password.
	 *
	 * Resolves with the issued session. Rejects with an {@link AuthError} —
	 * `invalid_credentials` for a wrong password, `email_unverified` when the
	 * account exists but has never confirmed its address, `account_locked`,
	 * `rate_limited`, and `mfa_required` when the credentials were *correct* and
	 * a second factor is needed. That last one is not a failure in the user's
	 * terms; it carries the `challengeId` the MFA step submits against.
	 */
	login: (credentials: LoginCredentials, signal?: AbortSignal) => Promise<SessionSnapshot>;
}

/**
 * The wire shape an adapter may send to say precisely what went wrong.
 *
 * Optional in both directions. A backend that sends nothing still gets sensible
 * classification from the status code alone; one that sends this gets precision
 * — and it is the only way `mfa_required` can carry its challenge, since a
 * status code cannot.
 *
 * Shaped as `{ error: { … } }` rather than a bare object so a body can carry
 * other things beside the failure without colliding.
 */
export interface AuthErrorBody {
	error?:
		| {
				code?: string | undefined;
				message?: string | undefined;
				/** For `mfa_required`. */
				challenge_id?: string | undefined;
				/** For `mfa_required`. Unknown methods are dropped, not trusted. */
				methods?: string[] | undefined;
				/** For `email_unverified`. */
				email?: string | undefined;
				/** For `account_locked`, ISO 8601. */
				locked_until?: string | undefined;
				/** For `rate_limited`. The `Retry-After` header wins when both exist. */
				retry_after_seconds?: number | undefined;
		  }
		| undefined;
}

/** Re-exported so an adapter author has one import for the whole contract. */
export type { AuthError, SessionDependencies, SessionSnapshot };
