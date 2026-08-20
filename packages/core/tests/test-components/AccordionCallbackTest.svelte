<script lang="ts">
	import Accordion from '../../src/lib/components/ui/accordion/Accordion.svelte';
	import AccordionItem from '../../src/lib/components/ui/accordion/AccordionItem.svelte';
	import AccordionTrigger from '../../src/lib/components/ui/accordion/AccordionTrigger.svelte';

	let { onExpand }: { onExpand: (id: string) => void } = $props();
</script>

<!--
	Composition mode: `items` is deliberately not passed. AccordionItem never
	dispatches `itemRegistered`, so `state.items` stays empty and the reducer's
	`items.length > 0` guard is skipped — and the items-sync effect stays quiet.
-->
<Accordion {onExpand}>
	<AccordionItem id="one">
		<AccordionTrigger>One</AccordionTrigger>
	</AccordionItem>
</Accordion>
