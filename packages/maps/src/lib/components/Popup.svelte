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

import { onMount } from 'svelte';
import type { MapStore, LngLat } from '../types/map.types.js';
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
  store: MapStore;
  id: string;
  position: LngLat;
  isOpen?: boolean | undefined;
  closeButton?: boolean | undefined;
  closeOnClick?: boolean | undefined;
  children?: Snippet | undefined;
} = $props();

// Container for popup content
let contentElement: HTMLDivElement | null = $state(null);

// Track previous values to detect changes
let previousIsOpen = isOpen;
let previousPosition = position;
let hasInitialized = $state(false);
let active = store.state !== undefined;

// Open popup on mount and update when props change
onMount(() => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const unsubscribe = store.subscribe((state) => {
    if (state === undefined) {
      active = false;
      if (timer !== undefined) clearTimeout(timer);
    }
  });
  if (!active) return unsubscribe;
  // Wait for content to render
  timer = setTimeout(() => {
    if (!active || !contentElement) return;

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
    unsubscribe();
    clearTimeout(timer);
    // Close popup on unmount
    if (active) store.dispatch({
      type: 'closePopup',
      id
    });
  };
});

// Manual prop change detection (avoid $effect infinite loops)
$effect(() => {
  if (!active || !hasInitialized || !contentElement) return;

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
