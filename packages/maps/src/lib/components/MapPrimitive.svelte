<script lang="ts">
/**
 * MapPrimitive - Low-level component that renders Maplibre/Mapbox GL
 * Handles map lifecycle: mount, update, unmount
 */

import { onMount } from 'svelte';
import type { MapAdapter, MapStore, Marker, Layer, Popup } from '../types/map.types.js';
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
  adapter,
  onMapClick
}: {
  store: MapStore;
  /**
   * The map engine to drive. Defaults to MapLibre.
   *
   * Supply `MapboxAdapter` from `@composable-svelte/maps/mapbox`, an adapter of
   * your own, or a fake.
   */
  adapter?: MapAdapter | undefined;
  onMapClick?: ((lngLat: [number, number]) => void) | undefined;
} = $props();

// Container element
let containerElement: HTMLDivElement | null = $state(null);
let mapAdapter: MapAdapter | null = $state(null);

// Flag to prevent feedback loop when map events trigger state updates
let isProcessingMapEvent = false;
// Some engines emit moveend synchronously from a programmatic setter. Ignore
// those intermediate camera positions while applying one store viewport.
let isApplyingStoreViewport = false;
let viewportSyncGeneration = 0;
// Track flight, style loading, and lifecycle state
let isStyleLoading = false;
let isDestroyed = false;
let unsubscribeMapContent: (() => void) | null = null;

// Track previous values at component level for diff resets across style reloads
let previousMarkers: Marker[] = [];
let previousLayers: Layer[] = [];
let previousPopups: Popup[] = [];
let previousViewport = store.state?.viewport ? { ...store.state.viewport } : null;
let previousIsDragging = store.state?.isDragging ?? false;
let previousIsZooming = store.state?.isZooming ?? false;
let previousTileProvider = store.state?.tileProvider ?? 'osm';
let previousCustomTileURL = store.state?.customTileURL;
let previousAccessToken = store.state?.accessToken;
let previousStyle = store.state?.style ?? '';
let previousFlyToTarget = store.state?.flyToTarget;

function syncLayers(currentLayers: Layer[], reset = false) {
  if (!mapAdapter || isDestroyed) return;

  if (reset) {
    previousLayers = [];
  }

  const prevMap = new Map(previousLayers.map((l) => [l.id, l]));
  const currMap = new Map(currentLayers.map((l) => [l.id, l]));

  // Remove deleted layers
  if (!reset) {
    for (const [id] of prevMap) {
      if (!currMap.has(id)) {
        mapAdapter.removeLayer(id);
      }
    }
  }

  // Add new or update changed layers
  for (const [id, layer] of currMap) {
    const prev = prevMap.get(id);
    if (!prev) {
      mapAdapter.addLayer(layer);
    } else {
      const typeChanged = prev.type !== layer.type;
      const prevVisible = prev.visible;
      const currVisible = layer.visible;
      const styleChanged = JSON.stringify(prev.style) !== JSON.stringify(layer.style);
      const dataChanged = prev.data !== layer.data || JSON.stringify(prev.data) !== JSON.stringify(layer.data);
      const interactiveChanged = prev.interactive !== layer.interactive;

      if (typeChanged || dataChanged || interactiveChanged) {
        mapAdapter.removeLayer(id);
        mapAdapter.addLayer(layer);
      } else {
        if (prevVisible !== currVisible) {
          mapAdapter.toggleLayerVisibility(id);
        }
        if (styleChanged) {
          mapAdapter.updateLayerStyle(id, layer.style);
        }
      }
    }
  }

  previousLayers = [...currentLayers];
}

function destroyMap() {
  if (isDestroyed) return;
  isDestroyed = true;

  if (unsubscribeMapContent) {
    unsubscribeMapContent();
    unsubscribeMapContent = null;
  }

  if (mapAdapter) {
    mapAdapter.off('load', handleLoad);
    mapAdapter.off('style.load', handleStyleLoad);
    mapAdapter.off('error', handleError);
    mapAdapter.off('moveend', handleMoveEnd);
    mapAdapter.off('zoomend', handleZoomEnd);
    mapAdapter.off('dragstart', handleDragStart);
    mapAdapter.off('dragend', handleDragEnd);
    mapAdapter.off('click', handleClick);

    mapAdapter.destroy();
    mapAdapter = null;
  }
}

// Setup map on mount
onMount(() => {
  if (!containerElement) return;

  try {
    const state = store.state;
    if (!state) {
      // Owner is already retired or uninitialized; do not construct or initialize adapter
      isDestroyed = true;
      return;
    }

    isDestroyed = false;

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
    mapAdapter.on('style.load', handleStyleLoad);
    mapAdapter.on('error', handleError);
    mapAdapter.on('moveend', handleMoveEnd);
    mapAdapter.on('zoomend', handleZoomEnd);
    mapAdapter.on('dragstart', handleDragStart);
    mapAdapter.on('dragend', handleDragEnd);
    mapAdapter.on('click', handleClick);

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
    destroyMap();
  };
});

// Setup manual subscription for map content sync (same pattern as charts)
// This avoids infinite loops caused by effect → DOM manipulation → effect
function setupMapContentSync() {
  if (!mapAdapter || isDestroyed) return null;

  previousMarkers = [];
  previousLayers = [];
  previousPopups = [];
  if (store.state) {
    previousViewport = { ...store.state.viewport };
    previousIsDragging = store.state.isDragging;
    previousIsZooming = store.state.isZooming;
    previousTileProvider = store.state.tileProvider;
    previousCustomTileURL = store.state.customTileURL;
    previousAccessToken = store.state.accessToken;
    previousStyle = store.state.style;
    previousFlyToTarget = store.state.flyToTarget;
  }

  // Manually subscribe to store updates
  const unsubscribe = store.subscribe((state) => {
    // When owner invalidation occurs, ChildView emits terminal undefined!
    if (!state) {
      destroyMap();
      return;
    }

    if (!mapAdapter || isDestroyed) return;

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

    // Sync layers (deferred if style is loading)
    if (!isStyleLoading) {
      const currentLayers = state.layers;
      if (JSON.stringify(previousLayers) !== JSON.stringify(currentLayers)) {
        syncLayers(currentLayers, false);
      }
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
      const target = state.flyToTarget;
      previousFlyToTarget = target;
      mapAdapter.flyTo(target);
      return; // Skip regular viewport sync when flying
    } else if (flyToTargetChanged) {
      previousFlyToTarget = state.flyToTarget;
    }

    // Sync viewport when state changes (but not during interaction or flyTo)
    const isDraggingChanged = previousIsDragging !== state.isDragging;
    const isZoomingChanged = previousIsZooming !== state.isZooming;
    const viewportChanged = JSON.stringify(previousViewport) !== JSON.stringify(state.viewport);

    if (!state.isDragging && !state.isZooming && viewportChanged && !isProcessingMapEvent && !state.flyToTarget) {
      // Some adapters emit moveend synchronously from each setter. Treat the
      // four requested fields as one transaction so intermediate positions do
      // not overwrite the target in the store.
      const requestedViewport = state.viewport;
      const attachedAdapter = mapAdapter;
      const generation = ++viewportSyncGeneration;
      const wasApplyingStoreViewport = isApplyingStoreViewport;
      const stillCurrent = () =>
        !isDestroyed && mapAdapter === attachedAdapter &&
        JSON.stringify(store.state?.viewport) === JSON.stringify(requestedViewport) &&
        viewportSyncGeneration === generation;
      previousViewport = { ...requestedViewport };
      isApplyingStoreViewport = true;
      try {
        // Latitude limits depend on zoom and canvas height. Zoom first so a
        // valid high-latitude target is not clamped at the old world zoom.
        attachedAdapter.setZoom(requestedViewport.zoom);
        if (!stillCurrent()) return;
        attachedAdapter.setCenter(requestedViewport.center);
        if (!stillCurrent()) return;
        attachedAdapter.setBearing(requestedViewport.bearing);
        if (!stillCurrent()) return;
        attachedAdapter.setPitch(requestedViewport.pitch);
        if (!stillCurrent()) return;

        // Engines may clamp latitude, zoom, bearing or pitch. Publish the
        // applied viewport once, after all setters, so state and canvas agree.
        const appliedViewport = {
          center: attachedAdapter.getCenter(),
          zoom: attachedAdapter.getZoom(),
          bearing: attachedAdapter.getBearing(),
          pitch: attachedAdapter.getPitch()
        };
        if (!stillCurrent()) return;
        if (JSON.stringify(appliedViewport) !== JSON.stringify(requestedViewport)) {
          previousViewport = { ...appliedViewport };
          isProcessingMapEvent = true;
          try {
            store.dispatch({ type: 'viewportChanged', viewport: appliedViewport });
          } finally {
            isProcessingMapEvent = false;
          }
        }
      } finally {
        isApplyingStoreViewport = wasApplyingStoreViewport;
      }
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
    const styleChanged = previousStyle !== state.style;
    const tileProviderChanged = previousTileProvider !== state.tileProvider;
    const customTileURLChanged = previousCustomTileURL !== state.customTileURL;
    const accessTokenChanged = previousAccessToken !== state.accessToken;

    if (styleChanged || tileProviderChanged || customTileURLChanged || accessTokenChanged) {
      const newStyleURL = state.style || getStyleURL(state.tileProvider, state.accessToken, state.customTileURL);
      isStyleLoading = true;
      previousStyle = state.style;
      previousTileProvider = state.tileProvider;
      previousCustomTileURL = state.customTileURL;
      previousAccessToken = state.accessToken;
      mapAdapter.changeStyle(newStyleURL);
      // Do NOT re-add layers immediately; style.load restores latest layers via diff reset
    }
  });

  return unsubscribe;
}

// Event handlers
function handleLoad() {
  if (!mapAdapter || isDestroyed || !store.state) return;
  store.dispatch({ type: 'mapLoaded' });
}

function handleStyleLoad() {
  if (!mapAdapter || isDestroyed || !store.state) return;
  isStyleLoading = false;
  // Store changes are deferred while the style reloads. A pending adapter
  // entry may already have flushed on styledata with an older snapshot. Remove
  // only entries deleted or changed during the reload before restoring current
  // layers; unchanged native layers can stay in place.
  const currentById = new Map(store.state.layers.map(layer => [layer.id, layer]));
  for (const previous of previousLayers) {
    const current = currentById.get(previous.id);
    if (!current || JSON.stringify(previous) !== JSON.stringify(current)) {
      mapAdapter.removeLayer(previous.id);
    }
  }
  syncLayers(store.state.layers, true);
}

function handleError(event: unknown) {
  if (!mapAdapter || isDestroyed || !store.state) return;
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

function handleMoveEnd(event: unknown = undefined) {
  if (!mapAdapter || isDestroyed || !store.state || isApplyingStoreViewport) return;
  const adapter = mapAdapter;
  const completedTarget = store.state?.flyToTarget;
  const viewport = {
    center: mapAdapter.getCenter(), zoom: mapAdapter.getZoom(),
    bearing: mapAdapter.getBearing(), pitch: mapAdapter.getPitch()
  };
  isProcessingMapEvent = true;
  previousViewport = { ...viewport };
  try {
    store.dispatch({type:'viewportChanged',viewport});
    const eventFlightId = (event as { flightId?: unknown } | undefined)?.flightId;
    if (isDestroyed || mapAdapter !== adapter || !store.state) return;
    const adapterFlightId = adapter.currentFlightId;
    const isSupersededFlight =
      eventFlightId !== undefined &&
      adapterFlightId !== undefined &&
      eventFlightId !== adapterFlightId;
    // An observer may start another flight while receiving viewportChanged.
    // Completion belongs only to the target present when this event arrived.
    // Interrupted old flights carry a stale flightId and must not complete the replacement target.
    if (!isSupersededFlight && completedTarget && store.state?.flyToTarget === completedTarget) {
      store.dispatch({type:'flyToCompleted'});
    }
  } finally { isProcessingMapEvent = false; }
}

function handleZoomEnd() {
  // Viewport updated via moveend
}

function handleDragStart() {
  if (!mapAdapter || isDestroyed || !store.state) return;
  store.dispatch({ type: 'panStart', position: [0, 0] });
}

function handleDragEnd() {
  if (!mapAdapter || isDestroyed || !store.state) return;
  store.dispatch({ type: 'panEnd' });
}

function handleClick(event: unknown) {
  if (!mapAdapter || isDestroyed || !store.state) return;
  if (!onMapClick) return;

  const e = event as { lngLat?: { lng: number; lat: number } | [number, number] };
  if (!e?.lngLat) return;

  if (Array.isArray(e.lngLat) && e.lngLat.length >= 2) {
    onMapClick([e.lngLat[0], e.lngLat[1]]);
  } else if (
    typeof (e.lngLat as { lng: number }).lng === 'number' &&
    typeof (e.lngLat as { lat: number }).lat === 'number'
  ) {
    onMapClick([(e.lngLat as { lng: number }).lng, (e.lngLat as { lat: number }).lat]);
  }
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
