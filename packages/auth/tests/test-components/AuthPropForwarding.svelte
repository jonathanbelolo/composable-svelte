<script lang="ts">
	import AuthGuard from '../../src/lib/components/AuthGuard.svelte';
	import RoleGate from '../../src/lib/components/RoleGate.svelte';
	import type { SessionState } from '../../src/lib/session/types.js';
	import type { Snippet } from 'svelte';

	/**
	 * A consumer forwarding its own `$props()` straight through.
	 *
	 * Nothing renders this — it exists to be **typechecked**. Under
	 * `exactOptionalPropertyTypes` an optional prop read from `$props()` is
	 * `T | undefined`, which cannot land on a bare `T?`, so every optional prop
	 * these components declare has to say `| undefined` or they cannot be
	 * wrapped at all.
	 *
	 * **This file's own props are deliberately bare.** That is the entire
	 * mechanism: they simulate the naïve consumer whose `$props()` yields
	 * `T | undefined`. A sweep that "fixes" them here would neutralise the
	 * fixture and nothing would go red. Every `tests` directory is out of scope
	 * for exactly this reason.
	 */
	let {
		store,
		onAnonymous,
		children,
		fallback,
		pending,
		roles,
		gateChildren,
		gateFallback
	}: {
		store: { readonly state: SessionState };
		onAnonymous?: () => void;
		children?: Snippet<[{ isRevalidating: boolean }]>;
		fallback?: Snippet<[{ error: string | null }]>;
		pending?: Snippet;
		roles: readonly string[];
		// `RoleGate`'s snippets take no parameters, so they get their own props
		// rather than sharing `AuthGuard`'s — otherwise the arity mismatch is
		// what fails and the `| undefined` question never gets asked.
		gateChildren?: Snippet;
		gateFallback?: Snippet;
	} = $props();
</script>

<AuthGuard {store} {onAnonymous} {children} {fallback} {pending} />
<RoleGate {store} {roles} children={gateChildren} fallback={gateFallback} {pending} />
