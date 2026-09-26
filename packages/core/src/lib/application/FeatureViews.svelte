<script lang="ts" generics="S, A, C extends SlotCatalog">
 import ViewScope from './ViewScope.svelte';
 import type {Snippet} from 'svelte';
 import type {SlotCatalog} from '../navigation/managed-integration.js';
 import type {ManagedProjection} from '../execution/store-access.js';
 import type {ViewDefinition} from './view-definition.js';
 import {bindViewDefinition,type ViewHandles} from './view-binding.js';
 let {store,definition,children}:{store:ManagedProjection<S,A>;definition:ViewDefinition<NoInfer<S>,NoInfer<A>,C>;children:Snippet<[ViewHandles<C>]>}=$props();
 const views=$derived(bindViewDefinition(store,definition));
</script>
{#key views}<ViewScope {views}>{@render children(views)}</ViewScope>{/key}
