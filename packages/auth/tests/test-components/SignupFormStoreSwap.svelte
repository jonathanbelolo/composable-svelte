<script lang="ts">
	/** `LoginFormStoreSwap`'s twin: a standalone `SignupForm` whose `flowStore` is replaced. */
	import SignupForm from '../../src/lib/components/SignupForm.svelte';
	import type { SignupAction, SignupState } from '../../src/lib/flows/signup/types.js';
	import type { SessionAction } from '../../src/lib/session/types.js';

	type FlowStore = {
		readonly state: SignupState;
		dispatch(action: SignupAction): void;
		subscribe(listener: (state: SignupState) => void): () => void;
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

<SignupForm flowStore={current} {sessionStore} />
