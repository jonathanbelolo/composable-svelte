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
 * - `loginFailed`   — the last login attempt failed with no prior
 *                     authenticated session to restore; `error` says why.
 *                     (A failed re-login from an authenticated session
 *                     restores `authenticated` and surfaces the error
 *                     instead — see the `loginFailed` reducer arm.)
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
	/**
	 * Request epoch — a monotonic counter incremented by every initiator
	 * (`resolveSession` / `login` / `logout`). The initiator's effect closure
	 * captures the epoch it was started under and stamps it into its feedback
	 * action; the reducer applies feedback only when BOTH the status matches
	 * AND `action.epoch === state.epoch`. Status-equality alone cannot tell
	 * two in-flight requests of the same kind apart (e.g. resolve → logout →
	 * resolve, or slow login A → logout → login B), so without the epoch a
	 * superseded request's late feedback could clobber newer state.
	 */
	epoch: number;
}

/**
 * Actions the session reducer handles.
 *
 * Every effect-feedback action carries the `epoch` its initiator was started
 * under (see {@link SessionState.epoch}) — feedback from a superseded request
 * is discarded by the epoch guard.
 */
export type SessionAction =
	/** Resolve the current session against the backend (app startup / focus). */
	| { type: 'resolveSession' }
	/** Effect feedback: resolve finished. `null` session = anonymous. */
	| { type: 'sessionResolved'; session: SessionSnapshot | null; epoch: number }
	/** Effect feedback: resolve errored (network/server). Fail-closed to anonymous. */
	| { type: 'sessionResolveFailed'; error: string; epoch: number }
	/** Sign in as a seeded account (passwordless picker semantics). */
	| { type: 'login'; seededUserId: string }
	/** Effect feedback: login succeeded with the issued session. */
	| { type: 'loginSucceeded'; session: SessionSnapshot; epoch: number }
	/** Effect feedback: login failed. */
	| { type: 'loginFailed'; error: string; epoch: number }
	/** Sign out (server-side session invalidation). */
	| { type: 'logout' }
	/**
	 * Effect feedback: logout finished. The client goes anonymous even when
	 * the server call failed (`error` records the failure) — fail-closed.
	 */
	| { type: 'loggedOut'; error?: string; epoch: number };

/**
 * Injected auth I/O. Production apps use {@link createHttpSessionDeps};
 * tests inject mocks.
 */
export interface SessionDependencies {
	/**
	 * `POST /auth/login` with the seeded account id. Resolves with the
	 * issued session JSON; rejects on auth/network failure. The session
	 * cookie is set by the server (HttpOnly) — never surfaced here.
	 *
	 * NOTE: the seeded-login endpoint is compiled out of production backend
	 * builds — in production this call fails and sign-in happens through the
	 * backend's real identity flows. Dev/preview only.
	 */
	fetchLogin: (seededUserId: string) => Promise<SessionSnapshot>;
	/** `POST /auth/logout` — server-side session invalidation. */
	fetchLogout: () => Promise<void>;
	/**
	 * Resolve the current session. Resolves `null` when anonymous (no/
	 * expired session); rejects only on unexpected failures.
	 *
	 * Sessions carry a server-side TTL and the client receives NO expiry
	 * signal — an `authenticated` store can be stale. The consumer's hook is
	 * a 401 from any domain API call: dispatch `resolveSession` to re-sync.
	 */
	fetchSession: () => Promise<SessionSnapshot | null>;
}
