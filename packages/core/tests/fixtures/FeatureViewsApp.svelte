<script lang="ts">
 import {ApplicationRoot,ApplicationHost,FeatureViews,FeatureOutlet,type ApplicationInstance} from '../../src/lib/application/index.js';
 import {application,type Root,type Action,type Deps,type WorkspaceView} from './FeatureViewsModel.js';
 import {rootViews} from './FeatureViewsPlans.js';
 let {count=0,dependencies,onApp,onWorkspace,plan=rootViews,definition=application}:{count?:number|undefined;dependencies:Deps;onWorkspace?:((view:WorkspaceView)=>void)|undefined;plan?:typeof rootViews|undefined;definition?:typeof application|undefined;onApp?:((app:ApplicationInstance<Root,Action>)=>void)|undefined}=$props();
</script>
<ApplicationRoot definition={definition} options={{dependencies,initial:{input:count}}}>
 {#snippet children(app)}
  {@const observed=onApp?.(app)}
<ApplicationHost {app}><FeatureViews store={app.store} definition={plan}>
 {#snippet children(views)}{@const observed=onWorkspace?.(views.workspace)}<FeatureOutlet view={views.workspace}/><aside><FeatureOutlet view={views.rows}/></aside>{/snippet}
</FeatureViews></ApplicationHost>
 {/snippet}
</ApplicationRoot>
