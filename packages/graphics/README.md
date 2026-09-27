# @composable-svelte/graphics

State-driven 3D graphics for Composable Svelte (Babylon.js: WebGL by default, WebGPU on explicit request).

> **Unreleased — next release.** This branch adds APIs that the published `@composable-svelte/graphics` 0.3.0 does not include:
> - `graphicsVisualProvider()` and its types (`RenderAuthority`, `GraphicsVisualProvider`, `GraphicsRepresentation`,
>   `GraphicsRepresentationContext`, `GraphicsRetainedRenderer`);
> - explicit WebGPU selection (`new BabylonAdapter({ renderer: 'webgpu' })`, `BabylonAdapterOptions`);
> - the `<Scene>` `label` prop;
> - document-order canvas focus.
>
> Using `graphicsVisualProvider` for fluid motion also requires the unreleased fluid-motion APIs of `@composable-svelte/core`
> (`fluidMotion`; not in the published core 0.13.1). WebGPU selection, `label` and focus do not depend on them.
> Sections describing these additions are marked *(unreleased)*.

## Features

- ✅ **WebGL** by default: Babylon.js `Engine`. **WebGPU** on explicit request *(unreleased)*: Babylon.js `WebGPUEngine`, loaded on demand — see Renderer below.
- ✅ **State-Driven**: All scene state managed through pure reducers
- ✅ **Declarative API**: Svelte components for scene composition
- ✅ **Type-Safe**: Full TypeScript support
- ✅ **Testable**: Full TestStore support for 3D scenes

## Installation

```bash
pnpm add @composable-svelte/graphics @composable-svelte/core svelte
```

## Quick Start

<!-- consumer-file: Scene.svelte -->
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
- `store`: `GraphicsStore` (`Pick<ChildView<GraphicsState, GraphicsAction>, 'state' | 'dispatch' | 'subscribe'>`) — accepts standalone stores from `createStore` or managed child views from `defineViews`/`FeatureViews`.
- `createAdapter?`: `() => GraphicsAdapter` (optional) — creates a fresh adapter for this attachment. When omitted, `<Scene>` creates a `BabylonAdapter`. The scene owns and disposes the adapter returned by the factory; return a new instance for each mount or replacement. `initialize(canvas)` must resolve `{ renderer, capabilities }`, where `renderer` is `'webgl'` or `'webgpu'` and names the engine that actually renders, and `dispose()` must release its resources. A retired scene waits for an in-flight initialization to settle, then disposes the result once.
- `width?`: string | number (default: '100%')
- `height?`: string | number (default: '600px')
- `label?` *(unreleased)*: string (default: `'Interactive 3D scene'`). The canvas's accessible name, rendered as `role="img"` with `aria-label`. Name what the scene shows, for example `"Pavilion model — drag or use arrow keys to orbit"`.

**Input and focus** *(document-order focus unreleased)*. With `BabylonAdapter` (WebGL or WebGPU), the canvas is a real camera control: drag to orbit, the wheel to zoom, and arrow keys to orbit while it has focus. Once the camera's inputs attach, the canvas becomes focusable at `tabindex="0"`, in document order. Babylon's own default is a positive tab index, which would move the canvas ahead of the rest of the page. Before initialisation, and if initialisation fails, the canvas is not a tab stop.

`BabylonAdapter` is exported alongside these. It is the imperative class
`<Scene>` drives Babylon.js *through*, not a way of driving `<Scene>` — reach for
it when you want the engine without the component, and note that it is then
yours to create, resize and dispose. It has nothing to do with the WebGL Overlay
below, which is a separate renderer.

### `<Camera>`

Configures the scene camera.

**Props:**
- `store`: `GraphicsStore`
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
- `store`: `GraphicsStore`
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
- `store`: `GraphicsStore`
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

## Managed Application Integration

`@composable-svelte/graphics` functions both standalone and as a managed native companion with `@composable-svelte/core/application` (`defineApplication`, `ManagedIntegrationBuilder`, `defineViews`, `FeatureOutlet`).

The [managed integration guide](./MANAGED.md) records ownership, operation policy,
troubleshooting, and the runnable installed-package recipe.

All graphics components accept `GraphicsStore`, which structurally unifies standalone `Store<GraphicsState, GraphicsAction>` and managed `ChildView<GraphicsState, GraphicsAction>`.

### Managed Feature Recipe

```svelte
<!-- GraphicsFeature.svelte -->
<script lang="ts">
  import { Scene, Camera, Mesh, Light, WebGLOverlay, type GraphicsState, type GraphicsAction } from '@composable-svelte/graphics';
  import type { PresentationFeatureViewProps } from '@composable-svelte/core/application';

  let { store, surface }: PresentationFeatureViewProps<GraphicsState, GraphicsAction> = $props();
</script>

<div use:surface>
  <Scene {store} width={640} height={480}>
    <Camera {store} position={[0, 5, 10]} lookAt={[0, 0, 0]} />
    <Light {store} type="directional" intensity={1} direction={[0, -1, 0]} />
    <Mesh
      {store}
      id="cube"
      geometry={{ type: 'box', size: 1 }}
      material={{ color: '#ff4444' }}
      position={[0, 0, 0]}
    />
  </Scene>
  <WebGLOverlay owner={store} />
</div>
```

```svelte
<!-- App.svelte -->
<script lang="ts">
  import { ApplicationRoot, ApplicationHost, FeatureViews, FeatureOutlet } from '@composable-svelte/core/application';
  import { definition, views } from './model.js';
</script>

<ApplicationRoot {definition} options={{ dependencies: {}, initial: { input: undefined } }}>
  {#snippet children(app)}
    <ApplicationHost {app}>
      <FeatureViews store={app.store} definition={views}>
        {#snippet children(captured)}
          <FeatureOutlet view={captured.graphics} />
        {/snippet}
      </FeatureViews>
    </ApplicationHost>
  {/snippet}
</ApplicationRoot>
```

### Prompt Retirement Cleanup

When a managed view is retired (for example, when the parent reducer transitions state and sets the child slot to `undefined` or `null`):
- **Immediate Cancellation**: Components observe the terminal `undefined` state synchronously through subscription rather than waiting for Svelte DOM unmount or effect teardown.
- **In-flight Babylon Async Initialization**: If Babylon is still asynchronously initializing its engine when the view is retired, delivery is cancelled immediately. When the engine resolution eventually settles, it is promptly disposed (exactly once), and no late callbacks or `rendererInitialized` actions are dispatched.
- **WebGLOverlay Immediate Teardown**: When bound to a managed `owner`, `WebGLOverlay` immediately halts its animation loop and destroys WebGL shaders and textures upon retirement, preventing callback leaks.
- **Sibling Isolation**: Multiple scenes (sibling features or multiple outlets) maintain independent engine instances and render loops. Disposing or retiring one scene leaves sibling RAF loops and WebGL contexts intact.

The one exception is a canvas that a fluid-motion run is representing, described next. Without such a run, retirement behaves exactly as listed above.

### Fluid Motion: Rendering Past Retirement *(unreleased)*

*Next release.* This needs `graphicsVisualProvider` from this package and `fluidMotion` from the unreleased core fluid-motion APIs; neither is in
the published graphics 0.3.0 or core 0.13.1.

A route transition can keep an outgoing `<Scene>` or `<WebGLOverlay>` moving on screen after its feature retires. Add the package's representation provider to the application's visual configuration:

```ts
import { fluidMotion } from '@composable-svelte/core/application/motion';
import { graphicsVisualProvider } from '@composable-svelte/graphics';

export const application = defineApplication(composition, {
  initialState,
  routing,
  visual: fluidMotion({ providers: [graphicsVisualProvider()] })
});
```

No component code is needed: `<Scene>` and `<WebGLOverlay>` register their canvases once they have initialised. While a run represents a canvas, the run shows a mirror that is copied from every rendered frame. When the feature retires, render authority passes from the component to the run:

- **The store ties end at retirement.** The subscription is cut, no reducer runs and nothing dispatches. The component's render loop, camera controls, resize and position tracking stop. The overlay drops its consumer callbacks.
- **Visual progression continues.** Each run frame draws the scene. Anything the renderer advances by itself keeps moving: the engine clock, camera inertia, Babylon animatables and `onBeforeRender` observers, and overlay `uTime`/`uDeltaTime` shaders.
- **Declared animations continue visually.** `startAnimation` descriptors that were playing, such as a looping turntable, are continued from a data snapshot. They run on the reducer's own clock with the same easing and loop math, so the outgoing copy stays in phase with a destination that renders the same shared state. Every other state change ends on the last synced pose.
- **Nothing is seeded.** A destination that should show the same scene reads it from its own application state.
- **Release happens exactly once** on every path: settle, supersession, Host teardown, context loss or a render failure. The run releases the engine or GPU context. A successor run adopts the same objects without restarting them. If the context is lost during retention, drawing stops, the last frame stays, and the run is told `contextLost`.
- **Reduced motion** gives a single static frame instead.

Without a representing run, owner retirement and unmount release immediately, as before. A custom `GraphicsAdapter` takes part by implementing `renderAuthority()` (see the `RenderAuthority` type). An adapter without it is not represented by this provider, and the framework's built-in canvas mirror applies instead.

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

<!-- consumer-file: graphics.test.ts -->
```typescript
import { describe, it, expect } from 'vitest';
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
    await store.finish();
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

**Props:**
- `options?`: `OverlayOptions` — `targetFPS`, `maxTextureSize`, `memoryBudget`, `debug`, `handleContextLoss`, `onContextLost`, `onContextRestored` and `onError`.
- `owner?`: `{ readonly state: unknown; subscribe(listener: (state: unknown) => void): () => void }` — managed view or store driving this overlay's lifetime. When the owner becomes `undefined`, the overlay immediately halts its loop and destroys GPU resources.
- `attachOverlayToOwner(overlay, owner)` is also exported for programmatic binding.

`maxTextureSize` **downscales** a source larger than it, rather than refusing
one — for `<img>`, `<video>` and `<canvas>` alike, at registration and on every
re-upload. It can only narrow: a value above the driver's own maximum is clamped
to it. It must be a whole number of at least 1; anything else is reported on the
console and **ignored**, leaving the default in force.

That default is not simply the driver's answer. **On a device detected as mobile
the ceiling is `Math.min(driver, 2048)`**, deliberately, for memory and fill-rate
— so a phone reporting 4096 gets 2048 and sources are scaled accordingly. And if
the driver reports nothing usable on any device, the ceiling falls back to
**2048** rather than becoming unlimited, which can sit well below the real
maximum; that case is reported on the console.

A source with **no pixels yet** is refused with `TEXTURE_CREATION_FAILED` rather
than uploaded as an empty texture. That covers all three element types and both
directions: a `<canvas>` that has not been measured, an `<img>` registered
before it decodes, a `<video>` before its first frame — and equally a live
element that *loses* its pixels, a canvas resized to height 0 by a panel
closing, which is refused on update rather than uploaded as a zero-area texture.
The message names the element's own situation; the code is the same for all of
them. `INVALID_ELEMENT_TYPE` means something different — an element that is
genuinely the wrong kind, such as a `<div>`.

**A refusal is not permanent.** An element refused at registration retries and
succeeds once its source has pixels, so registering on mount rather than on
`load` is safe. How the retry is driven depends on the element:

| element | inferred strategy | recovers |
| --- | --- | --- |
| `<canvas>` | `manual` | on the next `updateElement(id)` |
| `<video>` | `frame` | by itself, per frame, **while it is playing** — the scheduler does not sample a paused or ended video, so call `updateElement(id)` for one that is not |
| `<img>` | `static` | on the next `updateElement(id)` |

`updateElement()` otherwise services `'manual'` elements only, and reports
anything else through `onError`; an element with **no texture yet** is the
exception, because that call asks for the first upload rather than a re-read.

An `onTextureLoaded` given at registration survives the refusal and fires once,
when the texture finally arrives. A refusal that repeats unchanged is reported
once rather than on every frame, and reports again as soon as the reason changes.

`memoryBudget` refuses with `OverlayErrorCode.MEMORY_BUDGET_EXCEEDED` through
`onError`. It retries on the same schedule as any other refusal, so an element
too big for the budget loads if the budget later has room for it.

`onError` receives an `OverlayError`; import it and `OverlayErrorCode` to narrow
on `error.code`. It reports failures to construct the overlay
(`WEBGL_NOT_SUPPORTED`, `INITIALIZATION_FAILED`), to register an element
(`INVALID_ELEMENT_TYPE`, `ELEMENT_NOT_FOUND`, `CONTEXT_LOST`), and to build a
texture or compile a shader (`CORS_TAINTED_CANVAS`, `MEMORY_BUDGET_EXCEEDED`,
`TEXTURE_CREATION_FAILED`, `SHADER_COMPILATION_FAILED`).

`registerElement(registration)` takes a **single object**: `id`, `domElement`,
`shader` (a preset name or a `CustomShaderEffect`), an optional `updateStrategy`
(`'static' | 'manual' | 'frame'`, inferred from the element type when omitted)
and an optional `onTextureLoaded`, called **once**, when the texture actually
exists.

There is no `type` — the component infers it from the element, and refuses
anything that is not an `<img>`, `<video>` or `<canvas>`. This paragraph used to
document `registerElement(id, element, options)` with a `type` option, which is
the signature of the internal `createOverlay`; that function is not exported, so
it described a call a consumer cannot make, three dozen lines below a compiled
example making the real one. That last one is how `examples/shader-gallery` knows
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

`examples/shader-gallery` is the worked example.

### Also exported

`GraphicsStore` (the structural binding interface), `GraphicsAdapter` (with required `initialize(canvas)` and `dispose()` lifecycle methods), `attachOverlayToOwner` (for attaching `WebGLOverlay` to a managed view), and `syncScene` and `initialBaseline` with the `SceneAdapter` and `SceneBaseline` types — the seam between store state and a renderer. They are what `<Scene>` drives internally, and what a second backend would implement or a test would substitute.

## Renderer

**WebGL by default, via Babylon's `Engine`. WebGPU only when you ask for it** *(WebGPU selection is unreleased — next release)*.

```svelte
<script lang="ts">
  import { Scene, BabylonAdapter } from '@composable-svelte/graphics';
</script>

<!-- Babylon's WebGPUEngine, on a real WebGPU adapter -->
<Scene {store} label="Pavilion model" createAdapter={() => new BabylonAdapter({ renderer: 'webgpu' })} />
```

- `new BabylonAdapter()` / `{ renderer: 'webgl' }` (default) builds Babylon's WebGL `Engine`.
- `{ renderer: 'webgpu' }` imports Babylon's `WebGPUEngine` on demand. It is emitted as separate lazy chunks that WebGL consumers never load (the bytes ship with the build; they are not eagerly loaded).
  It checks for WebGPU, then awaits the engine's async initialisation.
- **There is no silent fallback.** If WebGPU is unavailable, or no adapter or device can be obtained, `initialize` rejects and `<Scene>`
  dispatches `rendererError`. Retrying with WebGL is the application's explicit choice.
- `activeRenderer` names the engine that actually renders (`'webgl'` or `'webgpu'`); `capabilities.supportsWebGL` is `false`
  under WebGPU.
- Built-in materials use WGSL, so this package's meshes need no GLSL toolchain. Babylon would fetch that toolchain (glslang/twgsl) from
  its CDN only if a custom GLSL material were compiled for WebGPU. This package adds none.
- The retained representation path (`graphicsVisualProvider`) works identically for both engines. The WebGPU canvas is mirrored
  right after each frame. Camera input, `label` and focus behave as described under `<Scene>`.
- **Failure cleanup.** If WebGPU initialisation fails part-way (for example `requestDevice` rejects, or the context cannot be configured),
  the partially built engine and any allocated device are released. The error reports the original reason
  (`WebGPU initialisation failed: …`). If the engine is released while Babylon is restoring it after a device loss, the late device
  is destroyed; no restoration outlives release.

**Qualification scope.** WebGPU is qualified functionally on one real adapter: Apple Metal-3 (`isFallbackAdapter: false`), in headless
Playwright Chromium 141 on macOS with `--enable-unsafe-webgpu --use-angle=metal --enable-features=Vulkan,WebGPUService`. The qualification covers
rendering, retained progression after retirement, a real route commit, cleanup, and partial-initialisation and restoration failures. The
executable suite is [`graphics.webgpu.browser.config.ts`](./graphics.webgpu.browser.config.ts) (fixtures in [`tests/webgpu/`](./tests/webgpu/)); the independent review record is
[`remaining-webgpu-correction-astra-review.md`](../../docs/development/fluid-motion/remaining-webgpu-correction-astra-review.md). Other GPUs, operating systems and browsers were not run. No WebGPU
timing figures were measured. Headless Chromium exposes no WebGPU adapter by default, and `--enable-unsafe-webgpu` alone gives the
SwiftShader software fallback, which the suite rejects.

The history, briefly: an earlier version claimed automatic WebGPU with a WebGL fallback, while both branches built the same WebGL
`Engine` and only the label changed. The explicit option above replaces that.

```svelte
{#if $store.renderer.isInitialized}
  <p>Renderer: {$store.renderer.activeRenderer}</p>
{/if}
```

### What it costs

The figures below were measured during the fluid-motion audit, in Chromium on one machine (Apple M3 Max): hardware GL through ANGLE Metal, and software GL through SwiftShader. The measuring harness and raw results are local audit evidence and are not committed (see the evidence-retention note in the [fluid-motion acceptance README](../../docs/development/fluid-motion/README.md)). Other GPUs, drivers and browsers were not measured.

- **Bundle.** The adapter imports the Babylon modules it uses directly, not the `@babylonjs/core` barrel. Babylon marks every file as having side effects, so the barrel import bundled the whole library.
  - For an app that imports `Scene`, the eagerly loaded chunk is about 1.18 MB minified / 281 KB gzip, down from 5.75 MB / 1.26 MB with the barrel.
  - Everything emitted totals 65 chunks and about 1.85 MB minified (before: 10 chunks, 5.76 MB). Material shaders and the WebGPU engine with its WGSL shaders are split into chunks that load only on demand. The WebGPU chunks are emitted but never loaded unless `renderer: 'webgpu'` is chosen.
  - `WebGLOverlay` and the reducer do not include Babylon (about 16.6 KB and 2.4 KB gzip).
  - These figures come from Vite production builds of minimal consumers against the package build, with Svelte and core external.
- **Mounting a `Scene` (WebGL figures).** Each `<Scene>` creates its own engine and WebGL context (a WebGPU device with `renderer: 'webgpu'`, not timed). On the main thread, mounting takes about 25–35 ms cold and about 15 ms when the module is already loaded: engine and scene about 17–23 ms, scene sync about 7 ms, first frame about 5 ms.
  - In the measured after-change hardware runs (ANGLE Metal on the M3 Max, with parallel shader compilation, at DPR 1 and 2) there was no long task. One before-change hardware run at DPR 2 showed an 89 ms long task during the cold mount. This was not measured on other GPUs.
  - Under software WebGL (headless Chromium's default SwiftShader, which has no `KHR_parallel_shader_compile`), each mount shows one ~150 ms long task outside that JavaScript. Attributing it to software pipeline compilation is an inference from the hardware/software difference; the GPU process was not traced. Treat headless timings as a software-rendering worst case.
- **Fluid-motion mirror.** While a run represents a canvas, each frame is copied into its mirror. The measured figure is the main-thread time of the synchronous `drawImage` call inside the frame observer: ≤ 0.1 ms per frame on ANGLE Metal (M3 Max). That is CPU and submission time only; when the GPU completes the copy, and what it costs there, was not measured. Under SwiftShader the call is a CPU readback: about 7 ms at 960×540 and about 19 ms at 1920×1080.

### Graphics regression checks

Run `pnpm test`, `pnpm run typecheck`, and `pnpm run check` for the package gates.
`pnpm run test:browser` additionally qualifies shader pixels against Chromium
WebGL (install the Playwright Chromium browser before this check). The GPU check
is required when changing shader presets; a headless fake GL does not execute GLSL.

`pnpm exec vitest run --config graphics.webgpu.browser.config.ts` runs the isolated WebGPU suite ([config](./graphics.webgpu.browser.config.ts); unreleased): real rendering, retained
progression, a real Host route commit, and initialisation-failure cleanup. It needs a real WebGPU adapter. The configuration
passes macOS Metal launch flags; other platforms need their own flags or a headed/GPU runner. The first test fails on a software
fallback adapter, by design.

A `RenderLoop` can restart after `stop()`. `destroy()` permanently releases its
visibility listener and makes subsequent `start()` calls throw. A restarted loop
begins with a fresh FPS measurement rather than reporting a previous run's rate.

### Animation time and deterministic replay

`startAnimation` leaves `AnimationState.startTime` as `null` until the first `tick` action supplies the time origin. The framework schedules that frame; application code still supplies only animation content and the start action. Reducers do not read the wall clock. Subsequent recorded ticks determine progress, and restarting an animation resets its time origin on the next tick. A zero-duration animation completes on that first tick.

Code inspecting animation state must now handle `startTime: number | null`. Existing serialized numeric timestamps, including zero, remain authoritative. Tests that drive time manually should dispatch an initial tick before advancing relative time. The first rendered frame starts at the animation's initial pose; elapsed time no longer includes the delay between the start action and that frame.

## License

MIT
