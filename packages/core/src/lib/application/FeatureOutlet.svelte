<script lang="ts" generics="S,A,C extends SlotCatalog">
 import type {Snippet} from 'svelte';
 import type {SlotCatalog} from '../navigation/managed-integration.js';import type {FeatureView} from './view-binding.js';import Body from './FeatureOutletBody.svelte';
 import type {RouteFallbackProps} from './renderer/route-render.js';
 /** `fallback` (candidate public) applies only to the managed route outlet of a staged application. */
 let {view,fallback}:{view:FeatureView<S,A,C>;fallback?:Snippet<[RouteFallbackProps]>|undefined}=$props();
</script>
{#key view}<Body {view} {fallback}/>{/key}
