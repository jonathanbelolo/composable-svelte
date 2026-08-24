<script lang="ts">
/**
 * Camera - Declarative camera component
 * Updates camera configuration via store
 */

import { untrack } from 'svelte';
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
  far,
  orthoSize
}: {
  store: Store<GraphicsState, GraphicsAction>;
  type?: CameraType;
  position: Vector3;
  lookAt: Vector3;
  fov?: number;
  near?: number;
  far?: number;
  /**
   * Half-height of the view in world units, orthographic only.
   *
   * Documented in the skill file with a copy-pasteable example — and not
   * accepted here, so the example set nothing. `CameraConfig` has carried the
   * field all along and the adapter reads it.
   */
  orthoSize?: number;
} = $props();

// Build camera config.
//
// The optionals are spread in only when present. An object literal always
// carries every key it names, so `{ fov }` with no `fov` prop sends
// `fov: undefined` — and the reducer merges with `{ ...state.camera,
// ...action.camera }`, where an explicit `undefined` overwrites. Mounting
// `<Camera {store} {position} {lookAt} />` used to wipe the configured fov,
// near and far, and `updateCamera` guards each of them on `!== undefined`,
// so the adapter then silently never applied any of them.
const cameraConfig = $derived({
  type,
  position,
  lookAt,
  ...(fov !== undefined && { fov }),
  ...(near !== undefined && { near }),
  ...(far !== undefined && { far }),
  ...(orthoSize !== undefined && { orthoSize })
});

/**
 * Follow the props.
 *
 * `cameraConfig` is the only tracked read, and the dispatch is untracked:
 * `store.dispatch` reads store state internally, so a tracked dispatch makes
 * this effect depend on its own output.
 *
 * There was an `onMount` dispatch here as well, with the effect skipping its
 * own first run via a `mounted` flag. That flag was `$state`, so writing it
 * inside the effect that read it scheduled a second run — mounting dispatched
 * `updateCamera` twice, and the gate it was named for skipped nothing.
 */
$effect(() => {
  const config = cameraConfig;
  untrack(() => store.dispatch({ type: 'updateCamera', camera: config }));
});
</script>

<!-- Empty element for Svelte 5 snippet compatibility -->
<!--  Camera component updates state only, no visual output -->
