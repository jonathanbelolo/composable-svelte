<!--
	AuthGuard — thin session-store consumer that gates its children on an
	authenticated subject. Zero async: all auth I/O lives in the session
	store's effects. On a resolved-anonymous session it invokes `onAnonymous`
	so the app can dispatch a redirect into its own navigation store (no
	router-guard primitive exists in core — the guard composes instead).

	⚠️ UX gating ONLY: hiding children client-side is a courtesy, not a
	security boundary. Enforcement lives in the backend's authorization
	gates — every request is re-checked server-side against the session.

	Rendering (stale-while-revalidate):
	- `authenticated`                     → children (`isRevalidating: false`)
	- `resolving` / `loggingOut` with a retained authenticated subject
	                                      → children (`isRevalidating: true`)
	  — a background re-resolve or an in-flight logout does NOT blank an
	  already-authenticated UI; the store settles it a moment later.
	- `anonymous` / `loginFailed`         → fallback (if provided)
	- anything else (no authenticated subject to keep showing)
	                                      → pending (if provided)
-->
<script lang="ts">
	import type { Store } from '@composable-svelte/core';
	import type { Snippet } from 'svelte';
	import type { SessionAction, SessionState } from '../session/types.js';

	let {
		store,
		onAnonymous,
		children,
		fallback,
		pending
	}: {
		store: Store<SessionState, SessionAction>;
		/**
		 * Invoked when the session settles on `anonymous` (NOT on
		 * `loginFailed` — a failed login attempt is the login surface's
		 * concern). Typical use: dispatch a redirect action to the app's
		 * navigation store.
		 */
		onAnonymous?: () => void;
		/**
		 * Rendered when authenticated — and KEPT rendered while a background
		 * resolve or logout is in flight with a retained authenticated
		 * subject (stale-while-revalidate). The snippet receives
		 * `{ isRevalidating }`: `true` during that window, so apps can show
		 * a subtle refresh indicator instead of unmounting the UI.
		 */
		children?: Snippet<[{ isRevalidating: boolean }]>;
		/** Rendered when anonymous or after a failed login. */
		fallback?: Snippet;
		/** Rendered while unresolved / logging in, or while resolving /
		 * logging out WITHOUT a retained authenticated subject. */
		pending?: Snippet;
	} = $props();

	const state = $derived(store.state);

	// Stale-while-revalidate: keep the authenticated UI up while a background
	// resolve (or the brief logout window) is in flight — pending is only for
	// the case where there is no authenticated subject to keep showing.
	const showChildren = $derived(
		state.status === 'authenticated' ||
			((state.status === 'resolving' || state.status === 'loggingOut') &&
				state.subject.kind === 'authenticated')
	);
	const isRevalidating = $derived(showChildren && state.status !== 'authenticated');

	$effect(() => {
		if (state.status === 'anonymous') {
			onAnonymous?.();
		}
	});
</script>

{#if showChildren}
	{@render children?.({ isRevalidating })}
{:else if state.status === 'anonymous' || state.status === 'loginFailed'}
	{@render fallback?.()}
{:else}
	{@render pending?.()}
{/if}
