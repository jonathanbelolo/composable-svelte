<script lang="ts">
	/**
	 * A standalone consumer that hands `EmailVerification` a fresh `flowStore`
	 * wrapper whenever the flow's state changes, or whenever `refresh()` is called,
	 * and that can switch the wrapper to a different store with `use()`.
	 */
	import type { Store } from '@composable-svelte/core';
	import EmailVerification from '../../src/lib/components/EmailVerification.svelte';
	import type { EmailVerificationAction, EmailVerificationState } from '../../src/lib/flows/index.js';
	import type { SessionAction } from '../../src/lib/session/index.js';

	let {
		store,
		token
	}: { store: Store<EmailVerificationState, EmailVerificationAction>; token: string } = $props();

	// svelte-ignore state_referenced_locally
	let current = $state(store);
	export function use(next: Store<EmailVerificationState, EmailVerificationAction>) { current = next; }

	let version = $state(0);
	export function refresh() { version += 1; }

	const flowStore = $derived.by(() => {
		void version;
		const target = current;
		const state = target.state;
		return { state, dispatch: (action: EmailVerificationAction) => target.dispatch(action) };
	});
	const sessionStore = { dispatch: (_action: SessionAction) => {} };
</script>

<EmailVerification {flowStore} {sessionStore} {token} />
