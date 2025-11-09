# Phase 13: WebGL/WebGPU Graphics Package

## Overview

Create `@composable-svelte/graphics` - A state-driven 3D/2D graphics package that integrates WebGL/WebGPU rendering with Composable Architecture principles.

## Goals

1. **State-Driven Rendering**: Scene graph managed through pure reducers
2. **Declarative API**: Components like `<Scene>`, `<Mesh>`, `<Light>`, `<Camera>`
3. **WebGPU Support**: Future-proof with modern graphics API
4. **WebGL Fallback**: Transparent fallback for browsers without WebGPU
5. **Testable**: Full TestStore support for 3D scenes

## Framework Analysis (2025)

### Option 1: **Babylon.js** ⭐ RECOMMENDED

**Status**: ✅ Production-ready WebGPU support

**Strengths**:
- **Native TypeScript**: Built in TypeScript from the ground up
- **Full WebGPU Support**: Since v5.0 (2022), fully production-ready
- **v8.0 (March 2025)**: All shaders in both GLSL and WGSL, 2x smaller for WebGPU
- **Game Engine Features**: Collision detection, physics, advanced lighting
- **Transparent Rendering**: Automatically chooses WebGPU or WebGL based on browser support
- **Excellent Debugging**: Inspector tool for live scene debugging

**Weaknesses**:
- Larger bundle size than PixiJS (but tree-shakeable)
- Microsoft-centric ecosystem
- Smaller community than Three.js

**Best For**: 3D applications, games, complex interactive experiences

---

### Option 2: **PixiJS v8**

**Status**: ✅ Production-ready WebGPU support

**Strengths**:
- **Native WebGPU**: WebGPU integration is core, not an add-on
- **Fully TypeScript**: Rebuilt in TypeScript for v8
- **2D Optimized**: Best performance for 2D graphics
- **Async Init**: Proper async WebGPU initialization
- **Smaller Bundle**: Lighter than 3D engines
- **Excellent React Integration**: PixiJS React v8 with full TypeScript

**Weaknesses**:
- **2D Only**: No 3D scene graph (though 2.5D possible)
- Less game-engine features than Babylon.js

**Best For**: 2D games, data visualizations, particle effects, sprite animations

---

### Option 3: **Three.js**

**Status**: ⚠️ WebGPU still experimental (NOT production-ready)

**Strengths**:
- **Massive Community**: 100k+ GitHub stars, huge ecosystem
- **Extensive Examples**: Thousands of examples and resources
- **WebGL Maturity**: Extremely mature WebGL renderer

**Weaknesses**:
- **WebGPU Not Ready**: Still in examples/, not core (Feb 2025 reports of 60fps → 15fps drops)
- **Performance Issues**: Severe UBO system performance problems with many objects
- **Experimental**: Documentation explicitly states "unfinished and undocumented"
- Not native TypeScript (community types only)

**Verdict**: ❌ Not recommended until WebGPURenderer stabilizes (likely late 2025/2026)

---

## Recommendation: **Start with Babylon.js**

### Why Babylon.js?

1. **Production-Ready WebGPU**: The only framework with stable, performant WebGPU in 2025
2. **Native TypeScript**: Perfect alignment with our TypeScript-first approach
3. **Future-Proof**: v8.0 shows continued commitment to WebGPU advancement
4. **Transparent Fallback**: Automatically uses WebGL when WebGPU unavailable
5. **Full 3D**: Complete game engine with physics, collision, advanced rendering

### Migration Path

If we need 2D-specific features later, we can:
1. Add `@composable-svelte/graphics-2d` based on PixiJS
2. Share core abstractions between packages
3. Provide similar Composable Architecture integration

If Three.js WebGPU stabilizes, we can:
1. Create an adapter layer (our API stays the same)
2. Switch rendering backend without breaking changes

---

## Integration with Composable Architecture

### Core Principles

```typescript
// State-driven scene graph
interface GraphicsState {
  scene: SceneNode;
  camera: CameraConfig;
  lights: LightConfig[];
  meshes: MeshConfig[];
  animations: AnimationState[];
  renderer: RendererConfig;
}

// Pure reducer
const graphicsReducer: Reducer<GraphicsState, GraphicsAction, GraphicsDeps> = (
  state,
  action,
  deps
) => {
  switch (action.type) {
    case 'addMesh':
      return [
        { ...state, meshes: [...state.meshes, action.mesh] },
        Effect.none()
      ];

    case 'updateCamera':
      return [
        { ...state, camera: action.camera },
        Effect.none()
      ];

    case 'startAnimation':
      return [
        { ...state, animations: [...state.animations, action.animation] },
        Effect.animationFrame((dispatch, time) => {
          dispatch({ type: 'tick', time });
        })
      ];

    default:
      return [state, Effect.none()];
  }
};
```

### Declarative Components

```svelte
<script lang="ts">
  import { Scene, Mesh, Camera, Light } from '@composable-svelte/graphics';
  import { createStore } from '@composable-svelte/core';
  import { graphicsReducer, createInitialGraphicsState } from '@composable-svelte/graphics';

  const store = createStore({
    initialState: createInitialGraphicsState({
      renderer: { type: 'webgpu', fallback: 'webgl' }
    }),
    reducer: graphicsReducer,
    dependencies: {}
  });

  function rotateCube() {
    store.dispatch({
      type: 'updateMesh',
      id: 'cube-1',
      rotation: { x: 0, y: Math.PI / 4, z: 0 }
    });
  }
</script>

<Scene {store}>
  <Camera
    position={[0, 0, 5]}
    lookAt={[0, 0, 0]}
  />

  <Light
    type="directional"
    position={[1, 1, 1]}
    intensity={0.8}
  />

  <Mesh
    id="cube-1"
    geometry={{ type: 'box', size: 1 }}
    material={{ color: '#ff6b6b', metallic: 0.5 }}
    position={[0, 0, 0]}
    rotation={$store.meshes.find(m => m.id === 'cube-1')?.rotation}
  />

  <Mesh
    id="sphere-1"
    geometry={{ type: 'sphere', radius: 0.5 }}
    material={{ color: '#4ecdc4', roughness: 0.3 }}
    position={[2, 0, 0]}
  />
</Scene>

<button on:click={rotateCube}>Rotate Cube</button>
```

---

## Package Structure

```
@composable-svelte/graphics/
├── src/
│   ├── core/
│   │   ├── types.ts              # Core types (SceneNode, MeshConfig, etc.)
│   │   ├── reducer.ts            # Graphics reducer
│   │   ├── effects.ts            # Animation, render effects
│   │   └── adapter.ts            # Babylon.js adapter interface
│   ├── adapters/
│   │   ├── babylon-adapter.ts    # Babylon.js implementation
│   │   └── webgpu-fallback.ts    # WebGL fallback logic
│   ├── components/
│   │   ├── Scene.svelte          # Root scene component
│   │   ├── Camera.svelte         # Camera component
│   │   ├── Mesh.svelte           # 3D mesh
│   │   ├── Light.svelte          # Lighting
│   │   ├── Material.svelte       # Material component
│   │   └── Group.svelte          # Scene group
│   ├── materials/
│   │   ├── standard.ts           # Standard PBR material
│   │   ├── custom.ts             # Custom shader materials
│   │   └── presets.ts            # Material presets
│   ├── physics/
│   │   ├── rigid-body.ts         # Physics integration
│   │   └── collisions.ts         # Collision detection
│   └── index.ts
├── tests/
│   ├── reducer.test.ts
│   ├── scene.test.ts
│   └── babylon-adapter.test.ts
└── package.json
```

---

## Implementation Phases

### Phase 13A: Core Foundation (Week 1-2)
- [ ] Package scaffolding (`@composable-svelte/graphics`)
- [ ] Babylon.js adapter with WebGPU/WebGL fallback
- [ ] Core types and reducer
- [ ] Basic Scene and Camera components
- [ ] Simple cube demo

### Phase 13B: Primitive Components (Week 2-3)
- [ ] Mesh component (box, sphere, cylinder)
- [ ] Light component (directional, point, spot)
- [ ] Material system (PBR materials)
- [ ] Transform system (position, rotation, scale)
- [ ] Group component for scene hierarchy

### Phase 13C: Advanced Features (Week 3-4)
- [ ] Animation system (keyframes, tweening)
- [ ] Custom shaders and materials
- [ ] Texture loading and management
- [ ] Post-processing effects
- [ ] Physics integration (Havok or Cannon.js)

### Phase 13D: Interactivity & Examples (Week 4-5)
- [ ] Picking/raycasting (click on 3D objects)
- [ ] Camera controls (orbit, first-person)
- [ ] Multiple demo scenes in styleguide
- [ ] Performance optimizations
- [ ] Documentation and guides

---

## Technical Decisions

### 1. Renderer Selection

**Automatic Detection**:
```typescript
const store = createStore({
  initialState: createInitialGraphicsState({
    renderer: {
      type: 'auto',  // Try WebGPU, fallback to WebGL
      preferWebGPU: true
    }
  }),
  reducer: graphicsReducer,
  dependencies: {}
});
```

### 2. State vs Refs

**State-Driven** (Preferred):
- Mesh positions, rotations, scales → State
- Materials, colors, properties → State
- Camera configuration → State

**Refs** (When Needed):
- Babylon.js scene instance → Internal ref (not exposed)
- Animation loops → Effect.animationFrame
- User input → Events → Actions

### 3. Testing Strategy

```typescript
import { TestStore } from '@composable-svelte/core';
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
          geometry: { type: 'box' }
        }
      },
      (state) => {
        expect(state.meshes).toHaveLength(1);
        expect(state.meshes[0].id).toBe('cube-1');
      }
    );
  });

  it('updates mesh position', async () => {
    const initialState = createInitialGraphicsState({
      meshes: [{ id: 'cube-1', position: [0, 0, 0] }]
    });

    const store = new TestStore(initialState, graphicsReducer, {});

    await store.send(
      {
        type: 'updateMesh',
        id: 'cube-1',
        position: [1, 2, 3]
      },
      (state) => {
        const cube = state.meshes.find(m => m.id === 'cube-1');
        expect(cube.position).toEqual([1, 2, 3]);
      }
    );
  });
});
```

---

## Dependencies

```json
{
  "dependencies": {
    "@babylonjs/core": "^8.0.0",
    "@babylonjs/loaders": "^8.0.0"
  },
  "peerDependencies": {
    "@composable-svelte/core": "workspace:*",
    "svelte": "^5.0.0"
  },
  "devDependencies": {
    "@babylonjs/inspector": "^8.0.0"
  }
}
```

---

## Success Criteria

1. **WebGPU First**: Uses WebGPU by default on supporting browsers
2. **Transparent Fallback**: Automatic WebGL fallback with no code changes
3. **State-Driven**: All scene state managed through reducers
4. **Declarative**: Svelte components for scene composition
5. **Testable**: Full TestStore coverage
6. **Performant**: 60fps for complex scenes
7. **Type-Safe**: Full TypeScript support with inference
8. **Examples**: 5+ demos in styleguide

---

## Open Questions

1. **Physics Integration**: Havok (official Babylon.js) or Cannon.js?
2. **Asset Loading**: Custom loader or use Babylon.js built-in?
3. **Custom Shaders**: How to integrate WGSL/GLSL shaders declaratively?
4. **Performance**: Instance rendering for many objects?
5. **VR/XR**: Include WebXR support in initial release?

---

## Next Steps

1. Review this plan
2. Decide on initial scope (13A only, or 13A+13B?)
3. Create package structure
4. Begin Babylon.js adapter implementation
5. Build first demo (rotating cube with lights)
