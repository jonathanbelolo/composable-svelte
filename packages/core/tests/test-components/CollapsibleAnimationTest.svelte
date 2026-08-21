<script lang="ts">
	import Collapsible from '../../src/lib/components/ui/collapsible/Collapsible.svelte';
	import CollapsibleTrigger from '../../src/lib/components/ui/collapsible/CollapsibleTrigger.svelte';
	import CollapsibleContent from '../../src/lib/components/ui/collapsible/CollapsibleContent.svelte';
	import { createStore } from '../../src/lib/store.svelte.js';
	import { collapsibleReducer } from '../../src/lib/components/ui/collapsible/collapsible.reducer.js';
	import { createInitialCollapsibleState } from '../../src/lib/components/ui/collapsible/collapsible.types.js';

	const store = createStore({
		initialState: createInitialCollapsibleState(false),
		reducer: collapsibleReducer
	});
</script>

<Collapsible {store}>
	{#snippet children()}
		<CollapsibleTrigger>
			{#snippet children()}Toggle{/snippet}
		</CollapsibleTrigger>
		<CollapsibleContent>
			{#snippet children()}
				<p style="height: 80px; margin: 0;">Tall enough to measure.</p>
			{/snippet}
		</CollapsibleContent>
	{/snippet}
</Collapsible>
