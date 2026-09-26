<script lang="ts">
	import type { PresentationView } from '@composable-svelte/core/application';
	import MfaEnrolment from '../../src/lib/components/MfaEnrolment.svelte';
	import type { MfaEnrolmentAction, MfaEnrolmentState } from '../../src/lib/flows/index.js';

	let { initial }: { initial: PresentationView<MfaEnrolmentState, MfaEnrolmentAction> } = $props();
	let selected = $state(initial);
	export function show(view: PresentationView<MfaEnrolmentState, MfaEnrolmentAction>) { selected = view; }
</script>

<MfaEnrolment mode="managed" flowStore={selected} />
