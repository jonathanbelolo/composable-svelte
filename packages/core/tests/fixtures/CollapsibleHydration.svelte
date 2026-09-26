<script lang="ts">
import { onDestroy } from 'svelte';
import { createStore } from '../../src/lib/store.svelte.js';
import { collapsibleReducer } from '../../src/lib/components/ui/collapsible/collapsible.reducer.js';
import Collapsible from '../../src/lib/components/ui/collapsible/Collapsible.svelte';
import CollapsibleTrigger from '../../src/lib/components/ui/collapsible/CollapsibleTrigger.svelte';
import CollapsibleContent from '../../src/lib/components/ui/collapsible/CollapsibleContent.svelte';
const stores = [0, 1].map(() => createStore({ initialState: {isExpanded:true,disabled:false}, reducer:collapsibleReducer }));
onDestroy(() => stores.forEach(store => store.destroy()));
</script>
{#each stores as store, index}
<Collapsible {store}>
<CollapsibleTrigger>Section {index + 1}</CollapsibleTrigger>
<CollapsibleContent>Content {index + 1}</CollapsibleContent>
</Collapsible>
{/each}
