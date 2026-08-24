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
  removeLight(index: number): void;
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
 * Apply everything that changed since `previous`, and return the new baseline.
 */
export function syncScene(
  state: GraphicsState,
  previous: SceneBaseline,
  adapter: SceneAdapter
): SceneBaseline {
  const next: SceneBaseline = { ...previous };

  if (JSON.stringify(previous.camera) !== JSON.stringify(state.camera)) {
    adapter.updateCamera(state.camera);
    next.camera = { ...state.camera };
  }

  if (JSON.stringify(previous.meshes) !== JSON.stringify(state.meshes)) {
    const prevMap = new Map(previous.meshes.map((m) => [m.id, m]));
    const currMap = new Map(state.meshes.map((m) => [m.id, m]));

    for (const [id] of prevMap) {
      if (!currMap.has(id)) adapter.removeMesh(id);
    }

    for (const [id, mesh] of currMap) {
      const prev = prevMap.get(id);
      if (!prev) {
        adapter.addMesh(mesh);
      } else if (JSON.stringify(prev) !== JSON.stringify(mesh)) {
        adapter.updateMesh(id, mesh);
      }
    }

    next.meshes = state.meshes;
  }

  if (JSON.stringify(previous.lights) !== JSON.stringify(state.lights)) {
    // Clear and re-add all lights. Coarse, and the reason a per-frame light
    // change would thrash.
    for (let i = previous.lights.length - 1; i >= 0; i -= 1) {
      adapter.removeLight(i);
    }
    state.lights.forEach((light) => adapter.addLight(light));

    next.lights = state.lights;
  }

  if (previous.backgroundColor !== state.backgroundColor) {
    adapter.setBackgroundColor(state.backgroundColor);
    next.backgroundColor = state.backgroundColor;
  }

  return next;
}
