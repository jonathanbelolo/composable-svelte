<script lang="ts">
/**
 * MapPrimitive - Low-level component that renders Maplibre/Mapbox GL
 * Handles map lifecycle: mount, update, unmount
 */

import { onMount } from 'svelte';
import type { Store } from '@composable-svelte/core';
import type { MapState, MapAction, MapAdapter } from '../types/map.types.js';
import { MaplibreAdapter } from '../utils/maplibre-adapter.js';
import { getStyleURL } from '../utils/tile-providers.js';

// MapLibre's own stylesheet. Without it markers, popups and controls render
// broken, and the adapter constructs all three. Imported here rather than left
// to the consumer, matching code's NodeCanvas.svelte:23 — and note the repo's
// own MapDemo already imports it at app level, so the requirement was understood
// and simply never pushed into the package.
import 'maplibre-gl/dist/maplibre-gl.css';

// Props
let {
  store,
  adapter
}: {
  store: Store<MapState, MapAction>;
  /**
   * The map engine to drive. Defaults to MapLibre.
   *
   * `MapAdapter` was exported from this package's root from the beginning and
   * was impossible to supply: this component constructed its own adapter from
   * `state.provider`, so the interface described an extension point that did
   * not exist. Two consequences followed. A consumer wanting a different engine
   * had no route in — the `'mapbox'` provider was the stand-in for that, and it
   * returned the MapLibre adapter. And this component could not be tested,
   * because there was no way to keep a WebGL context out of it, which is why it
   * had no test.
   *
   * Supply `MapboxAdapter` from `@composable-svelte/maps/mapbox`, an adapter of
   * your own, or a fake.
   */
  adapter?: MapAdapter | undefined;
} = $props();

// Container element
let containerElement: HTMLDivElement | null = $state(null);
let mapAdapter: MapAdapter | null = $state(null);

// Flag to prevent feedback loop when map events trigger state updates
let isProcessingMapEvent = false;
// Flag to prevent moveend events from interfering with flyTo/easeTo animations
let isAnimating = false;

// Setup map on mount
onMount(() => {
  if (!containerElement) return;

  let unsubscribeMapContent: (() => void) | undefined;

  try {
    const state = store.state;

    // The supplied adapter, or MapLibre. Resolved here rather than as a prop
    // default so exactly one is constructed, at mount, whatever the component
    // re-renders afterwards.
    mapAdapter = adapter ?? new MaplibreAdapter();

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

    // Setup manual subscription for map content sync
    unsubscribeMapContent = setupMapContentSync();
  } catch (error) {
    // Dispatch error action if initialization fails
    const errorMessage = error instanceof Error ? error.message : 'Failed to initialize map';
    store.dispatch({
      type: 'mapError',
      error: errorMessage
    });
    console.error('[MapPrimitive] Initialization error:', error);
  }

  return () => {
    unsubscribeMapContent?.();
    mapAdapter?.destroy();
    mapAdapter = null;
  };
});

// Setup manual subscription for map content sync (same pattern as charts)
// This avoids infinite loops caused by effect → DOM manipulation → effect
function setupMapContentSync() {
  if (!mapAdapter) return;

  // Track previous values to detect actual changes
  let previousMarkers: typeof $store.markers = [];
  let previousLayers: typeof $store.layers = [];
  let previousPopups: typeof $store.popups = [];
  let previousViewport = { ...store.state.viewport };
  let previousIsDragging = store.state.isDragging;
  let previousIsZooming = store.state.isZooming;
  let previousTileProvider = store.state.tileProvider;
  let previousCustomTileURL = store.state.customTileURL;
  let previousAccessToken = store.state.accessToken;
  let previousFlyToTarget = store.state.flyToTarget;

  // Manually subscribe to store updates
  const unsubscribe = store.subscribe((state) => {
    if (!mapAdapter) return;

    // Sync markers
    const currentMarkers = state.markers;
    if (JSON.stringify(previousMarkers) !== JSON.stringify(currentMarkers)) {
      const prevMap = new Map(previousMarkers.map((m) => [m.id, m]));
      const currMap = new Map(currentMarkers.map((m) => [m.id, m]));

      // Remove deleted markers
      for (const [id] of prevMap) {
        if (!currMap.has(id)) {
          mapAdapter.removeMarker(id);
        }
      }

      // Add new or update changed markers
      for (const [id, marker] of currMap) {
        const prev = prevMap.get(id);
        if (!prev) {
          mapAdapter.addMarker(marker);
        } else if (JSON.stringify(prev) !== JSON.stringify(marker)) {
          mapAdapter.updateMarker(id, marker);
        }
      }

      previousMarkers = currentMarkers;
    }

    // Sync layers
    const currentLayers = state.layers;
    if (JSON.stringify(previousLayers) !== JSON.stringify(currentLayers)) {
      const prevMap = new Map(previousLayers.map((l) => [l.id, l]));
      const currMap = new Map(currentLayers.map((l) => [l.id, l]));

      // Remove deleted layers
      for (const [id] of prevMap) {
        if (!currMap.has(id)) {
          mapAdapter.removeLayer(id);
        }
      }

      // Add new or update changed layers
      for (const [id, layer] of currMap) {
        const prev = prevMap.get(id);
        if (!prev) {
          mapAdapter.addLayer(layer);
        } else {
          const prevVisible = prev.visible;
          const currVisible = layer.visible;
          const styleChanged = JSON.stringify(prev.style) !== JSON.stringify(layer.style);

          if (prevVisible !== currVisible) {
            mapAdapter.toggleLayerVisibility(id);
          }
          if (styleChanged) {
            mapAdapter.updateLayerStyle(id, layer.style);
          }
        }
      }

      previousLayers = currentLayers;
    }

    // Sync popups
    const currentPopups = state.popups;
    if (JSON.stringify(previousPopups) !== JSON.stringify(currentPopups)) {
      const prevMap = new Map(previousPopups.map((p) => [p.id, p]));
      const currMap = new Map(currentPopups.map((p) => [p.id, p]));

      // Handle removed popups
      for (const [id] of prevMap) {
        if (!currMap.has(id)) {
          mapAdapter.closePopup(id);
        }
      }

      // Handle new or changed popups
      for (const [id, popup] of currMap) {
        const prev = prevMap.get(id);

        if (!prev) {
          if (popup.isOpen) {
            mapAdapter.openPopup(popup);
          }
        } else {
          const wasOpen = prev.isOpen;
          const isOpen = popup.isOpen;
          const contentChanged = prev.content !== popup.content ||
                                 prev.position[0] !== popup.position[0] ||
                                 prev.position[1] !== popup.position[1];

          if (!wasOpen && isOpen) {
            mapAdapter.openPopup(popup);
          } else if (wasOpen && !isOpen) {
            mapAdapter.closePopup(id);
          } else if (isOpen && contentChanged) {
            mapAdapter.closePopup(id);
            mapAdapter.openPopup(popup);
          }
        }
      }

      previousPopups = currentPopups;
    }

    // Handle flyTo animation (smooth transition)
    const flyToTargetChanged = JSON.stringify(previousFlyToTarget) !== JSON.stringify(state.flyToTarget);

    if (flyToTargetChanged && state.flyToTarget) {
      // Use flyTo for smooth animation
      // Set animation flag to prevent moveend from interfering
      isAnimating = true;

      mapAdapter.flyTo(state.flyToTarget);
      previousFlyToTarget = state.flyToTarget;

      // Clear the flyTo target and animation flag after animation completes
      const duration = state.flyToTarget.duration || 0;
      setTimeout(() => {
        isAnimating = false;
        store.dispatch({ type: 'flyToCompleted' });
      }, duration + 50); // Add 50ms buffer to ensure animation completes

      return; // Skip regular viewport sync when flying
    } else if (flyToTargetChanged) {
      previousFlyToTarget = state.flyToTarget;
    }

    // Sync viewport when state changes (but not during interaction or flyTo)
    const isDraggingChanged = previousIsDragging !== state.isDragging;
    const isZoomingChanged = previousIsZooming !== state.isZooming;
    const viewportChanged = JSON.stringify(previousViewport) !== JSON.stringify(state.viewport);

    if (!state.isDragging && !state.isZooming && viewportChanged && !isProcessingMapEvent && !state.flyToTarget) {
      // Only update map if not processing a map event (prevents feedback loop)
      mapAdapter.setCenter(state.viewport.center);
      mapAdapter.setZoom(state.viewport.zoom);
      mapAdapter.setBearing(state.viewport.bearing);
      mapAdapter.setPitch(state.viewport.pitch);
      previousViewport = { ...state.viewport };
    } else if (viewportChanged) {
      // Just track the change without updating the map
      previousViewport = { ...state.viewport };
    }

    if (isDraggingChanged) {
      previousIsDragging = state.isDragging;
    }
    if (isZoomingChanged) {
      previousIsZooming = state.isZooming;
    }

    // Sync tile provider when it changes
    const tileProviderChanged = previousTileProvider !== state.tileProvider;
    const customTileURLChanged = previousCustomTileURL !== state.customTileURL;
    const accessTokenChanged = previousAccessToken !== state.accessToken;

    if (tileProviderChanged || customTileURLChanged || accessTokenChanged) {
      const newStyleURL = getStyleURL(state.tileProvider, state.accessToken, state.customTileURL);
      mapAdapter.changeStyle(newStyleURL);
      previousTileProvider = state.tileProvider;
      previousCustomTileURL = state.customTileURL;
      previousAccessToken = state.accessToken;
    }
  });

  return unsubscribe;
}

// Event handlers
function handleLoad() {
  store.dispatch({ type: 'mapLoaded' });
}

function handleError(event: unknown) {
  // Extract error message from Maplibre/Mapbox error event
  let errorMessage = 'Map error';

  if (event && typeof event === 'object') {
    const err = event as { error?: { message?: string } };
    errorMessage = err.error?.message ?? 'Map error';
  }

  store.dispatch({
    type: 'mapError',
    error: errorMessage
  });
}

function handleMoveEnd() {
  if (!mapAdapter) return;

  // Ignore moveend events during flyTo/easeTo animations
  if (isAnimating) {
    return;
  }

  // Get viewport from map
  const viewport = {
    center: mapAdapter.getCenter(),
    zoom: mapAdapter.getZoom(),
    bearing: mapAdapter.getBearing(),
    pitch: mapAdapter.getPitch()
  };

  // Set flag to prevent feedback loop
  isProcessingMapEvent = true;

  store.dispatch({
    type: 'viewportChanged',
    viewport
  });

  // Clear flag after dispatch completes (use setTimeout to ensure subscribers have run)
  setTimeout(() => {
    isProcessingMapEvent = false;
  }, 0);
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
