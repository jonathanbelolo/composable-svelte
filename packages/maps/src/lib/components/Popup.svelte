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

// Track previous values to detect changes
let previousIsOpen = isOpen;
let previousPosition = position;
let hasInitialized = false;

// Open popup on mount and update when props change
onMount(() => {
  // Wait for content to render
  setTimeout(() => {
    if (!contentElement) return;

    // Initial popup creation
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
    hasInitialized = true;
  }, 0);

  return () => {
    // Close popup on unmount
    store.dispatch({
      type: 'closePopup',
      id
    });
  };
});

// Manual prop change detection (avoid $effect infinite loops)
$effect(() => {
  if (!hasInitialized || !contentElement) return;

  const isOpenChanged = previousIsOpen !== isOpen;
  const positionChanged = previousPosition[0] !== position[0] || previousPosition[1] !== position[1];

  if (isOpenChanged || positionChanged) {
    if (isOpen) {
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
    } else {
      store.dispatch({
        type: 'closePopup',
        id
      });
    }

    previousIsOpen = isOpen;
    previousPosition = position;
  }
});
</script>

<!-- Hidden div to render popup content -->
<div bind:this={contentElement} style="display: none;">
  {#if children}
    {@render children()}
  {/if}
</div>
