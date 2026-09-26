<script lang="ts">
/**
 * Mesh - Declarative 3D mesh component
 * Adds/updates mesh via store
 */

import { onDestroy, untrack } from 'svelte';
import { customGeometryProblem } from '../core/geometry.js';
import type {
  GraphicsStore,
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
  store: GraphicsStore;
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
let warnedGeometry: string | null = null;

$effect(() => {
  const config = meshConfig;
  // Dispatch reads the store internally. Tracking it here would make the
  // effect follow its own writes instead of only the mesh props.
  untrack(() => syncToStore(config));
});

function syncToStore(config: MeshConfig): void {
  if (!store.state) {
    ownedId = null;
    return;
  }

  // Refused geometry is caught here, not only by the reducer — and *before* the
  // ownership branch below, because both paths retry a refusal forever.
  const problem = customGeometryProblem(config.geometry);
  if (problem) {
    // A rename to invalid geometry must release the old mesh. Returning while
    // retaining its id leaves an object this component can no longer remove.
    if (ownedId !== null && ownedId !== config.id) {
      if (store.state) {
        store.dispatch({ type: 'removeMesh', id: ownedId });
      }
      ownedId = null;
    }

    const complaint = `${config.id}: ${problem}`;
    if (warnedGeometry !== complaint) {
      console.warn(
        `[graphics] <Mesh> id "${config.id}" has invalid custom geometry (${problem}); this mesh is inert`
      );
      warnedGeometry = complaint;
    }
    return;
  }
  warnedGeometry = null;

  if (ownedId === config.id) {
    store.dispatch({ type: 'updateMesh', id: config.id, updates: config });
    return;
  }

  if (ownedId !== null) {
    if (store.state) {
      store.dispatch({ type: 'removeMesh', id: ownedId });
    }
    ownedId = null;
  }

  if (!store.state) return;

  if (store.state.meshes.some((mesh) => mesh.id === config.id)) {
    // Duplicate ids must stand aside: the reducer's update path affects every
    // matching mesh and would let the two components fight over one identity.
    if (warnedId !== config.id) {
      console.warn(
        `[graphics] <Mesh> id "${config.id}" is already in use; this mesh is inert`
      );
      warnedId = config.id;
    }
    return;
  }

  store.dispatch({ type: 'addMesh', mesh: config });

  // The reducer can refuse a mesh for reasons beyond the local geometry check.
  // Claim ownership only after the store actually contains the new identity.
  ownedId = store.state?.meshes.some((mesh) => mesh.id === config.id) ? config.id : null;
}

onDestroy(() => {
  if (ownedId !== null && store.state) {
    store.dispatch({ type: 'removeMesh', id: ownedId });
  }
});
</script>

<!-- Empty element for Svelte 5 snippet compatibility -->
<!-- Mesh component updates state only, no visual output -->
