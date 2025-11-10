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

// Simple rotation animation
function rotateShapes() {
  rotation += Math.PI / 4;
}
</script>

<div class="space-y-8">
  <!-- Live Demo Section -->
  <section class="space-y-4">
    <div>
      <h2 class="text-2xl font-bold mb-2">Live Demo</h2>
      <p class="text-muted-foreground">
        All primitive geometries: Box, Sphere, Cylinder, Torus, and Plane with state-driven WebGPU/WebGL rendering
      </p>
    </div>

    <!-- Renderer Info -->
    <div class="flex gap-4 items-center text-sm">
      {#if $store.renderer.isInitialized}
        <div class="px-3 py-1 rounded-full bg-primary/10 text-primary font-medium">
          {$store.renderer.activeRenderer?.toUpperCase()}
        </div>
        <span class="text-muted-foreground">
          Max Texture: {$store.renderer.capabilities.maxTextureSize}px
        </span>
      {:else if $store.renderer.error}
        <div class="px-3 py-1 rounded-full bg-destructive/10 text-destructive font-medium">
          Error: {$store.renderer.error}
        </div>
      {:else}
        <div class="px-3 py-1 rounded-full bg-muted text-muted-foreground font-medium">
          Initializing...
        </div>
      {/if}
    </div>

    <!-- 3D Scene -->
    <div class="rounded-lg border overflow-hidden">
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

        <Mesh
          {store}
          id="plane"
          geometry={{ type: 'plane', width: 12, height: 12 }}
          material={{ color: '#aa96da', metallic: 0.3, roughness: 0.7 }}
          position={[0, -0.5, 0]}
          rotation={[Math.PI / 2, 0, 0]}
        />
      </Scene>
    </div>

    <!-- Controls -->
    <div class="flex gap-2">
      <button
        onclick={rotateShapes}
        class="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
      >
        Rotate All Shapes 45°
      </button>
    </div>
  </section>

  <!-- Code Example Section -->
  <section class="space-y-4">
    <div>
      <h2 class="text-2xl font-bold mb-2">Usage</h2>
      <p class="text-muted-foreground">All supported geometry types</p>
    </div>

    <div class="rounded-lg bg-muted p-4 overflow-x-auto">
      <pre class="text-sm"><code>{`<script>
  import { createStore } from '@composable-svelte/core';
  import {
    Scene, Camera, Light, Mesh,
    graphicsReducer, createInitialGraphicsState
  } from '@composable-svelte/graphics';

  const store = createStore({
    initialState: createInitialGraphicsState(),
    reducer: graphicsReducer,
    dependencies: {}
  });
</script>

<Scene {store}>
  <Camera {store} position={[0, 4, 12]} lookAt={[0, 0, 0]} />
  <Light {store} type="ambient" intensity={0.4} />

  <!-- Box -->
  <Mesh {store} id="box"
    geometry={{ type: 'box', size: 1.5 }}
    material={{ color: '#ff6b6b' }}
    position={[-4, 1.5, 0]} />

  <!-- Sphere -->
  <Mesh {store} id="sphere"
    geometry={{ type: 'sphere', radius: 0.8, segments: 32 }}
    material={{ color: '#4ecdc4' }}
    position={[-1.5, 1.5, 0]} />

  <!-- Cylinder -->
  <Mesh {store} id="cylinder"
    geometry={{ type: 'cylinder', height: 2, diameter: 1 }}
    material={{ color: '#95e1d3' }}
    position={[1, 1.5, 0]} />

  <!-- Torus -->
  <Mesh {store} id="torus"
    geometry={{ type: 'torus', diameter: 1.5, thickness: 0.3 }}
    material={{ color: '#f38181' }}
    position={[3.5, 1.5, 0]} />

  <!-- Plane (Ground) -->
  <Mesh {store} id="plane"
    geometry={{ type: 'plane', width: 12, height: 12 }}
    material={{ color: '#aa96da' }}
    position={[0, -0.5, 0]}
    rotation={[Math.PI / 2, 0, 0]} />
</Scene>`}</code></pre>
    </div>
  </section>

  <!-- Features Section -->
  <section class="space-y-4">
    <div>
      <h2 class="text-2xl font-bold mb-2">Features</h2>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div class="rounded-lg border p-4">
        <h3 class="font-semibold mb-2">WebGPU First</h3>
        <p class="text-sm text-muted-foreground">
          Automatically uses WebGPU on supported browsers with transparent WebGL fallback
        </p>
      </div>

      <div class="rounded-lg border p-4">
        <h3 class="font-semibold mb-2">State-Driven</h3>
        <p class="text-sm text-muted-foreground">
          All scene state managed through pure reducers with full TestStore support
        </p>
      </div>

      <div class="rounded-lg border p-4">
        <h3 class="font-semibold mb-2">Declarative API</h3>
        <p class="text-sm text-muted-foreground">
          Compose scenes with Svelte components like Scene, Camera, Mesh, and Light
        </p>
      </div>

      <div class="rounded-lg border p-4">
        <h3 class="font-semibold mb-2">Type-Safe</h3>
        <p class="text-sm text-muted-foreground">
          Full TypeScript support with discriminated unions and type inference
        </p>
      </div>
    </div>
  </section>
</div>
