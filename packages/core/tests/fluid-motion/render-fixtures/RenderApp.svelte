<script lang="ts">
 import { ApplicationRoot, ApplicationHost, FeatureViews, FeatureOutlet, type ApplicationInstance } from '../../../src/lib/application/index.js';
 import { definition, plan, type Root, type RootAction, type Deps } from './RenderModel.js';
 import Shell from './RenderShell.svelte';
 import Bomb from './Bomb.svelte';
 let { url, dependencies, onApp, withFallback = true, hostVisible = true }: { url: string; dependencies: Deps; onApp: (app: ApplicationInstance<Root, RootAction>) => void; withFallback?: boolean; hostVisible?: boolean } = $props();
</script>
<ApplicationRoot {definition} options={{ dependencies, initial: { input: url, url } }}>
 {#snippet children(app)}
  {@const observed = onApp(app)}
  {#if hostVisible}
  <ApplicationHost {app}>
   <Shell url={app.store.state.url}/>
   <FeatureViews store={app.store} definition={plan}>
    {#snippet children(views)}
     {#if withFallback}
      <FeatureOutlet view={views.page}>
       {#snippet fallback({ summary, attempt, retry })}
        <div data-fallback role="alert"><span data-summary>{summary.message}</span><span data-attempt>{attempt}</span><button data-retry onclick={retry}>Retry</button><Bomb kind="fallback"/></div>
       {/snippet}
      </FeatureOutlet>
     {:else}
      <FeatureOutlet view={views.page}/>
     {/if}
    {/snippet}
   </FeatureViews>
  </ApplicationHost>
  {/if}
 {/snippet}
</ApplicationRoot>
