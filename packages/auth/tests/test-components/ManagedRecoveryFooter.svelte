<script lang="ts">
	import type { PresentationView } from '@composable-svelte/core/application';
	import ForgotPasswordForm from '../../src/lib/components/ForgotPasswordForm.svelte';
	import type { ForgotPasswordAction, ForgotPasswordState } from '../../src/lib/flows/index.js';

	let { view, custom = false }: { view: PresentationView<ForgotPasswordState, ForgotPasswordAction>; custom?: boolean } = $props();
</script>

{#snippet customFooter()}
	<button type="button" data-testid="custom-recovery-footer" onclick={() => view.dispatch({ type: 'signInRequested' })}>Custom return</button>
{/snippet}

{#if custom}
	<ForgotPasswordForm mode="managed" flowStore={view} signInLabel="Return to account" footer={customFooter} />
{:else}
	<ForgotPasswordForm mode="managed" flowStore={view} signInLabel="Return to account" />
{/if}
