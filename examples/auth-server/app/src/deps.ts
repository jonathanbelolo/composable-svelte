/**
 * The one place the app talks to a backend.
 *
 * `createHttpAuthDeps()` with **no argument** — same origin, which is what the
 * adapter documents as the only configuration where a `SameSite=Lax` session
 * cookie is actually carried. Vite proxies `/auth` to the fixture, so this is
 * the default path exercised unmodified rather than a special test wiring.
 */

import { createHttpAuthDeps } from '@composable-svelte/auth/http';
import { createSessionStore, createPendingOAuthStorage, createBrowserRedirect } from '@composable-svelte/auth';

export const deps = createHttpAuthDeps();

/** One session store for the whole app. Every flow hands its result here. */
export const session = createSessionStore(deps);

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
