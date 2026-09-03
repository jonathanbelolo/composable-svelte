/**
 * The one place the app talks to a backend.
 *
 * `createHttpAuthDeps()` with **no argument** — same origin, which is what the
 * adapter documents as the only configuration where a `SameSite=Lax` session
 * cookie is actually carried. Vite proxies `/auth` to the fixture, so this is
 * the default path exercised unmodified rather than a special test wiring.
 */

import { createHttpAuthDeps } from '@composable-svelte/auth/http';
import {
	createSessionStore,
	createPendingOAuthStorage,
	createBrowserRedirect,
	createSessionRefreshStore,
	createUnauthorizedHandler
} from '@composable-svelte/auth';

export const deps = createHttpAuthDeps();

/** One session store for the whole app. Every flow hands its result here. */
export const session = createSessionStore(deps);

/**
 * Session lifetime, over the cookie the client cannot read.
 *
 * One store for the whole app, like the session it watches — a second would be
 * a second timer asking the same question.
 */
export const sessionRefresh = createSessionRefreshStore({
	refreshSession: deps.refreshSession
});

/**
 * The backstop for everything an expiry cannot anticipate.
 *
 * A session ends for reasons no advertised `expires_at` predicts — an
 * administrator revoked it, the absolute cap was reached mid-request. The only
 * signal is a 401 from something unrelated to auth, and this turns that into a
 * re-resolve. It coalesces, so a page firing several requests that all 401
 * dispatches one.
 */
export const unauthorized = createUnauthorizedHandler(session);

export const pendingOAuth = createPendingOAuthStorage();
export const redirect = createBrowserRedirect();

/** The providers this app offers. The package ships no list. */
export const PROVIDERS = [
	{ id: 'github', label: 'GitHub' },
	{ id: 'google', label: 'Google' }
] as const;

/** Where the browser is, as a path. The app is deliberately router-free. */
export function currentPath(): string {
	return window.location.pathname;
}

export function go(path: string): void {
	window.history.pushState({}, '', path);
	window.dispatchEvent(new PopStateEvent('popstate'));
}

export function queryParam(name: string): string | null {
	return new URL(window.location.href).searchParams.get(name);
}
