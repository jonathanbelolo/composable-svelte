<script lang="ts">
	/**
	 * The three remaining disclosure chevrons, each driven through its own real
	 * trigger. Rendered together so one suite covers the whole family — they were
	 * one unfinished migration, and splitting them is how Select got left behind
	 * when Combobox was converted.
	 */
	import Accordion from '../../src/lib/components/ui/accordion/Accordion.svelte';
	import AccordionItem from '../../src/lib/components/ui/accordion/AccordionItem.svelte';
	import AccordionTrigger from '../../src/lib/components/ui/accordion/AccordionTrigger.svelte';
	import AccordionContent from '../../src/lib/components/ui/accordion/AccordionContent.svelte';
	import Collapsible from '../../src/lib/components/ui/collapsible/Collapsible.svelte';
	import CollapsibleTrigger from '../../src/lib/components/ui/collapsible/CollapsibleTrigger.svelte';
	import CollapsibleContent from '../../src/lib/components/ui/collapsible/CollapsibleContent.svelte';
	import Select from '../../src/lib/components/ui/select/Select.svelte';
	import { createStore } from '../../src/lib/store.svelte.js';
	import { collapsibleReducer } from '../../src/lib/components/ui/collapsible/collapsible.reducer.js';
	import { createInitialCollapsibleState } from '../../src/lib/components/ui/collapsible/collapsible.types.js';

	const collapsibleStore = createStore({
		initialState: createInitialCollapsibleState(false),
		reducer: collapsibleReducer
	});
</script>

<section data-testid="accordion-host">
	<Accordion>
		{#snippet children()}
			<AccordionItem id="one">
				{#snippet children()}
					<AccordionTrigger>
						{#snippet children()}Section one{/snippet}
					</AccordionTrigger>
					<AccordionContent>
						{#snippet children()}Body of section one, long enough to have a height.{/snippet}
					</AccordionContent>
				{/snippet}
			</AccordionItem>
		{/snippet}
	</Accordion>
</section>

<section data-testid="collapsible-host">
	<Collapsible store={collapsibleStore}>
		{#snippet children()}
			<CollapsibleTrigger>
				{#snippet children()}Toggle{/snippet}
			</CollapsibleTrigger>
			<CollapsibleContent>
				{#snippet children()}Collapsible body, long enough to have a height.{/snippet}
			</CollapsibleContent>
		{/snippet}
	</Collapsible>
</section>

<section data-testid="select-host">
	<Select
		options={[
			{ value: 'a', label: 'Alpha' },
			{ value: 'b', label: 'Beta' }
		]}
	/>
</section>
