<script lang="ts">
 import {FeatureViews,FeatureOutlet} from '../../src/lib/application/index.js';
 import type {Store} from '../../src/lib/types.js';
 import type {Root,Action} from './FeatureViewsModel.js';
 import {rootViews} from './FeatureViewsPlans.js';
 let {store}:{store:Store<Root,Action>}=$props();
</script>
<FeatureViews {store} definition={rootViews}>{#snippet children(views)}<FeatureOutlet view={views.workspace}/><FeatureOutlet view={views.rows}/>{/snippet}</FeatureViews>
