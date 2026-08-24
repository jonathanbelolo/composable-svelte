/**
 * The adapter, driven against a real Babylon scene.
 *
 * Three commits in this sweep claimed this file could not exist — "jsdom cannot
 * give Babylon a WebGL context", so the spy-adapter tests covered the sync
 * contract and Babylon's own behaviour went unverified. That was wrong.
 * `NullEngine` is a headless backend that builds real `Scene`, `Mesh`,
 * `StandardMaterial` and `Light` objects with no GL at all, and it runs under
 * jsdom untouched. Every finding below was invisible only because nothing
 * looked.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NullEngine, Scene, SpotLight, StandardMaterial } from '@babylonjs/core';
import { BabylonAdapter } from '../src/adapters/babylon-adapter.js';
import type { MeshConfig } from '../src/core/types.js';

/**
 * `initialize` needs a canvas and builds its own `Engine`. Swap in a
 * `NullEngine` and run the rest of `initialize`'s work, so the adapter under
 * test is the shipped class with only its GL backend replaced.
 */
function headlessAdapter(): { adapter: BabylonAdapter; scene: Scene; engine: NullEngine } {
  const engine = new NullEngine({ renderWidth: 800, renderHeight: 600, textureSize: 512, deterministicLockstep: false, lockstepMaxSteps: 1 });
  const adapter = new BabylonAdapter();
  const scene = adapter.attachEngine(engine);
  return { adapter, scene, engine };
}

const cube = (over: Partial<MeshConfig> = {}): MeshConfig => ({
  id: 'cube',
  geometry: { type: 'box', size: 1 },
  position: [0, 0, 0],
  material: { color: '#ff0000' },
  ...over
});

describe('materials are not leaked', () => {
  let h: ReturnType<typeof headlessAdapter>;
  beforeEach(() => { h = headlessAdapter(); });
  afterEach(() => { h.adapter.dispose(); h.engine.dispose(); });

  it('does not accumulate a material per updateMesh', () => {
    h.adapter.addMesh(cube());
    const afterAdd = h.scene.materials.length;

    // What a running animation does: one `updateMesh` per frame, carrying the
    // whole config — `material` is required on `MeshConfig`, so the adapter's
    // `if (updates.material)` is true every single frame.
    for (let i = 0; i < 60; i++) {
      h.adapter.updateMesh('cube', { ...cube(), position: [i, 0, 0] });
    }

    expect(h.scene.materials.length).toBe(afterAdd);
  });

  it('disposes the mesh material when the mesh goes', () => {
    h.adapter.addMesh(cube());
    h.adapter.removeMesh('cube');

    expect(h.scene.materials.length).toBe(0);
  });

  it('does not accumulate materials across geometry rebuilds', () => {
    // The remove + add path `syncScene` uses for a changed geometry.
    for (let i = 0; i < 10; i++) {
      h.adapter.removeMesh('cube');
      h.adapter.addMesh(cube({ geometry: { type: 'box', size: i + 1 } }));
    }

    expect(h.scene.materials.length).toBe(1);
  });
});

describe('roughness reaches the pixels', () => {
  let h: ReturnType<typeof headlessAdapter>;
  beforeEach(() => { h = headlessAdapter(); });
  afterEach(() => { h.adapter.dispose(); h.engine.dispose(); });

  const materialFor = (over: Partial<MeshConfig['material']>): StandardMaterial => {
    h.adapter.addMesh(cube({ material: { color: '#808080', ...over } as MeshConfig['material'] }));
    return h.scene.getMeshByName('cube')!.material as StandardMaterial;
  };

  it('leaves a non-metallic surface a highlight to sharpen', () => {
    // Babylon's default fragment shader is `finalSpecular = specularBase *
    // specularColor`. A black `specularColor` multiplies the highlight to zero,
    // so `specularPower` cannot affect a single pixel — and `metallic: 0.0` is
    // what the skill file teaches for plastic, rubber, wood, stone and glass.
    const m = materialFor({ metallic: 0.0, roughness: 0.2 });

    expect(m.specularColor.r).toBeGreaterThan(0);
  });

  it('separates a rough non-metal from a smooth one', () => {
    const rough = materialFor({ metallic: 0.0, roughness: 0.9 });
    h.adapter.removeMesh('cube');
    const smooth = materialFor({ metallic: 0.0, roughness: 0.1 });

    // Differing in *some* visible channel: tightness, brightness, or both.
    const differs =
      rough.specularPower !== smooth.specularPower &&
      rough.specularColor.r !== smooth.specularColor.r;
    expect(differs).toBe(true);
  });
});

describe('lights are updated, not reconstructed', () => {
  let h: ReturnType<typeof headlessAdapter>;
  beforeEach(() => { h = headlessAdapter(); });
  afterEach(() => { h.adapter.dispose(); h.engine.dispose(); });

  it('keeps the same Babylon light across an intensity change', () => {
    h.adapter.addLight({ id: 'key', type: 'point', position: [0, 1, 0], intensity: 1 });
    const before = h.scene.lights[0];

    for (let i = 0; i < 30; i++) {
      h.adapter.updateLight('key', { id: 'key', type: 'point', position: [0, 1, 0], intensity: i / 30 });
    }

    // Dispose-and-rebuild churns `scene.lights` and marks every affected mesh's
    // submeshes light-dirty; assigning `intensity` is a uniform write.
    expect(h.scene.lights.length).toBe(1);
    expect(h.scene.lights[0]).toBe(before);
    expect(h.scene.lights[0]!.intensity).toBeCloseTo(29 / 30);
  });

  it('rebuilds when the type changes, because that is a different class', () => {
    h.adapter.addLight({ id: 'key', type: 'point', position: [0, 1, 0], intensity: 1 });
    h.adapter.updateLight('key', { id: 'key', type: 'directional', position: [0, -1, 0], intensity: 1 });

    expect(h.scene.lights.length).toBe(1);
    expect(h.scene.lights[0]!.getClassName()).toBe('DirectionalLight');
  });

  it('does not mistake a spot light for the point light it extends', () => {
    // `SpotLight extends PointLight`, so an `instanceof PointLight` test put
    // first would update a spot light as a point light and silently drop its
    // angle and direction.
    h.adapter.addLight({ id: 's', type: 'spot', position: [0, 5, 0], direction: [0, -1, 0], angle: 0.5, intensity: 1 });
    const before = h.scene.lights[0];
    h.adapter.updateLight('s', { id: 's', type: 'spot', position: [0, 5, 0], direction: [0, -1, 0], angle: 1.2, intensity: 1 });

    expect(h.scene.lights[0]).toBe(before);
    expect((h.scene.lights[0] as SpotLight).angle).toBeCloseTo(1.2);
  });
});

describe('the camera tracks the viewport', () => {
  let h: ReturnType<typeof headlessAdapter>;
  beforeEach(() => { h = headlessAdapter(); });
  afterEach(() => { h.adapter.dispose(); h.engine.dispose(); });

  it('recomputes orthographic bounds when the viewport changes shape', () => {
    h.adapter.updateCamera({ type: 'orthographic', position: [0, 0, 10], lookAt: [0, 0, 0], orthoSize: 5 });
    const camera = h.scene.activeCamera!;
    const widthBefore = camera.orthoRight! - camera.orthoLeft!;

    // 800×600 → 400×600: the aspect halves, so the framed width must halve too,
    // or the scene stretches. Bounds were computed once in `updateCamera` and
    // never again, and the resize handler only called `engine.resize()`.
    //
    // Driven through the getter `updateCamera` actually reads: `NullEngine`
    // fixes its render size at construction and its `setSize` is a no-op.
    h.engine.getRenderWidth = () => 400;
    window.dispatchEvent(new Event('resize'));

    expect(camera.orthoRight! - camera.orthoLeft!).toBeCloseTo(widthBefore / 2);
  });
});

describe('the material is a function of the config, not of history', () => {
  let h: ReturnType<typeof headlessAdapter>;
  beforeEach(() => { h = headlessAdapter(); });
  afterEach(() => { h.adapter.dispose(); h.engine.dispose(); });

  it('clears a field that the config stopped setting', () => {
    h.adapter.addMesh(cube({ material: { color: '#ff0000', wireframe: true, alpha: 0.5 } }));
    h.adapter.updateMesh('cube', { material: { color: '#ff0000' } });

    const m = h.scene.getMeshByName('cube')!.material as StandardMaterial;
    // Reusing the material makes this a real risk: with a fresh one per call,
    // an omitted field fell back to Babylon's default for free.
    expect(m.wireframe).toBe(false);
    expect(m.alpha).toBe(1);
  });
});
