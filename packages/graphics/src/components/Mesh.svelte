<script lang="ts">
/**
 * Mesh - Declarative 3D mesh component
 * Adds/updates mesh via store
 */

import { onDestroy, untrack } from 'svelte';
import type { Store } from '@composable-svelte/core';
import type {
  GraphicsState,
  GraphicsAction,
  GeometryConfig,
  MaterialConfig,
  MeshConfig,
  Vector3
} from '../core/types.js';

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
  rotation?: Vector3 | undefined;
  scale?: Vector3 | undefined;
  visible?: boolean | undefined;
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

/**
 * The id this component currently owns in the store, or `null` if it owns none.
 *
 * The same ownership model as `<Light>`, for the same three reasons: it decides
 * add versus update, it makes a changed `id` a rename rather than an orphan,
 * and it stops two components with one id from fighting over it.
 *
 * `onMount` dispatched `addMesh` and the effect skipped its first run through a
 * `mounted` flag — which was `$state`, so writing it inside the effect that
 * read it scheduled a second run and mount dispatched `addMesh` then
 * `updateMesh` regardless.
 */
let ownedId: string | null = null;
let warnedId: string | null = null;

$effect(() => {
  const config = meshConfig;
  untrack(() => syncToStore(config));
});

function syncToStore(config: MeshConfig): void {
  if (ownedId === config.id) {
    store.dispatch({ type: 'updateMesh', id: config.id, updates: config });
    return;
  }

  // A changed `id` used to send the update to an id the store had never heard
  // of; `updateMesh` drops those in silence, so the original mesh stayed in the
  // scene and outlived the component, whose `onDestroy` removes the new id.
  if (ownedId !== null) {
    store.dispatch({ type: 'removeMesh', id: ownedId });
    ownedId = null;
  }

  if (store.state.meshes.some((mesh) => mesh.id === config.id)) {
    if (warnedId !== config.id) {
      console.warn(
        `[graphics] <Mesh> id "${config.id}" is already in use; this mesh is inert`
      );
      warnedId = config.id;
    }
    return;
  }

  store.dispatch({ type: 'addMesh', mesh: config });

  // Claim the id only if the store actually took it.
  //
  // This used to assign unconditionally, and the reducer has more than one
  // reason to refuse: the duplicate-id check above, and — since custom geometry
  // arrived — geometry it cannot build. A component that assumed success then
  // treated every later prop change as an update to a mesh that was never
  // added, and `updateMesh` drops those, so *repairing* the geometry left the
  // mesh absent for good with no second warning.
  //
  // Asking the store costs one `.some()` and does not need the component to
  // know why it was refused, which is the part that would drift.
  ownedId = store.state.meshes.some((mesh) => mesh.id === config.id) ? config.id : null;
}

onDestroy(() => {
  if (ownedId !== null) {
    store.dispatch({ type: 'removeMesh', id: ownedId });
  }
});
</script>

<!-- Empty element for Svelte 5 snippet compatibility -->
<!-- Mesh component updates state only, no visual output -->
