<script lang="ts">
	import type { PresentationView } from '@composable-svelte/core/application';
	import MagicLinkRequestForm from '../../src/lib/components/MagicLinkRequestForm.svelte';
	import type { MagicLinkRequestAction, MagicLinkRequestState } from '../../src/lib/flows/index.js';

	let {
		initial
	}: { initial: PresentationView<MagicLinkRequestState, MagicLinkRequestAction> } = $props();
	let selected = $state(initial);
	export function show(view: PresentationView<MagicLinkRequestState, MagicLinkRequestAction>) { selected = view; }
</script>

<MagicLinkRequestForm mode="managed" flowStore={selected} />
