/**
 * Real HTTP implementation of {@link SessionDependencies}.
 *
 * Every request sends `credentials: 'include'` so the HttpOnly session
 * cookie rides along; the client never reads or writes the cookie itself.
 *
 * Endpoints (generated Composable Rust backend, WP-2c identity provider):
 * - `POST /auth/login`   — body `{ "user_id": "<seeded id>" }`, responds with
 *                          the session JSON (`SessionSnapshot`) + Set-Cookie.
 * - `POST /auth/logout`  — server-side session invalidation + cookie clear.
 * - `GET  /auth/session` — session resolve: session JSON when authenticated;
 *                          401 (or 204) when anonymous.
 */

import type { SessionSnapshot } from '../subject/types.js';
import type { SessionDependencies } from './types.js';

/**
 * Build HTTP session dependencies against `baseUrl` (default: same origin).
 */
export function createHttpSessionDeps(baseUrl: string = ''): SessionDependencies {
	// Normalize once at construction: strip trailing slash(es) so
	// `https://api.example.com/` + `/auth/login` never yields `//auth/login`.
	const base = baseUrl.replace(/\/+$/, '');
	const url = (path: string): string => `${base}${path}`;

	return {
		async fetchLogin(seededUserId: string): Promise<SessionSnapshot> {
			const response = await fetch(url('/auth/login'), {
				method: 'POST',
				credentials: 'include',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ user_id: seededUserId })
			});
			if (!response.ok) {
				throw new Error(`Login failed (${response.status})`);
			}
			return (await response.json()) as SessionSnapshot;
		},

		async fetchLogout(): Promise<void> {
			const response = await fetch(url('/auth/logout'), {
				method: 'POST',
				credentials: 'include'
			});
			if (!response.ok) {
				throw new Error(`Logout failed (${response.status})`);
			}
		},

		async fetchSession(): Promise<SessionSnapshot | null> {
			const response = await fetch(url('/auth/session'), {
				method: 'GET',
				credentials: 'include'
			});
			// 401 = no/expired session; 204 = explicit empty — both anonymous.
			if (response.status === 401 || response.status === 204) {
				return null;
			}
			if (!response.ok) {
				throw new Error(`Session resolve failed (${response.status})`);
			}
			return (await response.json()) as SessionSnapshot;
		}
	};
}
