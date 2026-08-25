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

  <Light {store} type="directional" position={[1, 1, 1]} intensity={0.8} />

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
- `fov?`: number (field of view in degrees)
- `near?`: number
- `far?`: number

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

**Geometry Types:**
- `{ type: 'box', size: number }`
- `{ type: 'sphere', radius: number, segments?: number }`
- `{ type: 'cylinder', height: number, diameter: number }`
- `{ type: 'plane', width: number, height: number }`

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
- `position?`: [x, y, z]
- `direction?`: [x, y, z] (for spot lights)
- `angle?`: number (for spot lights)
- `intensity`: number
- `radius?`: number (for point lights)
- `color?`: string (hex color)

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
  <Light {store} type="directional" position={[5, 10, 7.5]} intensity={1} />

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
  <Light {store} type="directional" position={[5, 10, 7.5]} intensity={1.5} />

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
  it('adds mesh to scene', async () => {
    const store = new TestStore(
      createInitialGraphicsState(),
      graphicsReducer,
      {}
    );

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
        expect(state.meshes[0].id).toBe('cube-1');
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
  import { WebGLOverlay, getPreset } from '@composable-svelte/graphics';

  let overlay: WebGLOverlay | null = $state(null);
  let hero: HTMLImageElement | null = $state(null);

  function applyEffect(): void {
    if (!overlay || !hero) return;
    overlay.registerElement({
      id: 'hero',
      domElement: hero,
      shader: getPreset('ripple-gentle')
    });
  }
</script>

<WebGLOverlay bind:this={overlay} />
<img bind:this={hero} src="/hero.jpg" alt="Hero" onload={applyEffect} />
```

The single prop is `options` (`OverlayOptions`): `targetFPS`, `maxTextureSize`,
`memoryBudget`, `debug`, `handleContextLoss`, `onContextLost`,
`onContextRestored` and `onError`.

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

`examples/shader-gallery` is the worked example.

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
