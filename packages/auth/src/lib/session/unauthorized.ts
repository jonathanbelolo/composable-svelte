/**
 * Re-resolve the session when a domain call comes back 401.
 *
 * The backstop this package has always described and never shipped. A session
 * ends server-side for reasons no expiry can anticipate — an administrator
 * revoked it, a deploy flushed the store, the absolute cap was reached — and
 * the only signal a client gets is a 401 from something unrelated to auth.
 *
 * A paragraph in a README is not an API, and the coalescing below is why: the
 * naive version is one line at every call site, and a page firing twelve
 * parallel requests that all 401 would dispatch twelve resolves. The session
 * reducer's epoch guard makes that *safe*, but not sane.
 */

import type { Interceptor } from '@composable-svelte/core/api';

import type { SessionAction, SessionState } from './types.js';

/** The narrow slice of a session store this needs. */
export interface SessionStoreSlice {
	readonly state: SessionState;
	dispatch(action: SessionAction): void;
}

export interface UnauthorizedHandler {
	/**
	 * Report the status of a completed request.
	 *
	 * Anything other than 401 is ignored, so a caller can hand it every status
	 * rather than deciding which ones matter.
	 */
	observe(status: number): void;
	/**
	 * The same thing as an `Interceptor`, for core's API client.
	 *
	 * Rethrows whatever it was given — this observes, it never handles.
	 */
	readonly interceptor: Interceptor;
}

/**
 * Wire a 401 to a session re-resolve.
 *
 * **Status-based rather than `Response`-based**, so it works behind any
 * transport: core's API client, a bare `fetch`, a generated SDK.
 *
 * @example
 * ```typescript
 * import { createSessionStore, createUnauthorizedHandler } from '@composable-svelte/auth';
 * import { createHttpAuthDeps } from '@composable-svelte/auth/http';
 *
 * const session = createSessionStore(createHttpAuthDeps());
 * const unauthorized = createUnauthorizedHandler(session);
 *
 * // With a bare fetch:
 * const response = await fetch('/api/things');
 * unauthorized.observe(response.status);
 *
 * // Or with core's API client:
 * // createAPIClient({ baseURL: '/api', interceptors: [unauthorized.interceptor] })
 * ```
 */
export function createUnauthorizedHandler(store: SessionStoreSlice): UnauthorizedHandler {
	const observe = (status: number): void => {
		if (status !== 401) return;
		// Coalesce. Twelve parallel requests that all 401 are one fact about the
		// session, not twelve, and a resolve is already in flight for the first.
		if (store.state.status === 'resolving') return;
		store.dispatch({ type: 'resolveSession' });
	};

	return {
		observe,
		interceptor: {
			onError(error: unknown): never {
				const status = (error as { status?: unknown } | null)?.status;
				if (typeof status === 'number') observe(status);
				// Observing is not handling. The caller still sees its own failure.
				throw error;
			}
		}
	};
}
