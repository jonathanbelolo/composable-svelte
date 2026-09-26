<script lang="ts">
 import {FeatureViews,FeatureOutlet} from '../../src/lib/application/index.js';import type {Store} from '../../src/lib/types.js';import type {Root,Action} from './FeatureViewsModel.js';import {rootViews} from './FeatureViewsPlans.js';let {store,missing=false}:{store:Store<Root,Action>;missing?:boolean|undefined}=$props();let show=$state(true);
</script>
<button data-hide onclick={()=>show=false}>Hide row outlet</button><FeatureViews {store} definition={rootViews}>{#snippet children(views)}<FeatureOutlet view={views.workspace}/>{#if show&&!missing}<FeatureOutlet view={views.rows}/>{/if}{/snippet}</FeatureViews>
