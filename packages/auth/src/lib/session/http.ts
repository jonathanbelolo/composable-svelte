/**
 * Real HTTP implementation of {@link SessionDependencies}.
 *
 * Every request sends `credentials: 'include'` so the HttpOnly session
 * cookie rides along; the client never reads or writes the cookie itself.
 *
 * Endpoints (generated Composable Rust backend, WP-2c identity provider):
 * - `POST /auth/login`   — body `{ "user_id": "<seeded id>" }`, responds with
 *                          the session JSON (`SessionSnapshot`) + Set-Cookie.
 *                          ⚠️ Compiled OUT of production backend builds —
 *                          dev/preview only.
 * - `POST /auth/logout`  — server-side session invalidation + cookie clear.
 * - `GET  /auth/session` — session resolve: session JSON when authenticated;
 *                          401 (or 204) when anonymous.
 *
 * 2xx payloads are runtime-validated before being treated as a session: a
 * malformed body (missing/non-string `subject_id`, non-array `roles`) throws
 * {@link MalformedSessionError} — a failure, never fail-open authenticated.
 */

import type { SessionSnapshot } from '../subject/types.js';
import type { SessionDependencies } from './types.js';

/**
 * A 2xx auth response carried a body that is not a valid session snapshot.
 * Treated exactly like a request failure by the session reducer (fail-closed
 * to anonymous on resolve; login surfaces the error).
 */
export class MalformedSessionError extends Error {
	constructor(detail: string) {
		super(`Malformed session payload: ${detail}`);
		this.name = 'MalformedSessionError';
	}
}

/**
 * Runtime-validate the wire payload before trusting it as a session.
 * `subject_id` MUST be a string; `roles`, when present, MUST be an array
 * (`subjectFromSession` defaults an absent `roles` to `[]`).
 */
function parseSessionSnapshot(payload: unknown): SessionSnapshot {
	if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
		throw new MalformedSessionError('body is not a JSON object');
	}
	const record = payload as Record<string, unknown>;
	if (typeof record['subject_id'] !== 'string') {
		throw new MalformedSessionError('subject_id is missing or not a string');
	}
	if (record['roles'] !== undefined && !Array.isArray(record['roles'])) {
		throw new MalformedSessionError('roles is present but not an array');
	}
	return payload as SessionSnapshot;
}

/**
 * Build HTTP session dependencies against `baseUrl` (default: same origin).
 *
 * ⚠️ Same-site only: the generated backend issues the session cookie with
 * `SameSite=Lax`, so a `baseUrl` on a DIFFERENT site (cross-site API domain)
 * will never carry the cookie — every resolve comes back anonymous. Use the
 * default same-origin `''`, or a same-site host (e.g. an API subdomain of
 * the app's registrable domain) fronted appropriately.
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
			return parseSessionSnapshot(await response.json());
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
			return parseSessionSnapshot(await response.json());
		}
	};
}
