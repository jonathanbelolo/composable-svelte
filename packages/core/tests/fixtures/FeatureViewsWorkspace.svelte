<script lang="ts">
 import {FeatureOutlet,type FeatureViewPropsOf} from '../../src/lib/application/index.js';
 import {untrack} from 'svelte';
 import {workspaceComposition,retainedNestedViews} from './FeatureViewsModel.js';
 let {views,surface}:FeatureViewPropsOf<typeof workspaceComposition>=$props();
 retainedNestedViews.push(untrack(()=>views.editor));
</script>
<div use:surface data-workspace><FeatureOutlet view={views.editor}/></div>
