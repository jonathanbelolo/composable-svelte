<script lang="ts">
/**
 * Mesh - Declarative 3D mesh component
 * Adds/updates mesh via store
 */

import { onMount, onDestroy } from 'svelte';
import type { Store } from '@composable-svelte/core';
import type {
  GraphicsState,
  GraphicsAction,
  GeometryConfig,
  MaterialConfig,
  Vector3
} from '../core/types';

// Props
let {
  store,
  id,
  geometry,
  material,
  position,
  rotation,
  scale,
  visible = true
}: {
  store: Store<GraphicsState, GraphicsAction>;
  id: string;
  geometry: GeometryConfig;
  material: MaterialConfig;
  position: Vector3;
  rotation?: Vector3;
  scale?: Vector3;
  visible?: boolean;
} = $props();

// Build mesh config
const meshConfig = $derived({
  id,
  geometry,
  material,
  position,
  rotation: rotation || [0, 0, 0],
  scale: scale || [1, 1, 1],
  visible
});

// Add mesh on mount
onMount(() => {
  store.dispatch({
    type: 'addMesh',
    mesh: meshConfig
  });
});

// Track if mounted to skip first effect
let mounted = $state(false);

// Update mesh when props change
$effect(() => {
  if (!mounted) {
    mounted = true;
    return;
  }

  store.dispatch({
    type: 'updateMesh',
    id,
    updates: meshConfig
  });
});

// Remove mesh on unmount
onDestroy(() => {
  store.dispatch({
    type: 'removeMesh',
    id
  });
});
</script>

<!-- Empty element for Svelte 5 snippet compatibility -->
<!-- Mesh component updates state only, no visual output -->
