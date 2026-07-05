/**
 * Session store types.
 *
 * The session store is the ONLY place auth async lives on the client. All
 * I/O runs inside `Effect.run` over the injected {@link SessionDependencies}
 * — components never own async. The store also never reads cookies: the
 * session cookie is HttpOnly and stays server-side; the client learns who it
 * is by resolving the session endpoint.
 */

import type { SessionSnapshot, Subject } from '../subject/types.js';

/**
 * Session lifecycle status.
 *
 * - `unresolved`    — nothing known yet (initial; app should dispatch
 *                     `resolveSession` at startup)
 * - `resolving`     — session resolve in flight
 * - `authenticated` — a valid session exists; `subject` is authenticated
 * - `anonymous`     — no valid session (resolved-anonymous, resolve failure
 *                     fail-closed, or post-logout)
 * - `loggingIn`     — login request in flight
 * - `loginFailed`   — the last login attempt failed; `error` says why
 * - `loggingOut`    — logout request in flight
 */
export type SessionStatus =
	| 'unresolved'
	| 'resolving'
	| 'authenticated'
	| 'anonymous'
	| 'loggingIn'
	| 'loginFailed'
	| 'loggingOut';

/** State of the session store. */
export interface SessionState {
	status: SessionStatus;
	/** Anonymous until a session resolves or a login succeeds. */
	subject: Subject;
	/** Last auth error message, or `null`. */
	error: string | null;
}

/** Actions the session reducer handles. */
export type SessionAction =
	/** Resolve the current session against the backend (app startup / focus). */
	| { type: 'resolveSession' }
	/** Effect feedback: resolve finished. `null` session = anonymous. */
	| { type: 'sessionResolved'; session: SessionSnapshot | null }
	/** Effect feedback: resolve errored (network/server). Fail-closed to anonymous. */
	| { type: 'sessionResolveFailed'; error: string }
	/** Sign in as a seeded account (passwordless picker semantics). */
	| { type: 'login'; seededUserId: string }
	/** Effect feedback: login succeeded with the issued session. */
	| { type: 'loginSucceeded'; session: SessionSnapshot }
	/** Effect feedback: login failed. */
	| { type: 'loginFailed'; error: string }
	/** Sign out (server-side session invalidation). */
	| { type: 'logout' }
	/**
	 * Effect feedback: logout finished. The client goes anonymous even when
	 * the server call failed (`error` records the failure) — fail-closed.
	 */
	| { type: 'loggedOut'; error?: string };

/**
 * Injected auth I/O. Production apps use {@link createHttpSessionDeps};
 * tests inject mocks.
 */
export interface SessionDependencies {
	/**
	 * `POST /auth/login` with the seeded account id. Resolves with the
	 * issued session JSON; rejects on auth/network failure. The session
	 * cookie is set by the server (HttpOnly) — never surfaced here.
	 */
	fetchLogin: (seededUserId: string) => Promise<SessionSnapshot>;
	/** `POST /auth/logout` — server-side session invalidation. */
	fetchLogout: () => Promise<void>;
	/**
	 * Resolve the current session. Resolves `null` when anonymous (no/
	 * expired session); rejects only on unexpected failures.
	 */
	fetchSession: () => Promise<SessionSnapshot | null>;
}
