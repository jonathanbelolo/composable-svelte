<script lang="ts">
 import { ApplicationRoot, ApplicationHost, FeatureViews, FeatureOutlet, useStagedRoute, type ApplicationInstance } from '../../../src/lib/application/index.js';
 import { definition, plan, requesters, type SliceState, type SliceAction, type SliceDeps } from './SliceModel.js';
 import Shell from './SliceShell.svelte';
 let { url, dependencies, onApp, hostVisible = true }: { url: string; dependencies: SliceDeps; onApp: (app: ApplicationInstance<SliceState, SliceAction>) => void; hostVisible?: boolean } = $props();
 void requesters; void useStagedRoute;
</script>
<ApplicationRoot {definition} options={{ dependencies, initial: { input: url, url } }}>
 {#snippet children(app)}
  {@const observed = onApp(app)}
  {#if hostVisible}
   <ApplicationHost {app}>
    <Shell/>
    <FeatureViews store={app.store} definition={plan}>
     {#snippet children(views)}<FeatureOutlet view={views.page}/>{/snippet}
    </FeatureViews>
   </ApplicationHost>
  {/if}
 {/snippet}
</ApplicationRoot>
