<script lang="ts">
 import { ApplicationRoot, ApplicationHost, FeatureViews, FeatureOutlet, type ApplicationInstance } from '../../../src/lib/application/index.js';
 import { MotionPlane } from '../../../src/lib/application/motion-public.js';
 import { definition, plan, type VisualState, type VisualAction, type VisualDeps } from './VisualModel.js';
 let { url, dependencies, onApp, planeOutlet = 'none' }: { url: string; dependencies: VisualDeps; onApp: (app: ApplicationInstance<VisualState, VisualAction>) => void; planeOutlet?: 'none' | 'ok' | 'transformed' } = $props();
</script>
<ApplicationRoot {definition} options={{ dependencies, initial: { input: url, url } }}>
 {#snippet children(app)}
  {@const observed = onApp(app)}
  <ApplicationHost {app}>
   {#if planeOutlet === 'ok'}<div data-plane-host><MotionPlane/></div>{:else if planeOutlet === 'transformed'}<div data-plane-host style="transform:translateZ(0)"><MotionPlane/></div>{/if}
   <FeatureViews store={app.store} definition={plan}>
    {#snippet children(views)}<FeatureOutlet view={views.page}/>{/snippet}
   </FeatureViews>
  </ApplicationHost>
 {/snippet}
</ApplicationRoot>
