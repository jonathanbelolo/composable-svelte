<script lang="ts">
	/**
	 * Keeps a managed form mounted while its view changes or retires.
	 *
	 * `FeatureOutlet` unmounts content when its owner goes, so it never shows a
	 * form a retired view. A consumer that holds a captured view itself can, and
	 * this is that consumer: the test swaps the view and retires it in place.
	 */
	import type { PresentationView } from '@composable-svelte/core/application';

	import LoginForm from '../../src/lib/components/LoginForm.svelte';
	import MfaChallengeForm from '../../src/lib/components/MfaChallengeForm.svelte';
	import SignupForm from '../../src/lib/components/SignupForm.svelte';
	import type {
		LoginAction,
		LoginState,
		MfaChallengeAction,
		MfaChallengeState,
		SignupAction,
		SignupState
	} from '../../src/lib/flows/index.js';

	type Shown =
		| { kind: 'login'; view: PresentationView<LoginState, LoginAction> }
		| { kind: 'mfa'; view: PresentationView<MfaChallengeState, MfaChallengeAction> }
		| { kind: 'signup'; view: PresentationView<SignupState, SignupAction> };

	let { initial }: { initial: Shown } = $props();

	// svelte-ignore state_referenced_locally
	let shown = $state<Shown>(initial);
	export function show(next: Shown) {
		shown = next;
	}
</script>

{#if shown.kind === 'login'}
	<LoginForm mode="managed" flowStore={shown.view} />
{:else if shown.kind === 'mfa'}
	<MfaChallengeForm mode="managed" flowStore={shown.view} />
{:else}
	<SignupForm mode="managed" flowStore={shown.view} />
{/if}
