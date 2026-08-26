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

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NullEngine, Scene, SpotLight, StandardMaterial, DirectionalLight } from '@babylonjs/core';
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
    h.adapter.updateLight('key', { id: 'key', type: 'directional', direction: [0, -1, 0], intensity: 1 });

    expect(h.scene.lights.length).toBe(1);
    expect(h.scene.lights[0]!.getClassName()).toBe('DirectionalLight');
  });

  it('gives a directional light the direction it was configured with', () => {
    // The Babylon half of the `position` → `direction` rename had no test at
    // all: hardcoding the vector at either the create or the update site left
    // the whole suite green, so the rename could have been reverted at this
    // boundary without anything noticing. `light-reactivity.test.ts` asserts
    // what reaches the *store*; this asserts what reaches the scene.
    h.adapter.addLight({ id: 'key', type: 'directional', direction: [1, -2, 3], intensity: 1 });

    const light = h.scene.getLightByName('directional-key') as DirectionalLight | null;
    expect(light, 'no directional light was created').not.toBeNull();
    expect(
      [light!.direction.x, light!.direction.y, light!.direction.z],
      'the configured direction never reached Babylon'
    ).toEqual([1, -2, 3]);
  });

  it('moves an existing directional light rather than ignoring the change', () => {
    h.adapter.addLight({ id: 'key', type: 'directional', direction: [1, 0, 0], intensity: 1 });

    h.adapter.updateLight('key', {
      id: 'key',
      type: 'directional',
      direction: [0, 0, -1],
      intensity: 1
    });

    const light = h.scene.getLightByName('directional-key') as DirectionalLight;
    expect(
      [light.direction.x, light.direction.y, light.direction.z],
      'updateLight ignored the new direction'
    ).toEqual([0, 0, -1]);
  });

  it('updates a spot light in place when only its angle changed', () => {
    // A type-preserving change must not rebuild.
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

  it('applies orthographic bounds at all', () => {
    // The test below asserted only that a *difference* halved, and
    // `null - null` is `0`, so `0 ≈ 0 / 2` passed against an
    // `applyOrthographicBounds` that did nothing whatsoever. Babylon falls back
    // to the engine viewport in pixels when any edge is left null, so "no
    // bounds" is not a harmless default.
    h.adapter.updateCamera({ type: 'orthographic', position: [0, 0, 10], lookAt: [0, 0, 0], orthoSize: 5 });
    const camera = h.scene.activeCamera!;

    expect(camera.orthoTop, 'orthoTop was never set').toBe(5);
    expect(camera.orthoBottom).toBe(-5);
    // 800×600 → aspect 4/3 → half-width 6.667.
    expect(camera.orthoRight!).toBeCloseTo(20 / 3);
    expect(camera.orthoLeft!).toBeCloseTo(-20 / 3);
  });

  it('recomputes orthographic bounds when the viewport changes shape', () => {
    h.adapter.updateCamera({ type: 'orthographic', position: [0, 0, 10], lookAt: [0, 0, 0], orthoSize: 5 });
    const camera = h.scene.activeCamera!;
    const widthBefore = camera.orthoRight! - camera.orthoLeft!;
    expect(widthBefore, 'there were no bounds to recompute').toBeGreaterThan(0);

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

describe('resize recomputes only what the viewport decides', () => {
	let h: ReturnType<typeof headlessAdapter>;
	beforeEach(() => { h = headlessAdapter(); });
	afterEach(() => { h.adapter.dispose(); h.engine.dispose(); });

	it('leaves a camera the user has moved where they put it', () => {
		// The paired half of the orthographic-bounds test above, and the reason
		// it is needed: `initialize` hands the `ArcRotateCamera` to the user via
		// `attachControl`, so the store config is a starting point, not a leash.
		// Re-applying the whole config on resize snapped the camera back — and
		// `resize` fires continuously while a window is dragged, and on every
		// mobile orientation change.
		h.adapter.updateCamera({ type: 'perspective', position: [0, 5, 10], lookAt: [0, 0, 0] });
		const camera = h.scene.activeCamera as import('@babylonjs/core').ArcRotateCamera;

		camera.alpha = 2.77;
		camera.beta = 0.9;
		camera.radius = 25;
		h.scene.render();
		const moved = camera.position.clone();

		window.dispatchEvent(new Event('resize'));
		h.scene.render();

		expect(camera.radius, 'the resize reset the camera the user moved').toBeCloseTo(25);
		expect(camera.position.x).toBeCloseTo(moved.x);
		expect(camera.position.z).toBeCloseTo(moved.z);
	});
});

describe('a light is the same whether it was added or updated', () => {
	let h: ReturnType<typeof headlessAdapter>;
	beforeEach(() => { h = headlessAdapter(); });
	afterEach(() => { h.adapter.dispose(); h.engine.dispose(); });

	it('gives radius: 0 the same meaning on both paths', () => {
		// `addLight` used `if (config.radius)`, which skips 0 and leaves Babylon's
		// infinite default; `updateLight` used `?? Number.MAX_VALUE`, which
		// honours it. The same config produced a light that lit everything or
		// nothing, depending only on which path it arrived by.
		h.adapter.addLight({ id: 'p', type: 'point', position: [0, 1, 0], intensity: 1, radius: 0 });
		const added = (h.scene.lights[0] as import('@babylonjs/core').PointLight).range;

		h.adapter.updateLight('p', {
			id: 'p', type: 'point', position: [0, 1, 0], intensity: 1, radius: 0
		});
		const updated = (h.scene.lights[0] as import('@babylonjs/core').PointLight).range;

		expect(updated).toBe(added);
	});

	it('rebuilds a spot light back into a point light', () => {
		// The paired half: a change of `type` is a different Babylon class, and
		// updating it in place would leave a cone where the config asked for an
		// omnidirectional light.
		h.adapter.addLight({
			id: 'l', type: 'spot', position: [0, 5, 0], direction: [0, -1, 0], angle: 0.5, intensity: 1
		});
		h.adapter.updateLight('l', { id: 'l', type: 'point', position: [0, 5, 0], intensity: 1 });

		expect(h.scene.lights[0]!.getClassName()).toBe('PointLight');
	});
});

describe('the adapter says something when it cannot do what was asked', () => {
  let h: ReturnType<typeof headlessAdapter>;
  beforeEach(() => { h = headlessAdapter(); });
  afterEach(() => { h.adapter.dispose(); h.engine.dispose(); vi.restoreAllMocks(); });

  it('warns once, not per frame, for a colour it cannot parse', () => {
    // `applyMaterial` runs on every `updateMesh`, and `syncScene` passes the
    // whole `MeshConfig` — whose `material` is required — so an animated mesh
    // reaches `hexToColor3` per frame. Warning unconditionally turned one bad
    // colour into 60 console lines a second, burying the message.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    h.adapter.addMesh(cube({ material: { color: 'red' } }));

    for (let i = 0; i < 60; i++) {
      h.adapter.updateMesh('cube', { ...cube({ material: { color: 'red' } }), position: [i, 0, 0] });
    }

    expect(warn.mock.calls.filter((c) => String(c[0]).includes('not a 6-digit hex'))).toHaveLength(1);
  });

  it('still warns for a different unparseable colour', () => {
    // The paired half: warn-once must be per value, not once ever.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    h.adapter.addMesh(cube({ material: { color: 'red' } }));
    h.adapter.addMesh(cube({ id: 'other', material: { color: 'rgb(1,2,3)' } }));

    expect(warn.mock.calls.filter((c) => String(c[0]).includes('not a 6-digit hex'))).toHaveLength(2);
  });

  it('refuses to silently rebind to a different engine', () => {
    // `attachEngine` is a public export. Returning the existing scene without a
    // word would hand back one bound to the *old* engine, so viewport-derived
    // state — the orthographic bounds — would keep following an engine the
    // caller believes it replaced.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const other = new NullEngine({ renderWidth: 400, renderHeight: 400, textureSize: 512, deterministicLockstep: false, lockstepMaxSteps: 1 });

    const returned = h.adapter.attachEngine(other);

    expect(returned, 'a second scene was built on the same adapter').toBe(h.scene);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('already attached'));
    other.dispose();
  });

  it('says nothing when re-attached to the engine it already has', () => {
    // The paired half: idempotence is not an error.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(h.adapter.attachEngine(h.engine)).toBe(h.scene);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('an adapter is initialized once', () => {
  let h: ReturnType<typeof headlessAdapter>;
  beforeEach(() => { h = headlessAdapter(); });
  afterEach(() => { h.adapter.dispose(); h.engine.dispose(); vi.restoreAllMocks(); });

  it('does not start a second render loop, and says why', async () => {
    // `initialize` used to register a fresh `runRenderLoop` closure every call.
    // Babylon dedupes render loops by function identity, so a new closure each
    // time defeated it and the scene rendered twice per frame — while
    // `attachControl` bound to a canvas the engine was not drawing to.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const canvas = document.createElement('canvas');

    // `headlessAdapter` has already attached an engine and built a scene, which
    // is what `initialize` treats as "already running".
    await h.adapter.initialize(canvas);

    expect(
      (h.engine as unknown as { _activeRenderLoops: unknown[] })._activeRenderLoops
    ).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('already initialized'));
  });
});

describe('the unparseable-colour warning is bounded', () => {
  let h: ReturnType<typeof headlessAdapter>;
  beforeEach(() => { h = headlessAdapter(); });
  afterEach(() => { h.adapter.dispose(); h.engine.dispose(); vi.restoreAllMocks(); });

  const badColours = (n: number) =>
    Array.from({ length: n }, (_, i) => `hsl(${i}, 50%, 50%)`);

  it('stops after the cap, with one notice', () => {
    // The set is keyed by the bad value itself, and the path this warning exists
    // for is the animated one — where the colour *varies*, so every frame is a
    // new key. 1800 distinct values produced 1800 warnings and 1800 retained
    // strings: a leak fix that leaked.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    badColours(200).forEach((color, i) => {
      h.adapter.addMesh(cube({ id: `m${i}`, material: { color } }));
    });

    const messages = warn.mock.calls.map((c) => String(c[0]));
    expect(messages.filter((m) => m.includes('not a 6-digit hex'))).toHaveLength(20);
    expect(messages.filter((m) => m.includes('suppressing further warnings'))).toHaveLength(1);
  });

  it('is not confused by a colour that looks like its own bookkeeping', () => {
    // The cap used to be recorded by adding a `'__capped__'` sentinel to the
    // very set that holds consumer colour strings. Passing that string kept
    // `size` pinned at the cap — `Set.add` of an existing member does not grow
    // it — so the "suppressing" notice fired once per distinct colour after it.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    h.adapter.addMesh(cube({ id: 'sentinel', material: { color: '__capped__' } }));
    badColours(60).forEach((color, i) => {
      h.adapter.addMesh(cube({ id: `m${i}`, material: { color } }));
    });

    const suppressions = warn.mock.calls
      .map((c) => String(c[0]))
      .filter((m) => m.includes('suppressing further warnings'));
    expect(suppressions, 'the notice repeated').toHaveLength(1);
  });
});
