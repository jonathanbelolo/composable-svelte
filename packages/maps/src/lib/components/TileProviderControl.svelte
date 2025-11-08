<script lang="ts">
/**
 * TileProviderControl - UI control for switching map tile providers
 */

import type { Store } from '@composable-svelte/core';
import type { MapState, MapAction, TileProvider } from '../types/map.types';
import { getAvailableTileProviders, type TileProviderConfig } from '../utils/tile-providers';

// Props
let {
  store,
  position = 'top-right',
  class: className = ''
}: {
  store: Store<MapState, MapAction>;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  class?: string;
} = $props();

// Available providers
const providers = getAvailableTileProviders();

// Current provider
const currentProvider = $derived($store.tileProvider);

// Handle provider change
function handleChange(event: Event) {
  const select = event.target as HTMLSelectElement;
  const provider = select.value as TileProvider;

  store.dispatch({
    type: 'changeTileProvider',
    provider
  });
}

// Position classes
const positionClass = $derived({
  'top-left': 'top-4 left-4',
  'top-right': 'top-4 right-4',
  'bottom-left': 'bottom-4 left-4',
  'bottom-right': 'bottom-4 right-4'
}[position]);
</script>

<div class="tile-provider-control {positionClass} {className}">
  <label for="tile-provider-select" class="tile-provider-label">
    Map Style
  </label>
  <select
    id="tile-provider-select"
    class="tile-provider-select"
    value={currentProvider}
    onchange={handleChange}
  >
    {#each providers as provider}
      <option value={provider.id}>
        {provider.name}
      </option>
    {/each}
  </select>
</div>

<style>
  .tile-provider-control {
    position: absolute;
    z-index: 10;
    background: white;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    padding: 8px 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .tile-provider-label {
    font-size: 11px;
    font-weight: 600;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .tile-provider-select {
    padding: 6px 8px;
    border: 1px solid #ddd;
    border-radius: 4px;
    background: white;
    font-size: 13px;
    cursor: pointer;
    transition: border-color 0.2s;
  }

  .tile-provider-select:hover {
    border-color: #999;
  }

  .tile-provider-select:focus {
    outline: none;
    border-color: #0080ff;
    box-shadow: 0 0 0 2px rgba(0, 128, 255, 0.1);
  }
</style>
