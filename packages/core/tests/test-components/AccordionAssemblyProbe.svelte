<script lang="ts">
 import {getAccordionContext} from '../../src/lib/components/ui/accordion/Accordion.svelte';
 import type {Store} from '../../src/lib/types.js';
 import type {AccordionState,AccordionAction} from '../../src/lib/components/ui/accordion/accordion.types.js';
 let {ready}: {ready:(store:Store<AccordionState,AccordionAction>)=>void}=$props();
 ready(getAccordionContext());
</script>
