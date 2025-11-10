<script lang="ts">
import { createStore } from '@composable-svelte/core';
import ShaderGallery from './lib/ShaderGallery.svelte';
import ShaderImage2 from './lib/ShaderImage2.svelte';
import { createInitialShaderGalleryState, shaderGalleryReducer } from './lib/shader-reducer';

// Create store with proper Composable Architecture
const store = createStore({
  initialState: createInitialShaderGalleryState(),
  reducer: shaderGalleryReducer,
  dependencies: {}
});

const images = [
  {
    id: 'img1',
    src: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&h=400&fit=crop',
    alt: 'Mountain landscape'
  },
  {
    id: 'img2',
    src: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=600&h=400&fit=crop',
    alt: 'Forest path'
  },
  {
    id: 'img3',
    src: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=600&h=400&fit=crop',
    alt: 'Sunset over water'
  },
  {
    id: 'img4',
    src: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=600&h=400&fit=crop',
    alt: 'Trees and fog'
  }
];

const sidebarImages = [
  {
    id: 'img5',
    src: 'https://images.unsplash.com/photo-1519904981063-b0cf448d479e?w=600&h=400&fit=crop',
    alt: 'Northern lights'
  },
  {
    id: 'img6',
    src: 'https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=600&h=400&fit=crop',
    alt: 'Ocean waves'
  }
];
</script>

<style>
  :global(html) {
    overscroll-behavior: none;
  }

  :global(body) {
    margin: 0;
    padding: 20px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    background: #0a0a0a;
    color: #fff;
    overscroll-behavior: none;
  }

  .container {
    max-width: 1200px;
    margin: 0 auto;
  }

  .header {
    margin-bottom: 40px;
  }

  h1 {
    font-size: 2.5rem;
    font-weight: 700;
    margin-bottom: 10px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .description {
    color: #999;
    font-size: 1.1rem;
  }

  .controls {
    margin-bottom: 30px;
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }

  button {
    padding: 10px 20px;
    border: 2px solid #667eea;
    background: transparent;
    color: #fff;
    border-radius: 8px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 600;
    transition: all 0.2s;
  }

  button:hover {
    background: #667eea;
    transform: translateY(-2px);
  }

  button.active {
    background: #667eea;
    box-shadow: 0 4px 20px rgba(102, 126, 234, 0.4);
  }

  .gallery {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 30px;
  }

  .tech-note {
    margin-top: 40px;
    padding: 20px;
    background: rgba(102, 126, 234, 0.1);
    border-left: 4px solid #667eea;
    border-radius: 8px;
  }

  .tech-note h2 {
    margin-top: 0;
    font-size: 1.3rem;
  }

  .tech-note ul {
    margin: 10px 0;
    padding-left: 20px;
  }

  .tech-note li {
    margin: 8px 0;
    color: #ccc;
  }

  :global(.section-title) {
    font-size: 2rem;
    font-weight: 600;
    margin: 60px 0 30px;
    color: #fff;
  }

  :global(.two-column) {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 40px;
    margin: 40px 0;
    align-items: start;
  }

  :global(.content-text) {
    padding: 20px;
  }

  :global(.content-text h3) {
    font-size: 1.5rem;
    margin-bottom: 20px;
    color: #667eea;
  }

  :global(.content-text p) {
    margin-bottom: 15px;
    line-height: 1.6;
    color: #ccc;
  }

  :global(.sidebar-gallery) {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  :global(footer) {
    margin-top: 60px;
    padding: 40px 0;
    border-top: 1px solid #333;
    text-align: center;
    color: #666;
  }

  :global(footer p) {
    margin: 5px 0;
  }

  @media (max-width: 768px) {
    :global(.two-column) {
      grid-template-columns: 1fr;
    }
  }
</style>

<!-- Composable Architecture: Store-driven shader gallery with Babylon.js -->
<ShaderGallery {store}>
  <div class="container">
    <div class="header">
      <h1>DOM/WebGL Hybrid Image Gallery</h1>
      <p class="description">
        Composable Architecture + Babylon.js: State-driven shader effects with pure reducers
      </p>
    </div>

    <div class="controls">
      <button
        class:active={$store.shaderEffect === 'none'}
        onclick={() => store.dispatch({ type: 'setShaderEffect', effect: 'none' })}
      >
        No Effect
      </button>
      <button
        class:active={$store.shaderEffect === 'wave'}
        onclick={() => store.dispatch({ type: 'setShaderEffect', effect: 'wave' })}
      >
        Wave Distortion
      </button>
      <button
        class:active={$store.shaderEffect === 'pixelate'}
        onclick={() => store.dispatch({ type: 'setShaderEffect', effect: 'pixelate' })}
      >
        Pixelate
      </button>
      <button
        class:active={$store.shaderEffect === 'chromatic'}
        onclick={() => store.dispatch({ type: 'setShaderEffect', effect: 'chromatic' })}
      >
        Chromatic Aberration
      </button>
    </div>

    <div class="gallery">
      {#each images as image}
        <ShaderImage2
          id={image.id}
          src={image.src}
          alt={image.alt}
        />
      {/each}
    </div>

    <div class="tech-note">
      <h2>How It Works</h2>
      <ul>
        <li><strong>Composable Architecture:</strong> Pure reducer pattern, store-driven state, effect system</li>
        <li><strong>Babylon.js:</strong> OrthographicCamera + textured planes with custom ShaderMaterial</li>
        <li><strong>DOM Images:</strong> Regular <code>&lt;img&gt;</code> tags handle layout, SEO, accessibility</li>
        <li><strong>Position Sync:</strong> Frame-based bounds updates for pixel-perfect WebGL overlay</li>
        <li><strong>Zero Opacity:</strong> DOM images fade when Babylon textures load (no reflow)</li>
        <li><strong>Testable:</strong> TestStore can verify shader changes, image registration</li>
      </ul>
    </div>

    <h2 class="section-title">🎨 Advanced Features</h2>

    <div class="two-column">
      <div class="content-text">
        <h3>Seamless HTML Integration</h3>
        <p>
          The WebGL overlay works seamlessly with standard HTML content. Text, layouts, and images
          flow naturally while the shader effects track their positions in real-time.
        </p>
        <p>
          This hybrid approach combines the best of both worlds: DOM for layout and accessibility,
          WebGL for visual effects. The frame-based position tracking ensures pixel-perfect alignment
          even as content scrolls or reflows.
        </p>
        <p>
          The Composable Architecture pattern ensures all state changes are predictable and testable.
          Each shader effect change flows through the reducer, making the entire system easy to reason
          about and debug.
        </p>
        <p>
          Try scrolling the page or resizing your browser window - the shader effects stay perfectly
          aligned with the underlying images thanks to the continuous position sync system.
        </p>
      </div>

      <div class="sidebar-gallery">
        {#each sidebarImages as image}
          <ShaderImage2
            id={image.id}
            src={image.src}
            alt={image.alt}
          />
        {/each}
      </div>
    </div>

    <footer>
      <p><strong>DOM/WebGL Hybrid Image Gallery</strong></p>
      <p>Built with Composable Svelte + Babylon.js</p>
      <p>Demonstrating state-driven shader effects with pure reducer patterns</p>
    </footer>
  </div>
</ShaderGallery>
