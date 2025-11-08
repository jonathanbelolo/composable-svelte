<script lang="ts">
/**
 * Popup - Declarative component for adding standalone popups to maps
 *
 * Usage:
 * <Popup
 *   {store}
 *   id="info-popup"
 *   position={[-74.006, 40.7128]}
 *   isOpen={true}
 *   closeButton={true}
 *   closeOnClick={false}
 * >
 *   <h3>Custom Popup</h3>
 *   <p>This is a popup!</p>
 * </Popup>
 */

import { onMount, onDestroy } from 'svelte';
import type { Store } from '@composable-svelte/core';
import type { MapState, MapAction, LngLat } from '../types/map.types';
import type { Snippet } from 'svelte';

// Props
let {
  store,
  id,
  position,
  isOpen = true,
  closeButton = true,
  closeOnClick = false,
  children
}: {
  store: Store<MapState, MapAction>;
  id: string;
  position: LngLat;
  isOpen?: boolean;
  closeButton?: boolean;
  closeOnClick?: boolean;
  children?: Snippet;
} = $props();

// Container for popup content
let contentElement: HTMLDivElement | null = $state(null);

// Open popup on mount
onMount(() => {
  if (!contentElement) return;

  store.dispatch({
    type: 'openPopup',
    popup: {
      id,
      position,
      content: contentElement.innerHTML,
      isOpen,
      closeButton,
      closeOnClick
    }
  });
});

// Update popup when position or open state changes
$effect(() => {
  if (isOpen) {
    if (contentElement) {
      store.dispatch({
        type: 'openPopup',
        popup: {
          id,
          position,
          content: contentElement.innerHTML,
          isOpen: true,
          closeButton,
          closeOnClick
        }
      });
    }
  } else {
    store.dispatch({
      type: 'closePopup',
      id
    });
  }
});

// Close popup on unmount
onDestroy(() => {
  store.dispatch({
    type: 'closePopup',
    id
  });
});
</script>

<!-- Hidden div to render popup content -->
<div bind:this={contentElement} style="display: none;">
  {#if children}
    {@render children()}
  {/if}
</div>
