<script lang="ts">
 import {ApplicationRoot,ApplicationHost,FeatureViews,FeatureOutlet,type ApplicationInstance} from '../../src/lib/application/index.js';import {application,views,type S,type A} from './ArbitrationModel.js';
 let {onApp}:{onApp:(app:ApplicationInstance<S,A>)=>void}=$props();let hosted=$state(true);
</script>
<ApplicationRoot definition={application} options={{dependencies:undefined,initial:{input:undefined}}}>{#snippet children(app)}{@const observed=onApp(app)}<button data-detach onclick={()=>hosted=false}>Detach</button>{#if hosted}<ApplicationHost {app}><FeatureViews store={app.store} definition={views}>{#snippet children(handles)}<FeatureOutlet view={handles.child}/>{/snippet}</FeatureViews></ApplicationHost>{/if}{/snippet}</ApplicationRoot>
