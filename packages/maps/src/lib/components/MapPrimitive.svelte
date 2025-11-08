<script lang="ts">
/**
 * MapPrimitive - Low-level component that renders Maplibre/Mapbox GL
 * Handles map lifecycle: mount, update, unmount
 */

import { onMount } from 'svelte';
import type { Store } from '@composable-svelte/core';
import type { MapState, MapAction, MapAdapter } from '../types/map.types';
import { createMapAdapter } from '../utils/map-adapter';
import { getStyleURL } from '../utils/tile-providers';

// Props
let {
  store
}: {
  store: Store<MapState, MapAction>;
} = $props();

// Container element
let containerElement: HTMLDivElement | null = $state(null);
let mapAdapter: MapAdapter | null = $state(null);

// Setup map on mount
onMount(() => {
  if (!containerElement) return;

  const state = store.state;

  // Create map adapter
  mapAdapter = createMapAdapter(state.provider);

  // Initialize map
  mapAdapter.initialize(containerElement, {
    center: state.viewport.center,
    zoom: state.viewport.zoom,
    bearing: state.viewport.bearing,
    pitch: state.viewport.pitch,
    style: state.style,
    accessToken: state.accessToken,
    interactive: state.isInteractive
  });

  // Attach event listeners
  mapAdapter.on('load', handleLoad);
  mapAdapter.on('error', handleError);
  mapAdapter.on('moveend', handleMoveEnd);
  mapAdapter.on('zoomend', handleZoomEnd);
  mapAdapter.on('dragstart', handleDragStart);
  mapAdapter.on('dragend', handleDragEnd);

  return () => {
    mapAdapter?.destroy();
    mapAdapter = null;
  };
});

// Sync markers when state changes
$effect(() => {
  if (!mapAdapter) return;

  const currentMarkers = $store.markers;

  // Simple sync: remove all, add all
  // TODO: Optimize with diff algorithm
  currentMarkers.forEach((marker) => {
    mapAdapter!.addMarker(marker);
  });
});

// Sync layers when state changes
$effect(() => {
  if (!mapAdapter) return;

  const currentLayers = $store.layers;

  // Simple sync: remove all, add all
  // TODO: Optimize with diff algorithm
  currentLayers.forEach((layer) => {
    mapAdapter!.addLayer(layer);
  });
});

// Sync popups when state changes
$effect(() => {
  if (!mapAdapter) return;

  const currentPopups = $store.popups;

  // Simple sync: remove all, add all
  // TODO: Optimize with diff algorithm
  currentPopups.forEach((popup) => {
    if (popup.isOpen) {
      mapAdapter!.openPopup(popup);
    }
  });
});

// Sync viewport when state changes (but not during interaction)
$effect(() => {
  if (!mapAdapter || $store.isDragging || $store.isZooming) return;

  const viewport = $store.viewport;

  mapAdapter.setCenter(viewport.center);
  mapAdapter.setZoom(viewport.zoom);
  mapAdapter.setBearing(viewport.bearing);
  mapAdapter.setPitch(viewport.pitch);
});

// Sync tile provider when it changes
$effect(() => {
  if (!mapAdapter) return;

  const { tileProvider, customTileURL, accessToken } = $store;
  const newStyleURL = getStyleURL(tileProvider, accessToken, customTileURL);

  mapAdapter.changeStyle(newStyleURL);
});

// Event handlers
function handleLoad() {
  store.dispatch({ type: 'mapLoaded' });
}

function handleError(event: any) {
  store.dispatch({
    type: 'mapError',
    error: event.error?.message ?? 'Map error'
  });
}

function handleMoveEnd() {
  if (!mapAdapter) return;

  store.dispatch({
    type: 'viewportChanged',
    viewport: {
      center: mapAdapter.getCenter(),
      zoom: mapAdapter.getZoom(),
      bearing: mapAdapter.getBearing(),
      pitch: mapAdapter.getPitch()
    }
  });
}

function handleZoomEnd() {
  // Viewport updated via moveend
}

function handleDragStart() {
  store.dispatch({ type: 'panStart', position: [0, 0] });
}

function handleDragEnd() {
  store.dispatch({ type: 'panEnd' });
}
</script>

<div bind:this={containerElement} class="map-primitive"></div>

<style>
  .map-primitive {
    width: 100%;
    height: 100%;
    position: relative;
  }

  /* Maplibre/Mapbox CSS */
  :global(.maplibregl-map),
  :global(.mapboxgl-map) {
    width: 100%;
    height: 100%;
    font-family: system-ui, -apple-system, sans-serif;
  }

  :global(.maplibregl-ctrl-attrib),
  :global(.mapboxgl-ctrl-attrib) {
    font-size: 11px;
    background-color: rgba(255, 255, 255, 0.8);
    padding: 2px 4px;
  }
</style>
