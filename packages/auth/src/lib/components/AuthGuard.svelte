<!--
	AuthGuard — thin session-store consumer that gates its children on an
	authenticated subject. Zero async: all auth I/O lives in the session
	store's effects. On a resolved-anonymous session it invokes `onAnonymous`
	so the app can dispatch a redirect into its own navigation store (no
	router-guard primitive exists in core — the guard composes instead).

	Rendering:
	- `authenticated`                → children
	- `anonymous` / `loginFailed`    → fallback (if provided)
	- `unresolved` / `resolving` / `loggingIn` / `loggingOut` → pending (if provided)
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
		/** Rendered when authenticated. */
		children?: Snippet;
		/** Rendered when anonymous or after a failed login. */
		fallback?: Snippet;
		/** Rendered while unresolved / resolving / logging in or out. */
		pending?: Snippet;
	} = $props();

	const state = $derived(store.state);

	$effect(() => {
		if (state.status === 'anonymous') {
			onAnonymous?.();
		}
	});
</script>

{#if state.status === 'authenticated'}
	{@render children?.()}
{:else if state.status === 'anonymous' || state.status === 'loginFailed'}
	{@render fallback?.()}
{:else}
	{@render pending?.()}
{/if}
