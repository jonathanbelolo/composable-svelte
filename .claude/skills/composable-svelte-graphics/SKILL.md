---
name: composable-svelte-graphics
description: 3D graphics and WebGL rendering with Composable Svelte. Use when building 3D scenes, working with cameras, lights, meshes, materials, or implementing WebGL graphics. Covers Scene, Camera, Light, Mesh components, geometry types (box, sphere, cylinder, torus, plane), material properties, and state-driven 3D rendering.
---

# Composable Svelte Graphics

State-driven 3D graphics for Composable Svelte using WebGL with Babylon.js.

---

## PACKAGE OVERVIEW

**Package**: `@composable-svelte/graphics`

**Purpose**: Declarative 3D graphics over Babylon.js, driven entirely by store state.

**Technology Stack**:
- **Babylon.js**: Industry-standard 3D engine
- **WebGL**: Babylon's `Engine`, which is what this package renders through

**Renderer**:
There is one renderer, and it is WebGL. This file used to describe automatic
WebGPU detection with a transparent WebGL fallback; that never happened. Both
branches of the "detection" constructed the same `new Engine(canvas, …)` — the
WebGPU branch's own comment said Babylon would handle it — so finding a WebGPU
adapter changed no rendering at all. It changed the *label*, which the store
surfaced as `renderer.activeRenderer`: it reported `webgpu`, with
`supportsWebGL: false`, while WebGL ran.

Real WebGPU means Babylon's `WebGPUEngine` and its own async initialisation.
Nobody built that, so it is recorded as a gap rather than claimed.

**Core Components**:
- `Scene` - Root container, manages renderer lifecycle
- `Camera` - Viewpoint and projection
- `Light` - Illumination (ambient, directional, point, spot)
- `Mesh` - 3D objects with geometry and materials

**State Management**:
- `graphicsReducer` - Pure reducer for all graphics state
- `createInitialGraphicsState()` - Initial state factory
- Store-driven updates sync automatically to Babylon.js

---

## QUICK START

```typescript
import { createStore } from '@composable-svelte/core';
import {
  Scene,
  Camera,
  Light,
  Mesh,
  graphicsReducer,
  createInitialGraphicsState
} from '@composable-svelte/graphics';

// Create graphics store
const store = createStore({
  initialState: createInitialGraphicsState({
    backgroundColor: '#1a1a2e'
  }),
  reducer: graphicsReducer,
  dependencies: {}
});

// Track rotation for animation
let rotation = $state(0);

function rotateShapes() {
  rotation += Math.PI / 4;
}

// Render 3D scene
<Scene {store} height="500px">
  <Camera {store} position={[0, 4, 12]} lookAt={[0, 0, 0]} fov={45} />
  <Light {store} type="ambient" intensity={0.4} />
  <Light {store} type="directional" position={[5, 10, 7.5]} intensity={1.2} />

  <Mesh
    {store}
    id="rotating-box"
    geometry={{ type: 'box', size: 1.5 }}
    material={{ color: '#ff6b6b', metallic: 0.7, roughness: 0.3 }}
    position={[0, 1.5, 0]}
    rotation={[0, rotation, 0]}
  />
</Scene>

<button onclick={rotateShapes}>Rotate 45°</button>
```

---

## SCENE COMPONENT

**Purpose**: Root container for 3D rendering. Manages Babylon.js engine lifecycle and syncs store state to the renderer.

**Props**:
- `store: Store<GraphicsState, GraphicsAction>` - Graphics store (required)
- `width: string | number` - Canvas width (default: '100%')
- `height: string | number` - Canvas height (default: '600px')
- `children: Snippet` - Child components (Camera, Light, Mesh)

**Behavior**:
1. Creates canvas element
2. Initializes Babylon.js `Engine` (WebGL)
3. Dispatches `rendererInitialized` action with capabilities
4. Syncs store updates to Babylon.js scene
5. Cleans up engine on unmount — including when unmounted mid-initialisation

**Usage**:
```svelte
<Scene {store} height="500px">
  <!-- Children render here -->
</Scene>
```

**State Synchronization**:
Scene uses a manual subscription rather than an `$effect`, because the callback
drives a renderer and an effect that both reads the store and mutates the scene
loops. The diffing lives in `core/scene-sync.ts` so it can be tested against a
spy adapter.

It diffs by **object identity**, not `JSON.stringify`. The reducer is pure and
the store holds `$state.raw`, so every arm returns new objects for what changed
and the very same objects for what did not — which makes identity exact and
O(1). That matters: a running animation dispatches a `tick` per frame, and
stringifying every mesh at 60fps is a cost. Meshes and lights are diffed per
item by `id`, so one changed light does not disturb the others.

**Renderer Info**:
Access renderer info from store:
```typescript
$store.renderer.activeRenderer // 'webgl' | null
$store.renderer.isInitialized  // boolean
$store.renderer.capabilities   // { maxTextureSize, ... }
$store.renderer.error          // string | null
```

---

## CAMERA COMPONENT

**Purpose**: Defines the viewpoint and projection for the scene.

**Props**:
- `store: Store<GraphicsState, GraphicsAction>` - Graphics store (required)
- `type: 'perspective' | 'orthographic'` - Camera type (default: 'perspective')
- `position: [number, number, number]` - Camera position (required)
- `lookAt: [number, number, number]` - Target point to look at (required)
- `fov: number` - Field of view in degrees (default: 45, perspective only)
- `orthoSize: number` - Half-height of the view in world units (default: 5,
  orthographic only). The half-width follows from the viewport aspect.
- `near: number` - Near clipping plane (optional)
- `far: number` - Far clipping plane (optional)

**Behavior**:
- Dispatches `updateCamera` action on mount
- Re-dispatches when props change
- Does not render visual output (state-only component)

**Usage**:
```svelte
<!-- Perspective camera (default) -->
<Camera
  {store}
  position={[0, 4, 12]}
  lookAt={[0, 0, 0]}
  fov={45}
/>

<!-- Orthographic camera -->
<Camera
  {store}
  type="orthographic"
  orthoSize={8}
  position={[0, 10, 0]}
  lookAt={[0, 0, 0]}
/>
```

**Common Camera Positions**:
- Front view: `position={[0, 0, 10]}, lookAt={[0, 0, 0]}`
- Top-down: `position={[0, 10, 0]}, lookAt={[0, 0, 0]}`
- Isometric: `position={[5, 5, 5]}, lookAt={[0, 0, 0]}`
- Close-up: `position={[0, 2, 5]}, lookAt={[0, 1, 0]}`

---

## LIGHT COMPONENT

**Purpose**: Add illumination to the scene. Supports multiple light types.

**Every light has an `id`.** The `id` prop is optional — `<Light>` generates a
stable one per component instance via `$props.id()` when you omit it, so the
markup below works unchanged. Supply one when you need to address the light from
outside the component, and make it unique: a second `<Light>` claiming an id
that is already taken warns and renders nothing rather than fighting the first
one for it.

```svelte
<Light {store} id="key" type="directional" position={[5, 10, 7]} intensity={1.2} />
```

Changing `id` moves the light rather than orphaning it, and unmounting removes
exactly the light that component owns.

**Light Types**:

### Ambient Light
Uniform light from all directions (no position/direction).

**Props**:
- `type: 'ambient'`
- `intensity: number` - Light intensity (0-1 typical, can exceed)
- `color: string` - Light color, **6-digit hex only** (`'#ffffff'`, default)

**Usage**:
```svelte
<Light {store} type="ambient" intensity={0.4} color="#ffffff" />
```

### Directional Light
Parallel rays from a specific direction (like sunlight).

**Props**:
- `type: 'directional'`
- `position: [number, number, number]` - Light position (defines direction)
- `intensity: number` - Light intensity
- `color: string` - Light color (optional)

**Usage**:
```svelte
<Light {store} type="directional" position={[5, 10, 7.5]} intensity={1.2} />
```

### Point Light
Emits light in all directions from a point (like a light bulb).

**Props**:
- `type: 'point'`
- `position: [number, number, number]` - Light position
- `intensity: number` - Light intensity
- `radius: number` - Light radius/range (optional)
- `color: string` - Light color (optional)

**Usage**:
```svelte
<Light {store} type="point" position={[0, 3, 0]} intensity={1.5} radius={10} />
```

### Spot Light
Cone-shaped light (like a flashlight).

**Props**:
- `type: 'spot'`
- `position: [number, number, number]` - Light position
- `direction: [number, number, number]` - Light direction vector
- `angle: number` - Cone angle in radians (default: Math.PI / 4)
- `intensity: number` - Light intensity
- `color: string` - Light color (optional)

**Usage**:
```svelte
<Light
  {store}
  type="spot"
  position={[0, 5, 0]}
  direction={[0, -1, 0]}
  angle={Math.PI / 6}
  intensity={2.0}
/>
```

**Common Lighting Setups**:

```svelte
<!-- Three-point lighting (photography standard) -->
<Light {store} type="ambient" intensity={0.3} />
<Light {store} type="directional" position={[5, 5, 5]} intensity={1.0} />     <!-- Key -->
<Light {store} type="directional" position={[-3, 3, -3]} intensity={0.5} />   <!-- Fill -->
<Light {store} type="directional" position={[0, 2, -5]} intensity={0.3} />    <!-- Back -->

<!-- Outdoor scene (sun + ambient) -->
<Light {store} type="ambient" intensity={0.4} color="#87ceeb" />
<Light {store} type="directional" position={[10, 20, 10]} intensity={1.5} color="#fff8dc" />

<!-- Indoor scene (ambient + point lights) -->
<Light {store} type="ambient" intensity={0.2} />
<Light {store} type="point" position={[0, 3, 0]} intensity={1.0} radius={5} />
<Light {store} type="point" position={[5, 2, 5]} intensity={0.8} radius={4} />
```

---

## MESH COMPONENT

**Purpose**: Render 3D objects with geometry and materials.

**Props**:
- `store: Store<GraphicsState, GraphicsAction>` - Graphics store (required)
- `id: string` - Unique identifier (required)
- `geometry: GeometryConfig` - Geometry configuration (required)
- `material: MaterialConfig` - Material configuration (required)
- `position: [number, number, number]` - Position (required)
- `rotation: [number, number, number]` - Rotation in radians (default: [0, 0, 0])
- `scale: [number, number, number]` - Scale (default: [1, 1, 1])
- `visible: boolean` - Visibility (default: true)

**Lifecycle**:
- `onMount`: Dispatches `addMesh` action
- Props change: Dispatches `updateMesh` action
- `onDestroy`: Dispatches `removeMesh` action

**Usage**:
```svelte
<Mesh
  {store}
  id="my-cube"
  geometry={{ type: 'box', size: 1.5 }}
  material={{ color: '#ff6b6b', metallic: 0.7, roughness: 0.3 }}
  position={[0, 1, 0]}
  rotation={[0, Math.PI / 4, 0]}
  scale={[1, 1, 1]}
/>
```

---

## GEOMETRY TYPES

### Box
Rectangular prism.

**Config**:
```typescript
{ type: 'box'; size: number }
```

**Example**:
```svelte
<Mesh
  {store}
  id="cube"
  geometry={{ type: 'box', size: 1.5 }}
  material={{ color: '#ff6b6b' }}
  position={[0, 1, 0]}
/>
```

### Sphere
Spherical geometry.

**Config**:
```typescript
{
  type: 'sphere';
  radius: number;
  segments?: number; // Default: 32 (higher = smoother)
}
```

**Example**:
```svelte
<Mesh
  {store}
  id="ball"
  geometry={{ type: 'sphere', radius: 0.8, segments: 32 }}
  material={{ color: '#4ecdc4', metallic: 0.8, roughness: 0.2 }}
  position={[0, 1, 0]}
/>
```

**Segments**: Higher values create smoother spheres but increase draw calls.
- Low poly (16 segments): Retro/stylized look
- Medium (32 segments): Default, good balance
- High poly (64 segments): Smooth, more expensive

### Cylinder
Cylindrical geometry.

**Config**:
```typescript
{
  type: 'cylinder';
  height: number;
  diameter: number;
}
```

**Example**:
```svelte
<Mesh
  {store}
  id="pillar"
  geometry={{ type: 'cylinder', height: 2, diameter: 1 }}
  material={{ color: '#95e1d3' }}
  position={[0, 1, 0]}
/>
```

### Torus
Donut-shaped geometry.

**Config**:
```typescript
{
  type: 'torus';
  diameter: number;      // Outer diameter
  thickness: number;     // Tube thickness
  segments?: number;     // Default: 32
}
```

**Example**:
```svelte
<Mesh
  {store}
  id="ring"
  geometry={{ type: 'torus', diameter: 1.5, thickness: 0.3, segments: 32 }}
  material={{ color: '#f38181', metallic: 0.9, roughness: 0.1 }}
  position={[0, 1, 0]}
/>
```

### Plane
Flat rectangular surface.

**Config**:
```typescript
{
  type: 'plane';
  width: number;
  height: number;
}
```

**Example**:
```svelte
<!-- Ground plane (rotated to horizontal) -->
<Mesh
  {store}
  id="ground"
  geometry={{ type: 'plane', width: 12, height: 12 }}
  material={{ color: '#aa96da', metallic: 0.3, roughness: 0.7 }}
  position={[0, 0, 0]}
  rotation={[Math.PI / 2, 0, 0]}
/>
```

**Note**: Planes are initially vertical (facing Z-axis). Rotate by `[Math.PI / 2, 0, 0]` to make horizontal (ground).

---

## MATERIAL PROPERTIES

**MaterialConfig Interface**:
```typescript
interface MaterialConfig {
  color: string;           // 6-digit hex, e.g. '#ff6b6b' — see below
  metallic?: number;       // 0-1 (default: 0 — a white, untinted highlight)
  roughness?: number;      // 0-1 (default: 0.5 — Babylon's own specularPower)
  emissive?: string;       // Emissive color (optional)
  alpha?: number;          // 0-1 transparency (optional)
  wireframe?: boolean;     // Wireframe mode (default: false)
}
```

**Colours are 6-digit hex, and only that.** `'#ff6b6b'` and `'ff6b6b'` both
parse; `'red'`, `'rgb(255,0,0)'` and the 3-digit `'#f00'` do not, and render as
white with a warning. This file used to say "Hex or CSS color", which was never
true of the parser.

**Not PBR.** This section used to say "Materials use Physically Based Rendering
(PBR) with metallic/roughness workflow". They do not: the adapter builds a
Babylon `StandardMaterial`, which has no metallic or roughness channel.
`roughness` was read by nothing at all until recently.

Both are mapped onto the closest levers `StandardMaterial` offers. They are
approximations, not physically based shading, but the values below do read the
way you expect — a high `roughness` looks rough:

- `metallic` **tints** the highlight, interpolating `specularColor` from white
  toward the surface colour. Dielectrics reflect white; metals reflect their own
  colour, which is the one real difference a specular/glossiness model can
  express. A floor keeps it from reaching black, so a very dark metal still has
  a highlight for `roughness` to sharpen.

  How visible `metallic` is depends on the surface colour: on a white or
  near-white surface it does nothing, because white tinted toward white is
  white. That is correct — a white metal and white plastic really do reflect the
  same colour — but it means `metallic` alone does not separate the `chrome`
  preset from white plastic. `roughness` is what separates those.
- `roughness` sets how tight the highlight is (`specularPower`) and, past the
  midpoint, how bright. Breadth alone is not enough — a fully rough surface at
  full strength reads as wet rather than matte. Below the midpoint it is at full
  strength and only sharpens, so `roughness: 0.5` lands on Babylon's untouched
  defaults in both channels.

Omitting both fields leaves the material looking exactly as `StandardMaterial`
would on its own.

An earlier version of this section said `roughness` now worked while `metallic`
still mapped straight onto `specularColor` as a grey — which meant
`metallic: 0.0` gave black, and Babylon's default shader is
`finalSpecular = specularBase * specularColor`, a multiply. `specularPower` could
not change a single pixel. Since `metallic: 0.0` is what this file teaches for
plastic, rubber, wood, stone and glass, `roughness` was inert for 7 of the 13
presets below, the mirror included.

Real PBR is Babylon's `PBRMaterial`, which would change the lighting model for
every existing mesh and needs an environment texture to look right. Recorded as
a gap rather than claimed.

### Metallic (0-1)
Controls how metal-like the surface appears — specifically, how much the
highlight takes on the surface's own colour. It has the most effect on a
saturated or dark surface and none at all on a white one.

- `0.0`: Non-metallic (plastic, rubber, wood, stone) — a white highlight
- `0.5`: Semi-metallic (painted metal, worn surfaces)
- `1.0`: Fully metallic (polished metal, chrome) — the highlight is the
  surface colour

Note that `0.0` does **not** mean "no highlight": a non-metal still reflects
light, and `roughness` is what controls how much.

**Examples**:
```typescript
// Plastic
{ color: '#ff0000', metallic: 0.0, roughness: 0.5 }

// Painted metal
{ color: '#4ecdc4', metallic: 0.5, roughness: 0.4 }

// Polished chrome
{ color: '#ffffff', metallic: 1.0, roughness: 0.1 }
```

### Roughness (0-1)
Controls surface smoothness/reflectivity.

- `0.0`: Mirror-smooth (glossy, high reflections)
- `0.5`: Semi-rough (satin finish)
- `1.0`: Very rough (matte, diffuse)

**Examples**:
```typescript
// Glass/mirror
{ color: '#ffffff', metallic: 0.0, roughness: 0.0 }

// Satin finish
{ color: '#ff6b6b', metallic: 0.3, roughness: 0.5 }

// Matte rubber
{ color: '#333333', metallic: 0.0, roughness: 1.0 }
```

### Common Material Presets

```typescript
// Polished gold
const gold = { color: '#ffd700', metallic: 1.0, roughness: 0.2 };

// Brushed aluminum
const aluminum = { color: '#c0c0c0', metallic: 1.0, roughness: 0.4 };

// Copper
const copper = { color: '#b87333', metallic: 1.0, roughness: 0.3 };

// Wood
const wood = { color: '#8b4513', metallic: 0.0, roughness: 0.8 };

// Plastic
const plastic = { color: '#ff6b6b', metallic: 0.0, roughness: 0.4 };

// Stone
const stone = { color: '#808080', metallic: 0.0, roughness: 0.9 };

// Rubber
const rubber = { color: '#1a1a1a', metallic: 0.0, roughness: 1.0 };
```

---

## COMPLETE EXAMPLE

Full scene with all geometry types:

```svelte
<script lang="ts">
import { createStore } from '@composable-svelte/core';
import {
  Scene,
  Camera,
  Light,
  Mesh,
  graphicsReducer,
  createInitialGraphicsState
} from '@composable-svelte/graphics';

// Create graphics store
const store = createStore({
  initialState: createInitialGraphicsState({
    backgroundColor: '#1a1a2e'
  }),
  reducer: graphicsReducer,
  dependencies: {}
});

// Track rotation for animation
let rotation = $state(0);

function rotateShapes() {
  rotation += Math.PI / 4;
}
</script>

<!-- Renderer info -->
<div>
  {#if $store.renderer.isInitialized}
    <span>Renderer: {$store.renderer.activeRenderer?.toUpperCase()}</span>
    <span>Max Texture: {$store.renderer.capabilities.maxTextureSize}px</span>
  {:else if $store.renderer.error}
    <span>Error: {$store.renderer.error}</span>
  {:else}
    <span>Initializing...</span>
  {/if}
</div>

<!-- 3D Scene -->
<Scene {store} height="500px">
  <Camera {store} position={[0, 4, 12]} lookAt={[0, 0, 0]} fov={45} />
  <Light {store} type="ambient" intensity={0.4} color="#ffffff" />
  <Light {store} type="directional" position={[5, 10, 7.5]} intensity={1.2} color="#ffffff" />

  <!-- Row 1: Box, Sphere, Cylinder -->
  <Mesh
    {store}
    id="box"
    geometry={{ type: 'box', size: 1.5 }}
    material={{ color: '#ff6b6b', metallic: 0.7, roughness: 0.3 }}
    position={[-4, 1.5, 0]}
    rotation={[0, rotation, 0]}
  />

  <Mesh
    {store}
    id="sphere"
    geometry={{ type: 'sphere', radius: 0.8, segments: 32 }}
    material={{ color: '#4ecdc4', metallic: 0.8, roughness: 0.2 }}
    position={[-1.5, 1.5, 0]}
    rotation={[0, rotation, 0]}
  />

  <Mesh
    {store}
    id="cylinder"
    geometry={{ type: 'cylinder', height: 2, diameter: 1 }}
    material={{ color: '#95e1d3', metallic: 0.6, roughness: 0.4 }}
    position={[1, 1.5, 0]}
    rotation={[0, rotation, 0]}
  />

  <!-- Row 2: Torus, Plane -->
  <Mesh
    {store}
    id="torus"
    geometry={{ type: 'torus', diameter: 1.5, thickness: 0.3, segments: 32 }}
    material={{ color: '#f38181', metallic: 0.9, roughness: 0.1 }}
    position={[3.5, 1.5, 0]}
    rotation={[0, rotation, 0]}
  />

  <!-- Ground plane -->
  <Mesh
    {store}
    id="plane"
    geometry={{ type: 'plane', width: 12, height: 12 }}
    material={{ color: '#aa96da', metallic: 0.3, roughness: 0.7 }}
    position={[0, -0.5, 0]}
    rotation={[Math.PI / 2, 0, 0]}
  />
</Scene>

<button onclick={rotateShapes}>Rotate All Shapes 45°</button>
```

---

## STATE MANAGEMENT

### GraphicsState Interface

```typescript
interface GraphicsState {
  // Renderer
  renderer: {
    activeRenderer: 'webgl' | null;
    isInitialized: boolean;
    capabilities: {
      supportsWebGL: boolean;
      maxTextureSize: number;
      maxVertexAttributes: number;
    };
    error: string | null;
  };

  // Scene
  backgroundColor: string;

  // Camera
  camera: CameraConfig;

  // Lights
  lights: LightConfig[];

  // Meshes
  meshes: MeshConfig[];

  // Animations
  animations: AnimationState[];

  // Loading
  isLoading: boolean;
}
```

`scene: SceneNode` and `loadingProgress: number` used to be listed here. Both
were removed: `scene` was built once and never read or written by anything, and
`loadingProgress` was set to `0` at creation and never touched again — so a
consumer reading it saw `0` forever, including after loading finished.

### GraphicsAction Types

```typescript
type GraphicsAction =
  // Renderer
  | { type: 'rendererInitialized'; renderer: 'webgl'; capabilities: RendererCapabilities }
  | { type: 'rendererError'; error: string }

  // Camera
  | { type: 'updateCamera'; camera: Partial<CameraConfig> }
  | { type: 'setCameraPosition'; position: Vector3 }
  | { type: 'setCameraLookAt'; lookAt: Vector3 }

  // Mesh
  | { type: 'addMesh'; mesh: MeshConfig }
  | { type: 'removeMesh'; id: string }
  | { type: 'updateMesh'; id: string; updates: Partial<MeshConfig> }
  | { type: 'setMeshPosition'; id: string; position: Vector3 }
  | { type: 'setMeshRotation'; id: string; rotation: Vector3 }
  | { type: 'setMeshScale'; id: string; scale: Vector3 }
  | { type: 'toggleMeshVisibility'; id: string }

  // Light
  | { type: 'addLight'; light: LightConfig }
  | { type: 'removeLight'; id: string }
  | { type: 'updateLight'; id: string; light: LightConfig }

  // Animation
  | { type: 'startAnimation'; animation: AnimationConfig }
  | { type: 'stopAnimation'; id: string }
  | { type: 'tick'; time: number }

  // Scene
  | { type: 'setBackgroundColor'; color: string }
  | { type: 'clearScene' };
```

**Lights are addressed by `id`, not by index.** `removeLight` and `updateLight`
took an `index` until recently, and `LightConfig` had no identity at all — so a
light could only be named by its position in the array. That is what made
removal wrong: `<Light>` captured `state.lights.length - 1` at mount and removed
by that number, while the reducer filtered positionally, so with the default
ambient light in slot 0, unmounting three `<Light>` children removed index 1,
then index 2 of the already-shifted array. `LightConfig.id` is now required, and
`<Light>` supplies one via `$props.id()` when you do not.

`updateLight` takes a whole `LightConfig`, not a `Partial`: it is a
discriminated union, and a partial cannot be spread across one without losing
the discriminant.

### Reducer Pattern

Graphics reducer is pure and testable:

```typescript
import { graphicsReducer } from '@composable-svelte/graphics';
import { TestStore } from '@composable-svelte/core/test';

const store = new TestStore({
  initialState: createInitialGraphicsState(),
  reducer: graphicsReducer,
  dependencies: {}
});

// Add mesh
await store.send({
  type: 'addMesh',
  mesh: {
    id: 'test-cube',
    geometry: { type: 'box', size: 1 },
    material: { color: '#ff0000' },
    position: [0, 0, 0]
  }
}, (state) => {
  expect(state.meshes.length).toBe(1);
  expect(state.meshes[0].id).toBe('test-cube');
});

// Update position
await store.send({
  type: 'setMeshPosition',
  id: 'test-cube',
  position: [1, 2, 3]
}, (state) => {
  expect(state.meshes[0].position).toEqual([1, 2, 3]);
});
```

---

## PERFORMANCE CONSIDERATIONS

### Geometry Complexity

**Segments**: Higher segment counts create smoother geometry but increase draw calls.

```typescript
// Low poly (fast, retro look)
geometry={{ type: 'sphere', radius: 1, segments: 16 }}

// Default (good balance)
geometry={{ type: 'sphere', radius: 1, segments: 32 }}

// High poly (slow, smooth)
geometry={{ type: 'sphere', radius: 1, segments: 64 }}
```

### Draw Calls

Each mesh = 1 draw call. Minimize meshes for better performance.

**Good**:
```svelte
// 3 meshes = 3 draw calls
<Mesh id="obj1" ... />
<Mesh id="obj2" ... />
<Mesh id="obj3" ... />
```

**Bad**:
```svelte
// 1000 meshes = 1000 draw calls (very slow!)
{#each items as item}
  <Mesh id={item.id} ... />
{/each}
```

**Solution**: Use instancing for many similar objects (future feature).

### Update Frequency

Scene sync diffs by **object identity**, per mesh and per light, keyed by `id`.
It used to stringify, which is what made per-frame updates expensive; identity
is O(1) and the reducer guarantees it (a pure reducer over `$state.raw` returns
new objects for what changed and the same objects for what did not).

Updating a mesh prop every frame is still work — it reaches the renderer, which
is the point — but it is no longer *quadratic* work, and a reducer arm that
returns an unchanged value now costs nothing at all. Animations are the
supported way to drive per-frame change; see `startAnimation`.

**Good**:
```typescript
// Update rotation only when button clicked
let rotation = $state(0);
function rotate() { rotation += Math.PI / 4; }

<Mesh rotation={[0, rotation, 0]} ... />
```

**Bad**:
```typescript
// Updates every frame (60 FPS) - expensive!
let time = $state(0);
setInterval(() => { time += 0.01; }, 16);

<Mesh rotation={[0, time, 0]} ... />
```

**Solution**: drive it through `startAnimation` rather than dispatching a prop
change per frame — the reducer advances one frame loop for the whole store and
skips meshes whose value has not moved. (This line used to call the animation
system a "future feature"; it has not been one for some time, and two other
places in this file say so.)

---

## COMMON PATTERNS

### Rotation Animation

```typescript
let rotation = $state(0);

function rotateObject() {
  rotation += Math.PI / 4; // 45 degrees
}

<Mesh rotation={[0, rotation, 0]} ... />
<button onclick={rotateObject}>Rotate 45°</button>
```

### Camera Controls

```typescript
let cameraDistance = $state(12);

function zoomIn() {
  cameraDistance = Math.max(5, cameraDistance - 2);
}

function zoomOut() {
  cameraDistance = Math.min(20, cameraDistance + 2);
}

<Camera {store} position={[0, 4, cameraDistance]} lookAt={[0, 0, 0]} />
<button onclick={zoomIn}>Zoom In</button>
<button onclick={zoomOut}>Zoom Out</button>
```

### Dynamic Lighting

```typescript
let lightIntensity = $state(1.0);

function adjustBrightness(delta: number) {
  lightIntensity = Math.max(0, Math.min(2, lightIntensity + delta));
}

<Light {store} type="directional" position={[5, 10, 7.5]} intensity={lightIntensity} />
<button onclick={() => adjustBrightness(0.2)}>Brighter</button>
<button onclick={() => adjustBrightness(-0.2)}>Dimmer</button>
```

### Toggle Visibility

```svelte
let showObject = $state(true);

// Option 1: Conditional rendering
{#if showObject}
  <Mesh id="object" ... />
{/if}

// Option 2: Visible prop
<Mesh id="object" visible={showObject} ... />

<button onclick={() => showObject = !showObject}>
  {showObject ? 'Hide' : 'Show'}
</button>
```

---

## FUTURE FEATURES

These features are planned but not yet implemented:

### Custom Shaders
```svelte
// Future API
<Mesh
  id="custom"
  geometry={{ type: 'sphere', radius: 1 }}
  material={{
    type: 'custom',
    vertexShader: '...',
    fragmentShader: '...',
    uniforms: { time: 0.0 }
  }}
  position={[0, 0, 0]}
/>
```

### Textures
```svelte
// Future API
<Mesh
  id="textured"
  geometry={{ type: 'box', size: 1 }}
  material={{
    color: '#ffffff',
    albedoTexture: '/textures/wood.jpg',
    normalMap: '/textures/wood_normal.jpg'
  }}
  position={[0, 0, 0]}
/>
```

### A declarative `animation` prop on `<Mesh>`

Animations themselves are **implemented** — this section used to list them as a
future feature. Drive them through the store:

```typescript
store.dispatch({
  type: 'startAnimation',
  animation: {
    id: 'spin',
    targetId: 'my-cube',
    property: 'rotation',   // 'position' | 'rotation' | 'scale'
    from: [0, 0, 0],
    to: [0, Math.PI * 2, 0],
    duration: 2000,
    loop: true,
    easing: 'linear'        // 'linear' | 'easeIn' | 'easeOut' | 'easeInOut'
  }
});

store.dispatch({ type: 'stopAnimation', id: 'spin' });
```

`targetId` must name a mesh that already exists; an animation naming no mesh is
rejected with a warning rather than ticking forever against nothing. Removing a
mesh stops the animations targeting it.

What is still future is expressing that as a prop:

```svelte
// Future API
<Mesh
  {store}
  id="animated"
  geometry={{ type: 'box', size: 1 }}
  material={{ color: '#ff6b6b' }}
  position={[0, 0, 0]}
  animation={{
    property: 'rotation',
    from: [0, 0, 0],
    to: [0, Math.PI * 2, 0],
    duration: 2000,
    loop: true,
    easing: 'linear'
  }}
/>
```

### Post-Processing
```svelte
// Future API
<Scene {store} postProcessing={{
  bloom: { enabled: true, intensity: 0.5 },
  ssao: { enabled: true, radius: 2 },
  fxaa: true
}}>
  ...
</Scene>
```

---

## CROSS-REFERENCES

**Related Skills**:
- **composable-svelte-core**: Store, reducer, Effect system
- **composable-svelte-components**: UI components that complement 3D scenes
- **composable-svelte-testing**: TestStore for testing graphics reducers

**When to Use Each Package**:
- **graphics**: 3D scenes, WebGL rendering
- **charts**: 2D data visualization (see composable-svelte-charts)
- **maps**: Geospatial data (see composable-svelte-maps)
- **code**: Code editors, syntax highlighting (see composable-svelte-code)

---

## TROUBLESHOOTING

**Scene not rendering**:
- Check browser WebGL support
- Verify store is created with `graphicsReducer`
- Check console for renderer errors in `$store.renderer.error`

**Objects not visible**:
- Ensure Camera is pointing at objects (`lookAt` prop)
- Add at least one Light (scene is dark by default)
- Check mesh `visible` prop
- Verify position values (objects might be off-screen)

**Poor performance**:
- Reduce segment counts on spheres/toruses
- Minimize number of meshes (each mesh = 1 draw call)
- Avoid updating mesh props every frame
- Use simpler geometry (box vs sphere)

**TypeScript errors**:
- Ensure `@composable-svelte/graphics` is installed
- Check geometry config matches type (e.g., `box` requires `size`, not `radius`)
- Verify Vector3 arrays are exactly 3 numbers `[x, y, z]`

---

## ADDITIONAL EXPORTS

### WebGLOverlay

Embeds a WebGL canvas as an overlay within a web layout:

```svelte
import { WebGLOverlay } from '@composable-svelte/graphics';

<WebGLOverlay {store} width={800} height={600} />
```

### Shader Presets

Pre-built shader configurations available via:

```typescript
import { /* shader presets */ } from '@composable-svelte/graphics';
```

### BabylonAdapter

Direct access to the Babylon.js engine for advanced use cases beyond the declarative API:

```typescript
import { BabylonAdapter } from '@composable-svelte/graphics';

const adapter = new BabylonAdapter();
```
