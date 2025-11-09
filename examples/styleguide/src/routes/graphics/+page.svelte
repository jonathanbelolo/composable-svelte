<script lang="ts">
import { createStore } from '@composable-svelte/core';
import {
  Scene,
  Camera,
  Mesh,
  Light,
  graphicsReducer,
  createInitialGraphicsState,
  type GraphicsState,
  type GraphicsAction
} from '@composable-svelte/graphics';

// Create graphics store
const store = createStore({
  initialState: createInitialGraphicsState({
    backgroundColor: '#1a1a2e'
  }),
  reducer: graphicsReducer,
  dependencies: {}
});

// Rotate cube on button click
function rotateCube() {
  const currentRotation = $store.meshes.find((m) => m.id === 'cube-1')?.rotation || [0, 0, 0];
  store.dispatch({
    type: 'setMeshRotation',
    id: 'cube-1',
    rotation: [currentRotation[0], currentRotation[1] + Math.PI / 4, currentRotation[2]]
  });
}

// Start continuous rotation
function startAnimation() {
  store.dispatch({
    type: 'startAnimation',
    animation: {
      id: 'rotate-cube',
      targetId: 'cube-1',
      property: 'rotation',
      from: [0, 0, 0],
      to: [0, Math.PI * 2, 0],
      duration: 3000,
      easing: 'linear',
      loop: true
    }
  });
}

// Stop animation
function stopAnimation() {
  store.dispatch({
    type: 'stopAnimation',
    id: 'rotate-cube'
  });
}

// Change cube color
function changeCubeColor(color: string) {
  store.dispatch({
    type: 'updateMesh',
    id: 'cube-1',
    updates: {
      material: {
        color,
        metallic: 0.7,
        roughness: 0.3
      }
    }
  });
}

// Add sphere
function addSphere() {
  store.dispatch({
    type: 'addMesh',
    mesh: {
      id: 'sphere-1',
      geometry: { type: 'sphere', radius: 1 },
      material: { color: '#95e1d3', metallic: 0.5, roughness: 0.5 },
      position: [3, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      visible: true
    }
  });
}

// Remove sphere
function removeSphere() {
  store.dispatch({
    type: 'removeMesh',
    id: 'sphere-1'
  });
}
</script>

<div class="container">
  <h1>3D Graphics Demo</h1>
  <p>WebGL/WebGPU rendering with Composable Architecture</p>

  <!-- Renderer info -->
  <div class="info">
    {#if $store.renderer.isInitialized}
      <p class="success">
        ✓ Renderer: <strong>{$store.renderer.activeRenderer?.toUpperCase()}</strong>
      </p>
      <p class="details">
        Max Texture Size: {$store.renderer.capabilities.maxTextureSize}
      </p>
    {:else if $store.renderer.error}
      <p class="error">Error: {$store.renderer.error}</p>
    {:else}
      <p class="loading">Initializing renderer...</p>
    {/if}
  </div>

  <!-- 3D Scene -->
  <div class="scene-wrapper">
    <Scene {store} height="500px">
      <Camera position={[0, 3, 8]} lookAt={[0, 0, 0]} fov={45} />

      <Light type="ambient" intensity={0.4} color="#ffffff" />
      <Light type="directional" position={[5, 10, 7.5]} intensity={1.2} color="#ffffff" />

      <Mesh
        id="cube-1"
        geometry={{ type: 'box', size: 2 }}
        material={{ color: '#ff6b6b', metallic: 0.7, roughness: 0.3 }}
        position={[0, 0, 0]}
        rotation={$store.meshes.find((m) => m.id === 'cube-1')?.rotation}
      />
    </Scene>
  </div>

  <!-- Controls -->
  <div class="controls">
    <div class="control-group">
      <h3>Rotation</h3>
      <button onclick={rotateCube}>Rotate 45°</button>
      <button onclick={startAnimation}>Start Animation</button>
      <button onclick={stopAnimation}>Stop Animation</button>
    </div>

    <div class="control-group">
      <h3>Color</h3>
      <button onclick={() => changeCubeColor('#ff6b6b')}>Red</button>
      <button onclick={() => changeCubeColor('#4ecdc4')}>Cyan</button>
      <button onclick={() => changeCubeColor('#95e1d3')}>Mint</button>
      <button onclick={() => changeCubeColor('#f38181')}>Pink</button>
    </div>

    <div class="control-group">
      <h3>Meshes</h3>
      <button onclick={addSphere}>Add Sphere</button>
      <button onclick={removeSphere}>Remove Sphere</button>
      <p class="mesh-count">Active meshes: {$store.meshes.length}</p>
    </div>
  </div>

  <!-- State Debug -->
  <details class="state-debug">
    <summary>State (Debug)</summary>
    <pre>{JSON.stringify(
        {
          renderer: $store.renderer,
          meshes: $store.meshes.map((m) => ({
            id: m.id,
            position: m.position,
            rotation: m.rotation
          })),
          lights: $store.lights.length,
          animations: $store.animations.length
        },
        null,
        2
      )}</pre>
  </details>
</div>

<style>
  .container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem;
  }

  h1 {
    font-size: 2.5rem;
    margin-bottom: 0.5rem;
    color: #333;
  }

  p {
    color: #666;
    margin-bottom: 1.5rem;
  }

  .info {
    background: #f5f5f5;
    padding: 1rem;
    border-radius: 8px;
    margin-bottom: 1.5rem;
  }

  .info p {
    margin: 0.25rem 0;
  }

  .success {
    color: #22c55e;
    font-weight: 500;
  }

  .error {
    color: #ef4444;
    font-weight: 500;
  }

  .loading {
    color: #3b82f6;
  }

  .details {
    font-size: 0.875rem;
    color: #888;
  }

  .scene-wrapper {
    border: 2px solid #e5e7eb;
    border-radius: 12px;
    overflow: hidden;
    margin-bottom: 2rem;
    box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  }

  .controls {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1.5rem;
    margin-bottom: 2rem;
  }

  .control-group {
    background: #f9fafb;
    padding: 1.5rem;
    border-radius: 8px;
  }

  .control-group h3 {
    margin-top: 0;
    margin-bottom: 1rem;
    font-size: 1.125rem;
    color: #374151;
  }

  button {
    background: #3b82f6;
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 500;
    margin-right: 0.5rem;
    margin-bottom: 0.5rem;
    transition: background 0.2s;
  }

  button:hover {
    background: #2563eb;
  }

  button:active {
    background: #1d4ed8;
  }

  .mesh-count {
    margin-top: 1rem;
    font-size: 0.875rem;
    color: #6b7280;
  }

  .state-debug {
    background: #1f2937;
    color: #e5e7eb;
    padding: 1rem;
    border-radius: 8px;
  }

  .state-debug summary {
    cursor: pointer;
    font-weight: 500;
    user-select: none;
  }

  .state-debug pre {
    margin-top: 1rem;
    overflow-x: auto;
    font-size: 0.875rem;
    line-height: 1.5;
  }
</style>
