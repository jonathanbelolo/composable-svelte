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
import { authErrorFromResponse } from '../http/errors.js';
import { send } from '../http/transport.js';

/**
 * A 2xx auth response carried a body that is not a valid session snapshot.
 * Treated exactly like a request failure by the session reducer (fail-closed
 * to anonymous on resolve; login surfaces the error).
 *
 * **Also an `AuthError`.** `isAuthError` is structural — a `code` string and a
 * `message` string — so carrying `code` makes this satisfy the contract
 * `AuthDependencies` states for every member, while `instanceof` keeps working
 * for the consumers that branch on it. `unknown` rather than an arm of its own
 * because that is what it is: a backend that answered 200 with something else
 * is misconfigured, and there is nothing a user can do about it.
 */
export class MalformedSessionError extends Error {
	readonly code = 'unknown' as const;

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
export async function decodeSessionSnapshot(response: Response): Promise<SessionSnapshot> {
	// The decode belongs inside the guarantee, not before it. `await
	// response.json()` used to sit at the call sites, so a 200 carrying a
	// non-JSON body — an HTML proxy error page, an SPA index.html fallback:
	// the canonical reason to validate a 2xx at all — threw a raw `SyntaxError`
	// rather than the documented `MalformedSessionError`. A consumer branching
	// on `instanceof MalformedSessionError`, which is why it is exported,
	// silently missed exactly that case.
	let payload: unknown;
	try {
		payload = await response.json();
	} catch {
		throw new MalformedSessionError('body is not JSON');
	}
	return parseSessionSnapshot(payload);
}

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
	// Advisory, so absent is fine — a backend that says nothing about expiry is
	// not malformed. A present-but-wrong value is refused, like `roles`.
	if (record['expires_at'] !== undefined && typeof record['expires_at'] !== 'string') {
		throw new MalformedSessionError('expires_at is present but not a string');
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
		async fetchLogin(seededUserId: string, signal?: AbortSignal): Promise<SessionSnapshot> {
			const response = await send(url('/auth/login'), {
				method: 'POST',
				credentials: 'include',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ user_id: seededUserId }),
				...(signal !== undefined && { signal })
			});
			if (!response.ok) {
				// Through the same reader every other endpoint uses. These three
				// used to throw `new Error('Login failed (401)')`, which is the exact
				// defect `http/errors.ts` was written to fix — a status in a sentence,
				// with the body discarded — and the fix reached the flow surface and
				// stopped there. A 401 here is `invalid_credentials`, which is the
				// whole point of the union.
				throw await authErrorFromResponse(response, 'Sign-in failed.');
			}
			return decodeSessionSnapshot(response);
		},

		async fetchLogout(signal?: AbortSignal): Promise<void> {
			const response = await send(url('/auth/logout'), {
				method: 'POST',
				credentials: 'include',
				...(signal !== undefined && { signal })
			});
			if (!response.ok) {
				throw await authErrorFromResponse(response, 'Sign-out failed.');
			}
		},

		async fetchSession(signal?: AbortSignal): Promise<SessionSnapshot | null> {
			const response = await send(url('/auth/session'), {
				method: 'GET',
				credentials: 'include',
				...(signal !== undefined && { signal })
			});
			// 401 = no/expired session; 204 = explicit empty — both anonymous.
			if (response.status === 401 || response.status === 204) {
				return null;
			}
			if (!response.ok) {
				throw await authErrorFromResponse(response, 'Could not check your session.');
			}
			return decodeSessionSnapshot(response);
		}
	};
}
