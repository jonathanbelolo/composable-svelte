<script lang="ts">
  import { useStagedRoute, type PresentationFeatureViewProps } from '@composable-svelte/core/application';
  import { Presence, useLayoutChoreography, useParticipant } from '@composable-svelte/core/application/motion';
  import { application, ITEMS, type CatalogAction, type CatalogState } from './model.js';
  import { filterCatalog, openDetail } from './motion.js';
  import CatalogItem from './CatalogItem.svelte';

  let { store }: PresentationFeatureViewProps<CatalogState, CatalogAction, {}> = $props();

  // Bound to this page's owner: unmounting it cancels its pending request (`ownerRetired`).
  const route = useStagedRoute(application);
  const participant = useParticipant();
  const layout = useLayoutChoreography();

  const featuredOnly = $derived(store.state?.featuredOnly ?? false);
  const shown = (item: (typeof ITEMS)[number]) => !featuredOnly || item.featured;

  function open(id: string) {
    route.request({ to: `/items/${id}` }, { motion: openDetail(id) });
  }
  function toggleFeatured() {
    // Items that this commit removes leave through their <Presence> boundary.
    const leaving = featuredOnly ? [] : ITEMS.filter(item => !item.featured).map(item => item.id);
    layout.transition(filterCatalog(leaving), () => store.dispatch({ type: 'toggleFeatured' }));
  }
</script>

<main>
  <!-- An inline SVG can itself be a participant. -->
  <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" use:participant={{ key: 'catalog-mark' }}>
    <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" />
  </svg>
  <h1>Catalog</h1>
  <button type="button" onclick={toggleFeatured}>{featuredOnly ? 'Show all' : 'Featured only'}</button>
  <ul class="catalog" data-composable-scroll="catalog-list" use:participant={{ key: 'catalog-list' }}>
    {#each ITEMS as item (item.id)}
      <Presence when={shown(item)}>
        <CatalogItem {item} onopen={open} />
      </Presence>
    {/each}
  </ul>
</main>
