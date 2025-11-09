<script lang="ts">
/**
 * Camera - Declarative camera component
 * Updates camera configuration via store
 */

import { onMount } from 'svelte';
import type { Store } from '@composable-svelte/core';
import type { GraphicsState, GraphicsAction, Vector3, CameraType } from '../core/types';

// Props
let {
  store,
  type = 'perspective',
  position,
  lookAt,
  fov,
  near,
  far
}: {
  store: Store<GraphicsState, GraphicsAction>;
  type?: CameraType;
  position: Vector3;
  lookAt: Vector3;
  fov?: number;
  near?: number;
  far?: number;
} = $props();

// Build camera config
const cameraConfig = $derived({
  type,
  position,
  lookAt,
  fov,
  near,
  far
});

// Update camera on mount and when props change
onMount(() => {
  store.dispatch({
    type: 'updateCamera',
    camera: cameraConfig
  });
});

// Track if mounted to skip first effect
let mounted = $state(false);

// Update camera when props change
$effect(() => {
  if (!mounted) {
    mounted = true;
    return;
  }

  store.dispatch({
    type: 'updateCamera',
    camera: cameraConfig
  });
});
</script>

<!-- Empty element for Svelte 5 snippet compatibility -->
<!--  Camera component updates state only, no visual output -->
