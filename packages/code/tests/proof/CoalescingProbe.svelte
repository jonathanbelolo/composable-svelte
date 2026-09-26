<script lang="ts">
	/**
	 * Delivery by a coalescing `$effect` instead of a synchronous subscription.
	 * Proves the queue makes coalescing harmless: one effect run can consume many
	 * entries, while a single "last command" reading sees only the final one.
	 */
	import { untrack } from 'svelte';
	import type { FeatureViewProps } from '@composable-svelte/core/application';
	import type { ProofEditorAction, ProofEditorState } from './editor-command-queue';
	import { effectTrace } from './proof-model';

	let { store, surface }: FeatureViewProps<ProofEditorState, ProofEditorAction> = $props();
	const owner = untrack(() => store);
	const label = untrack(() => store.state?.label ?? 'retired');

	// Plain `let`: read and written inside the effect, never rendered.
	let executedThrough = 0;

	$effect(() => {
		const state = owner.state;
		effectTrace.runs += 1;
		if (!state || state.label !== 'a') return;
		effectTrace.lastSeen.push(state.commands.entries.at(-1)?.id);
		for (const entry of state.commands.entries) {
			if (entry.id <= executedThrough) continue;
			executedThrough = entry.id;
			effectTrace.consumed.push(entry.id);
		}
	});
</script>

<section use:surface data-probe={label}></section>
