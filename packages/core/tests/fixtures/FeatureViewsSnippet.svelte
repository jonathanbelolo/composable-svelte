<script lang="ts">
 import {FeatureViews,FeatureOutlet,defineViews,type FeatureViewProps} from '../../src/lib/application/index.js';
 import type {Store} from '../../src/lib/types.js';
 import {composition,type Root,type Action,type Leaf,type LA} from './FeatureViewsModel.js';
 let {store}:{store:Store<Root,Action>}=$props();
 const plan=defineViews(composition,{workspace:{headless:true},worker:{headless:true},rows:{content:row}});
</script>
{#snippet row({store}:FeatureViewProps<Leaf,LA>)}<button data-snippet={store.state?.name} onclick={()=>store.dispatch({type:'increment'})}>{store.state?.count}</button>{/snippet}
<FeatureViews {store} definition={plan}>{#snippet children(views)}<FeatureOutlet view={views.rows}/>{/snippet}</FeatureViews>
