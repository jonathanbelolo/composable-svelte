/**
 * Push store state into a renderer.
 *
 * This lived inside `Scene.svelte`'s store subscription, where nothing could
 * test it: the package runs under jsdom (`vite.config.ts`), Babylon needs WebGL,
 * and `Scene.svelte` built its adapter itself — so there was no seam and no
 * test has ever mounted it. Every defect on the state → renderer path was
 * therefore invisible by construction.
 *
 * Extracted as a pure function over an interface so a spy adapter can drive it
 * directly. The logic here is a verbatim move; the fixes come after.
 */

import type {
  CameraConfig,
  GeometryConfig,
  GraphicsState,
  LightConfig,
  MeshConfig
} from './types.js';

/**
 * The renderer surface the scene sync actually uses.
 *
 * Seven methods, which is all `Scene.svelte` ever called on `BabylonAdapter` —
 * `initialize` is the component's business, not the sync's. Declared as an
 * interface rather than the concrete class so a test can substitute a spy, and
 * so a second renderer backend would have a contract to meet.
 */
export interface SceneAdapter {
  updateCamera(config: CameraConfig): void;
  addMesh(config: MeshConfig): void;
  updateMesh(id: string, updates: Partial<MeshConfig>): void;
  removeMesh(id: string): void;
  addLight(config: LightConfig): void;
  updateLight(id: string, config: LightConfig): void;
  removeLight(id: string): void;
  setBackgroundColor(color: string): void;
}

/**
 * What the previous sync left behind, so the next one can tell what changed.
 *
 * Returned rather than mutated: the caller owns it, which is what lets a test
 * drive a sequence of syncs without a component.
 */
export interface SceneBaseline {
  camera: CameraConfig | null;
  meshes: readonly MeshConfig[];
  lights: readonly LightConfig[];
  backgroundColor: string | null;
}

/**
 * A baseline that has synced nothing yet.
 *
 * `camera` and `backgroundColor` are `null` rather than the store's current
 * values. Seeding them from live state is what made every `<Camera>` prop and
 * `backgroundColor` inert at mount: the children dispatch synchronously during
 * `onMount`, the subscription is established a microtask later — after
 * `await adapter.initialize(...)` — and `store.subscribe` invokes its listener
 * immediately, so the first comparison was a value against itself.
 */
export function initialBaseline(): SceneBaseline {
  return { camera: null, meshes: [], lights: [], backgroundColor: null };
}


/**
 * Geometry is plain config data — a discriminated union of primitives plus, for
 * `custom`, arrays of numbers. Structural comparison covers all of it.
 */
function sameGeometry(a: GeometryConfig, b: GeometryConfig): boolean {
  if (a === b) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Apply everything that changed since `previous`, and return the new baseline.
 */
export function syncScene(
  state: GraphicsState,
  previous: SceneBaseline,
  adapter: SceneAdapter
): SceneBaseline {
  const next: SceneBaseline = { ...previous };

  // Identity throughout, not `JSON.stringify`. Every arm of `graphicsReducer`
  // returns new objects for what it changes and the very same objects for what
  // it does not, so identity is exact — and it is O(1), which matters because a
  // running animation dispatches a `tick` per frame and stringifying every mesh
  // at 60fps is a cost that only became live once animation started working.
  //
  // This is only correct because the reducer is pure. It was not: `tick` wrote
  // through the mesh objects in place, which is what made the old comparison
  // compare a value with itself.
  if (previous.camera !== state.camera) {
    adapter.updateCamera(state.camera);
    // The state object itself, not a copy — a copy would never be identical to
    // the next one and the camera would re-sync on every dispatch.
    next.camera = state.camera;
  }

  if (previous.meshes !== state.meshes) {
    const prevMap = new Map(previous.meshes.map((m) => [m.id, m]));
    const currMap = new Map(state.meshes.map((m) => [m.id, m]));

    for (const [id] of prevMap) {
      if (!currMap.has(id)) adapter.removeMesh(id);
    }

    for (const [id, mesh] of currMap) {
      const prev = prevMap.get(id);
      if (!prev) {
        adapter.addMesh(mesh);
      } else if (prev !== mesh) {
        // A changed geometry is a different Babylon mesh, not an adjustment to
        // the existing one — `updateMesh` in the adapter handles position,
        // rotation, scale, material and visibility, and has no geometry branch,
        // so the change was silently dropped. Rebuild instead: `addMesh`
        // applies the whole config, so nothing needs preserving by hand.
        //
        // The decision belongs here rather than in the adapter, which holds
        // Babylon objects and no configs and so has nothing to compare.
        if (!sameGeometry(prev.geometry, mesh.geometry)) {
          adapter.removeMesh(id);
          adapter.addMesh(mesh);
        } else {
          adapter.updateMesh(id, mesh);
        }
      }
    }

    next.meshes = state.meshes;
  }

  if (previous.lights !== state.lights) {
    // Per light, exactly as meshes above. This used to clear and re-add *every*
    // light on any change — a full teardown for one changed intensity, which
    // became a per-frame teardown the moment `<Light>` was made reactive. It
    // could not do better: lights had no id to say which one had moved.
    const prevLights = new Map(previous.lights.map((l) => [l.id, l]));
    const currLights = new Map(state.lights.map((l) => [l.id, l]));

    for (const [id] of prevLights) {
      if (!currLights.has(id)) adapter.removeLight(id);
    }

    for (const [id, light] of currLights) {
      const prev = prevLights.get(id);
      if (!prev) {
        adapter.addLight(light);
      } else if (prev !== light) {
        adapter.updateLight(id, light);
      }
    }

    next.lights = state.lights;
  }

  if (previous.backgroundColor !== state.backgroundColor) {
    adapter.setBackgroundColor(state.backgroundColor);
    next.backgroundColor = state.backgroundColor;
  }

  return next;
}
