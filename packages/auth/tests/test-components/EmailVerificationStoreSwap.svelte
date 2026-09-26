<script lang="ts">
	import type { PresentationView } from '@composable-svelte/core/application';
	import EmailVerification from '../../src/lib/components/EmailVerification.svelte';
	import type { EmailVerificationAction, EmailVerificationState } from '../../src/lib/flows/index.js';

	let {
		initial,
		token = null
	}: { initial: PresentationView<EmailVerificationState, EmailVerificationAction>; token?: string | null } = $props();
	let selected = $state(initial);
	export function show(view: PresentationView<EmailVerificationState, EmailVerificationAction>) { selected = view; }
</script>

<EmailVerification mode="managed" flowStore={selected} {token} />
