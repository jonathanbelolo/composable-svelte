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
	- any in-flight status with a retained authenticated subject
	  (`resolving`, `loggingIn`, `loggingOut`)
	                                      → children (`isRevalidating: true`)
	  — a background re-resolve, an account switch or an in-flight logout does
	  NOT blank an already-authenticated UI; the store settles it a moment
	  later.
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
		/**
		 * Only `state` is read. Typing this as the full `Store<SessionState,
		 * SessionAction>` blocked passing a scoped store whose action type a
		 * parent has wrapped, for a `dispatch` this component never calls.
		 */
		store: { readonly state: SessionState };
		/**
		 * Invoked when the session settles on `anonymous` (NOT on
		 * `loginFailed` — a failed login attempt is the login surface's
		 * concern). Typical use: dispatch a redirect action to the app's
		 * navigation store.
		 */
		onAnonymous?: (() => void) | undefined;
		/**
		 * Rendered when authenticated — and KEPT rendered while a background
		 * resolve or logout is in flight with a retained authenticated
		 * subject (stale-while-revalidate). The snippet receives
		 * `{ isRevalidating }`: `true` during that window, so apps can show
		 * a subtle refresh indicator instead of unmounting the UI.
		 */
		children?: Snippet<[{ isRevalidating: boolean }]> | undefined;
		/** Rendered when anonymous or after a failed login. */
		/**
		 * Rendered when there is no session to show. Receives `error` — the
		 * reducer records one on a failed login and on a logout that did not
		 * reach the server, and this was the only place it could surface.
		 * Without it `SessionState.error` was unreachable through the package's
		 * own components.
		 */
		fallback?: Snippet<[{ error: string | null }]> | undefined;
		/** Rendered while unresolved / logging in, or while resolving /
		 * logging out WITHOUT a retained authenticated subject. */
		pending?: Snippet | undefined;
	} = $props();

	const state = $derived(store.state);

	// Stale-while-revalidate: keep the authenticated UI up whenever there is an
	// authenticated subject to keep showing. Pending is for the case where
	// there is not.
	//
	// Stated as the rule rather than as a list of statuses, which is what this
	// was and why it was wrong: the list held `resolving` and `loggingOut` and
	// omitted `loggingIn`, while `sessionReducer` builds the `loggingIn` state
	// with `{ ...state, ... }` and deliberately retains an authenticated
	// subject — `loginFailed` restores it when the old session is still valid.
	// So account switching from a signed-in state, the one flow the reducer
	// works hardest to keep alive, was the one that blanked the screen for the
	// whole attempt. Both this file's header and the README described the rule
	// correctly; only the code disagreed.
	//
	// `anonymous` and `loginFailed` are excluded by the reducer rather than by
	// a clause here: `loginFailed` is reachable only when the entering subject
	// was NOT authenticated (`reducer.ts:171-180`), and `anonymous` always
	// carries the anonymous subject.
	const showChildren = $derived(state.subject.kind === 'authenticated');
	const isRevalidating = $derived(showChildren && state.status !== 'authenticated');

	/**
	 * Narrowed to a boolean on purpose. `state` is `$derived(store.state)`,
	 * whose identity changes on every dispatch that produces a new state — so
	 * an effect reading `state.status` re-runs on all of them. Today that is
	 * harmless: no action in `sessionReducer` transitions anonymous ->
	 * anonymous, so the effect never re-runs while anonymous. That is a
	 * property of the reducer, not of this component, and it is pinned by
	 * `tests/auth-guard-anonymous.test.ts`.
	 *
	 * Depending on the boolean means this stays correct even if that property
	 * stops holding — an anonymous -> anonymous transition would leave the
	 * derived unchanged and `onAnonymous` would still fire once per entry.
	 */
	const isAnonymous = $derived(state.status === 'anonymous');

	$effect(() => {
		if (isAnonymous) {
			onAnonymous?.();
		}
	});
</script>

{#if showChildren}
	{@render children?.({ isRevalidating })}
{:else if state.status === 'anonymous' || state.status === 'loginFailed'}
	{@render fallback?.({ error: state.error })}
{:else}
	{@render pending?.()}
{/if}
