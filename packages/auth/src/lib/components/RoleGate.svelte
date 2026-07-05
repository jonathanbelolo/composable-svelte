<!--
	RoleGate — renders children only when the session's subject holds at
	least one of the required roles (read from the subject's
	`attributes["roles"]`, the backend convention). Thin store consumer;
	zero async. An empty `roles` array means "no restriction".

	⚠️ UX gating ONLY: hiding children client-side is a courtesy, not a
	security boundary. Enforcement lives in the backend's authorization
	gates — every request is re-checked server-side against the session.
-->
<script lang="ts">
	import type { Store } from '@composable-svelte/core';
	import type { Snippet } from 'svelte';
	import { hasAnyRole } from '../subject/helpers.js';
	import type { SessionAction, SessionState } from '../session/types.js';

	let {
		store,
		roles,
		children,
		fallback
	}: {
		store: Store<SessionState, SessionAction>;
		/** Required roles — the subject must hold at least one. */
		roles: readonly string[];
		/** Rendered when the subject holds a required role. */
		children?: Snippet;
		/** Rendered otherwise. */
		fallback?: Snippet;
	} = $props();

	const allowed = $derived(hasAnyRole(store.state.subject, roles));
</script>

{#if allowed}
	{@render children?.()}
{:else}
	{@render fallback?.()}
{/if}
