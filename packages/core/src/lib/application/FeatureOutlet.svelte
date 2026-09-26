<script lang="ts" generics="S,A,C extends SlotCatalog">
 import type {SlotCatalog} from '../navigation/managed-integration.js';import type {FeatureView} from './view-binding.js';import Body from './FeatureOutletBody.svelte';
 let {view}:{view:FeatureView<S,A,C>}=$props();
</script>
{#key view}<Body {view}/>{/key}
