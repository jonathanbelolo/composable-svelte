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
function rotateCube() {
  rotation += Math.PI / 4;
}
</script>

<div class="space-y-8">
  <!-- Live Demo Section -->
  <section class="space-y-4">
    <div>
      <h2 class="text-2xl font-bold mb-2">Live Demo</h2>
      <p class="text-muted-foreground">
        State-driven 3D scene with WebGPU/WebGL rendering
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
      <Scene {store} height="400px">
        <Camera {store} position={[0, 3, 8]} lookAt={[0, 0, 0]} fov={45} />
        <Light {store} type="ambient" intensity={0.4} color="#ffffff" />
        <Light {store} type="directional" position={[5, 10, 7.5]} intensity={1.2} color="#ffffff" />
        <Mesh
          {store}
          id="cube-1"
          geometry={{ type: 'box', size: 2 }}
          material={{ color: '#ff6b6b', metallic: 0.7, roughness: 0.3 }}
          position={[0, 0, 0]}
          rotation={[0, rotation, 0]}
          scale={[1, 1, 1]}
        />
      </Scene>
    </div>

    <!-- Controls -->
    <div class="flex gap-2">
      <button
        onclick={rotateCube}
        class="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
      >
        Rotate 45°
      </button>
    </div>
  </section>

  <!-- Code Example Section -->
  <section class="space-y-4">
    <div>
      <h2 class="text-2xl font-bold mb-2">Usage</h2>
      <p class="text-muted-foreground">Basic example of 3D scene rendering</p>
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
  <Camera {store} position={[0, 3, 8]} lookAt={[0, 0, 0]} />
  <Light {store} type="ambient" intensity={0.4} />
  <Mesh
    {store}
    id="cube"
    geometry={{ type: 'box', size: 2 }}
    material={{ color: '#ff6b6b' }}
    position={[0, 0, 0]}
  />
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
