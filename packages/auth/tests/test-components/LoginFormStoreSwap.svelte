<script lang="ts">
	/**
	 * A consumer that replaces `flowStore` with a different store.
	 *
	 * Recreating the store is the obvious way to reset a form, so this is an
	 * ordinary thing to do — and it used to break silently, which is why it has
	 * a fixture rather than an inline mount.
	 */
	import LoginForm from '../../src/lib/components/LoginForm.svelte';
	import type { LoginAction, LoginState } from '../../src/lib/flows/login/types.js';
	import type { SessionAction } from '../../src/lib/session/types.js';

	type FlowStore = {
		readonly state: LoginState;
		dispatch(action: LoginAction): void;
		subscribe(listener: (state: LoginState) => void): () => void;
	};

	let {
		a,
		b,
		sessionStore
	}: { a: FlowStore; b: FlowStore; sessionStore: { dispatch(action: SessionAction): void } } =
		$props();

	let useB = $state(false);
	export function swap() {
		useB = true;
	}
	const current = $derived(useB ? b : a);
</script>

<LoginForm flowStore={current} {sessionStore} />
