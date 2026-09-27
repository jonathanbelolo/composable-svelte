<script lang="ts">
  import { useStagedRoute, type PresentationFeatureViewProps } from '@composable-svelte/core/application';
  import { useParticipant } from '@composable-svelte/core/application/motion';
  import { application, type DetailAction, type DetailState } from './model.js';
  import { closeDetail } from './motion.js';

  let { store }: PresentationFeatureViewProps<DetailState, DetailAction, {}> = $props();

  const route = useStagedRoute(application);
  const participant = useParticipant();

  function back(id: string) {
    route.request({ to: '/' }, { motion: closeDetail(id) });
  }
</script>

{#if store.state}
  {@const { item, saved } = store.state}
  <main>
    <button type="button" use:participant={{ key: 'back', role: 'control' }} onclick={() => back(item.id)}>Back to catalog</button>
    <h1 data-route-focus use:participant={{ key: `item-${item.id}` }}>{item.title}</h1>
    <!-- Text only: focusable content may slide but never fades below its stable opacity. -->
    <article use:participant={{ key: 'detail-body' }}>
      <p>{item.summary}</p>
    </article>
    <button type="button" onclick={() => store.dispatch({ type: 'toggleSaved' })}>{saved ? 'Saved' : 'Save'}</button>
  </main>
{/if}
