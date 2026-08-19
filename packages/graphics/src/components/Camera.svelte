<script lang="ts">
/**
 * Camera - Declarative camera component
 * Updates camera configuration via store
 */

import { onMount } from 'svelte';
import type { Store } from '@composable-svelte/core';
import type { GraphicsState, GraphicsAction, Vector3, CameraType } from '../core/types.js';

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

// Build camera config.
//
// The optionals are spread in only when present. An object literal always
// carries every key it names, so `{ fov }` with no `fov` prop sends
// `fov: undefined` — and the reducer merges with `{ ...state.camera,
// ...action.camera }`, where an explicit `undefined` overwrites. Mounting
// `<Camera {store} {position} {lookAt} />` used to wipe the configured fov,
// near and far, and babylon-adapter.ts:136,141,144 guard on `!== undefined`,
// so the adapter then silently never applied any of them.
const cameraConfig = $derived({
  type,
  position,
  lookAt,
  ...(fov !== undefined && { fov }),
  ...(near !== undefined && { near }),
  ...(far !== undefined && { far })
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
