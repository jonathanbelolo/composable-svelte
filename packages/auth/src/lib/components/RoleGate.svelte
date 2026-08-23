<!--
	RoleGate — renders children only when the session's subject holds at
	least one of the required roles (read from the subject's
	`attributes["roles"]`, the backend convention). Thin store consumer;
	zero async. An empty `roles` array means "no restriction".

	Until the session resolves there is no answer yet, so neither branch is
	taken: `pending` renders if given, otherwise nothing. "Not authorized" is
	a claim about a resolved session, and this used to make it about the
	initial state as well — a standalone gate denied before the session had
	been fetched at all, and only nesting inside `AuthGuard` hid it.

	⚠️ UX gating ONLY: hiding children client-side is a courtesy, not a
	security boundary. Enforcement lives in the backend's authorization
	gates — every request is re-checked server-side against the session.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { hasAnyRole } from '../subject/helpers.js';
	import type { SessionState } from '../session/types.js';

	let {
		store,
		roles,
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
		/** Required roles — the subject must hold at least one. */
		roles: readonly string[];
		/** Rendered when the subject holds a required role. */
		children?: Snippet;
		/** Rendered when the resolved subject does not hold one. */
		fallback?: Snippet;
		/** Rendered while the session has not been resolved yet. */
		pending?: Snippet;
	} = $props();

	// No answer yet: the subject is `anonymousSubject` in `unresolved` and in a
	// cold `resolving`, which is indistinguishable from a genuine anonymous
	// session by subject alone.
	const unknown = $derived(
		(store.state.status === 'unresolved' || store.state.status === 'resolving') &&
			store.state.subject.kind !== 'authenticated'
	);
	const allowed = $derived(hasAnyRole(store.state.subject, roles));
</script>

{#if unknown}
	{@render pending?.()}
{:else if allowed}
	{@render children?.()}
{:else}
	{@render fallback?.()}
{/if}
