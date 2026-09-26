<script lang="ts">
 import {onDestroy,onMount,type Snippet} from 'svelte';
 import {PlacementScope} from './renderer/placement.svelte.js';
 import {providePlacement} from './renderer/placement-context.js';
 import {optionalRegistry} from './renderer/context.js';
 import PlacementCheckpoint from './renderer/PlacementCheckpoint.svelte';
 let {views,children}:{views:object;children:Snippet}=$props();
 const registry=optionalRegistry();const scope=new PlacementScope(views,registry);providePlacement(scope);
 $effect.pre(()=>scope.acknowledge());
 $effect.pre(()=>()=>scope.dispose());
 onDestroy(()=>scope.dispose());onMount(()=>{if(!registry)scope.activate();});
</script>
{#if scope.live}{@render children()}<PlacementCheckpoint {scope}/>{/if}
