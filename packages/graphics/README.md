# @composable-svelte/graphics

State-driven WebGL graphics package for Composable Svelte.

## Features

- ✅ **WebGL**: Babylon.js `Engine`. WebGPU is *not* implemented — see Renderer below.
- ✅ **State-Driven**: All scene state managed through pure reducers
- ✅ **Declarative API**: Svelte components for scene composition
- ✅ **Type-Safe**: Full TypeScript support
- ✅ **Testable**: Full TestStore support for 3D scenes

## Installation

```bash
pnpm add @composable-svelte/graphics @composable-svelte/core svelte
```

## Quick Start

```svelte
<script lang="ts">
  import { createStore } from '@composable-svelte/core';
  import {
    Scene,
    Camera,
    Mesh,
    Light,
    graphicsReducer,
    createInitialGraphicsState
  } from '@composable-svelte/graphics';

  const store = createStore({
    initialState: createInitialGraphicsState(),
    reducer: graphicsReducer,
    dependencies: {}
  });

  function rotateCube() {
    store.dispatch({
      type: 'setMeshRotation',
      id: 'cube-1',
      rotation: [0, Math.PI / 4, 0]
    });
  }
</script>

<Scene {store}>
  <Camera {store} position={[0, 0, 10]} lookAt={[0, 0, 0]} />

  <Light {store} type="directional" direction={[1, 1, 1]} intensity={0.8} />

  <Mesh
    {store}
    id="cube-1"
    geometry={{ type: 'box', size: 2 }}
    material={{ color: '#ff6b6b', metallic: 0.5 }}
    position={[0, 0, 0]}
    rotation={$store.meshes.find(m => m.id === 'cube-1')?.rotation}
  />
</Scene>

<button onclick={rotateCube}>Rotate Cube</button>
```

## Components

### `<Scene>`

Root component that manages the Babylon.js engine and renders the 3D scene.

**Props:**
- `store`: Store<GraphicsState, GraphicsAction>
- `width?`: string | number (default: '100%')
- `height?`: string | number (default: '600px')

### `<Camera>`

Configures the scene camera.

**Props:**
- `store`: Store<GraphicsState, GraphicsAction>
- `type?`: 'perspective' | 'orthographic' (default: 'perspective')
- `position`: [x, y, z]
- `lookAt`: [x, y, z]
- `fov?`: number (field of view in degrees, perspective only)
- `near?`: number
- `far?`: number
- `orthoSize?`: number (orthographic only) — half-height of the view volume

### `<Mesh>`

Renders a 3D mesh in the scene.

**Props:**
- `store`: Store<GraphicsState, GraphicsAction>
- `id`: string
- `geometry`: GeometryConfig
- `material`: MaterialConfig
- `position`: [x, y, z]
- `rotation?`: [x, y, z] (Euler angles in radians)
- `scale?`: [x, y, z]
- `visible?`: boolean

**Geometry Types:** six, not the four this list carried until recently — `torus`
was missing while the styleguide's own demo rendered one, and `custom` was
missing because the commit that implemented it touched no documentation at all.

- `{ type: 'box', size: number }`
- `{ type: 'sphere', radius: number, segments?: number }`
- `{ type: 'cylinder', height: number, diameter: number }`
- `{ type: 'plane', width: number, height: number }`
- `{ type: 'torus', diameter: number, thickness: number, segments?: number }`
- `{ type: 'custom', vertices: number[], indices: number[], normals?: number[], uvs?: number[] }`

**Custom geometry** is validated before it enters the store, and a mesh that
fails validation is **warned about and ignored** — it does not reach
`state.meshes`, so nothing renders and no later `updateMesh` for that id has any
effect. The rules:

| rule | why |
|---|---|
| `vertices` and `indices` are both non-empty | an empty array passes every other rule here — 0 is a multiple of 3, and "every index is in range" is vacuous — so without this an empty mesh would be admitted and draw nothing |
| `vertices.length` is a multiple of 3 | they are xyz triples |
| `indices.length` is a multiple of 3 | they are triangles |
| every index is a whole number in `0 .. vertices.length / 3 - 1` | Babylon truncates a float index through a `Uint16Array` and silently draws a different triangle |
| every value in `vertices`, `normals` and `uvs` is finite | one `NaN` makes Babylon's computed normals `NaN` for all three vertices of any triangle touching it |
| `normals.length === vertices.length`, if given | one normal per vertex |
| `uvs.length === vertices.length / 3 * 2`, if given | two per vertex; getting this wrong mistextures every face without erroring |

Normals are computed for you when omitted.

**Material:**
- `color`: string (hex color)
- `metallic?`: number (0-1)
- `roughness?`: number (0-1)
- `emissive?`: string (hex color)
- `alpha?`: number (0-1)
- `wireframe?`: boolean

### `<Light>`

Adds lighting to the scene.

**Props:**
- `store`: Store<GraphicsState, GraphicsAction>
- `id?`: string — stable identity. Generated per component instance when
  omitted, so existing markup is unaffected; supply one to address the light
  from outside the component. Must be unique.
- `type`: 'directional' | 'point' | 'spot' | 'ambient'
- `intensity`: number
- `color?`: string (hex color)

The rest of the props are **discriminated by `type`** — passing one that does
not belong to the type you asked for is a compile error rather than a silent
drop:

| `type` | takes |
|---|---|
| `ambient` | nothing further |
| `directional` | `direction?` — the direction the light travels in. A directional light has no position |
| `point` | `position?`, `radius?` |
| `spot` | `position?`, `direction?`, `angle?` (radians) |

`direction` on `directional` was called `position` until recently. It never was
one: the adapter passed it straight into Babylon's direction argument.

## State Management

The graphics package follows the Composable Architecture pattern:

```typescript
// State
interface GraphicsState {
  sceneId: string;
  renderer: RendererState;
  camera: CameraConfig;
  lights: LightConfig[];
  meshes: MeshConfig[];
  animations: AnimationState[];
  backgroundColor: string;
  isLoading: boolean;
}

// Actions
type GraphicsAction =
  | { type: 'addMesh'; mesh: MeshConfig }
  | { type: 'updateMesh'; id: string; updates: Partial<MeshConfig> }
  | { type: 'setMeshRotation'; id: string; rotation: Vector3 }
  | { type: 'updateCamera'; camera: Partial<CameraConfig> }
  | { type: 'addLight'; light: LightConfig }
  | { type: 'setBackgroundColor'; color: string }
  // ... more actions
```

## Examples

### Rotating Cube

```svelte
<script lang="ts">
  const store = createStore({
    initialState: createInitialGraphicsState(),
    reducer: graphicsReducer,
    dependencies: {}
  });

  function startRotation() {
    store.dispatch({
      type: 'startAnimation',
      animation: {
        id: 'rotate-cube',
        targetId: 'cube-1',
        property: 'rotation',
        from: [0, 0, 0],
        to: [0, Math.PI * 2, 0],
        duration: 2000,
        easing: 'linear',
        loop: true
      }
    });
  }
</script>

<Scene {store}>
  <Camera {store} position={[0, 0, 10]} lookAt={[0, 0, 0]} />
  <Light {store} type="ambient" intensity={0.5} />
  <Light {store} type="directional" direction={[5, 10, 7.5]} intensity={1} />

  <Mesh
    {store}
    id="cube-1"
    geometry={{ type: 'box', size: 2 }}
    material={{ color: '#4ecdc4', metallic: 0.7, roughness: 0.3 }}
    position={[0, 0, 0]}
  />
</Scene>

<button onclick={startRotation}>Start Rotation</button>
```

### Multiple Meshes

```svelte
<Scene {store}>
  <Camera {store} position={[0, 5, 10]} lookAt={[0, 0, 0]} />
  <Light {store} type="ambient" intensity={0.3} />
  <Light {store} type="directional" direction={[5, 10, 7.5]} intensity={1.5} />

  <!-- Cube -->
  <Mesh
    {store}
    id="cube"
    geometry={{ type: 'box', size: 1 }}
    material={{ color: '#ff6b6b' }}
    position={[-2, 0, 0]}
  />

  <!-- Sphere -->
  <Mesh
    {store}
    id="sphere"
    geometry={{ type: 'sphere', radius: 0.75 }}
    material={{ color: '#4ecdc4' }}
    position={[0, 0, 0]}
  />

  <!-- Cylinder -->
  <Mesh
    {store}
    id="cylinder"
    geometry={{ type: 'cylinder', height: 2, diameter: 0.5 }}
    material={{ color: '#95e1d3' }}
    position={[2, 0, 0]}
  />
</Scene>
```

## Testing

```typescript
import { TestStore } from '@composable-svelte/core/test';
import { graphicsReducer, createInitialGraphicsState } from '@composable-svelte/graphics';

describe('Graphics Reducer', () => {
  it('adds a mesh to the scene', async () => {
    const store = new TestStore({
      initialState: createInitialGraphicsState(),
      reducer: graphicsReducer,
      dependencies: {}
    });

    await store.send(
      {
        type: 'addMesh',
        mesh: {
          id: 'cube-1',
          geometry: { type: 'box', size: 1 },
          material: { color: '#ff6b6b' },
          position: [0, 0, 0]
        }
      },
      (state) => {
        expect(state.meshes).toHaveLength(1);
        expect(state.meshes[0]?.id).toBe('cube-1');
      }
    );
  });
});
```

## WebGL Overlay

Separate from the declarative scene API above, the package exports
`<WebGLOverlay>`: a full-viewport WebGL canvas that runs shader effects over
ordinary DOM elements. An `<img>`, `<video>` or `<canvas>` already in your
layout keeps its place in the document, and the overlay draws over it.

**It is an imperative escape hatch, not part of the architecture.** It holds no
store, dispatches no actions and imports nothing from `@composable-svelte/core`.
It is driven through methods on a `bind:this` reference, so if you want a reducer
in charge of it, call those methods from an effect.

```svelte
<script lang="ts">
  import { WebGLOverlay } from '@composable-svelte/graphics';

  let overlay: WebGLOverlay | null = $state(null);
  let hero: HTMLImageElement | null = $state(null);

  function applyEffect(): void {
    if (!overlay || !hero) return;
    overlay.registerElement({
      id: 'hero',
      domElement: hero,
      shader: 'ripple-gentle'
    });
  }
</script>

<WebGLOverlay bind:this={overlay} />
<img bind:this={hero} src="/hero.jpg" alt="Hero" onload={applyEffect} />
```

The single prop is `options` (`OverlayOptions`): `targetFPS`, `maxTextureSize`,
`memoryBudget`, `debug`, `handleContextLoss`, `onContextLost`,
`onContextRestored` and `onError`.

`maxTextureSize` **downscales** a source larger than it, rather than refusing
one — for `<img>`, `<video>` and `<canvas>` alike, at registration and on every
re-upload. It can only narrow: a value above the driver's own maximum is clamped
to it. It must be a whole number of at least 1; anything else is reported on the
console and **ignored**, leaving the driver limit in force. If the driver
reports nothing usable the ceiling falls back to **2048** rather than becoming
unlimited — which can sit well below the real device maximum, and is reported
too.

A source with a zero dimension — a `<canvas>` that has not been measured yet —
is refused with `TEXTURE_CREATION_FAILED` rather than uploaded as a texture with
no pixels.

`memoryBudget` is the option that refuses outright, with
`OverlayErrorCode.MEMORY_BUDGET_EXCEEDED` through `onError`.

`onError` receives an `OverlayError`; import it and `OverlayErrorCode` to narrow
on `error.code`. It reports failures to construct the overlay
(`WEBGL_NOT_SUPPORTED`, `INITIALIZATION_FAILED`), to register an element
(`INVALID_ELEMENT_TYPE`, `ELEMENT_NOT_FOUND`, `CONTEXT_LOST`), and to build a
texture or compile a shader (`CORS_TAINTED_CANVAS`, `MEMORY_BUDGET_EXCEEDED`,
`TEXTURE_CREATION_FAILED`, `SHADER_COMPILATION_FAILED`).

`registerElement(id, element, options)` takes `type` (`'image' | 'video' |
'canvas'`), `shader` (a preset name or a `CustomShaderEffect`), an optional
`updateStrategy` (`'static' | 'manual' | 'frame'` — inferred from the element
type when omitted) and an optional `onTextureLoaded`, called **once**, when the
texture actually exists. That last one is how `examples/shader-gallery` knows
when to fade the DOM `<img>` out; it fires whether the texture was built
immediately or deferred because the context was lost at registration time, and
it does not fire again on a later restore.

The methods are `registerElement` and `unregisterElement`; `updateElementShader`
(recompile) and `updateUniforms` (feed the existing program new values);
`updateElement` (re-read the pixels — the trigger for the `manual` update
strategy a `<canvas>` gets by default) and `updateElementPosition` (re-read the
bounds after a transform); `getElement`, `getElements`, `getCanvas`,
`getContext` and `getCurrentFPS`; and `start`, `stop` and `isRunning`. Only
`<img>`, `<video>` and `<canvas>` elements can be registered.

21 shader presets ship with it — `ripple-*`, `wave-*`, `pixelate-*`, `blur-*`,
`glitch-*` and `zoom-*`. `getAllPresetNames()` lists them, `getPresetMetadata()`
describes one, and `createRippleEffect` and its five siblings build effects the
fixed presets do not cover.

`BabylonAdapter` is also exported, for driving a `<Scene>` directly rather than
through the component.

`examples/shader-gallery` is the worked example.

### Also exported

`syncScene` and `initialBaseline`, with the `SceneAdapter` and `SceneBaseline`
types — the seam between store state and a renderer. They are what
`<Scene>` drives internally, and what a second backend would implement or a test
would substitute.

## Renderer

**WebGL, via Babylon's `Engine`. Always.**

This used to claim automatic WebGPU with a WebGL fallback. It never did that:
both branches of the "detection" constructed the same `new Engine(canvas, …)`,
and the WebGPU branch's own comment said Babylon would handle it. Detecting a
WebGPU adapter changed no rendering — only the label reported as
`renderer.activeRenderer`, which said `webgpu` while WebGL ran, alongside
`supportsWebGL: false`.

Real WebGPU means Babylon's `WebGPUEngine` and its separate async
initialisation. That is unbuilt, and recorded as a gap rather than claimed.
`activeRenderer` now reports `'webgl'`, which is what is running.

```svelte
{#if $store.renderer.isInitialized}
  <p>Renderer: {$store.renderer.activeRenderer}</p>
{/if}
```

## License

MIT
