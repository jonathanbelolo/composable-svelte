# DOM-Synchronized WebGL Effects

## Overview

This document outlines how to integrate WebGL shader effects with normal HTML content - the pattern where HTML elements remain in the document flow (maintaining layout and accessibility) but are visually enhanced with WebGL overlays.

**Key Insight**: HTML elements become `opacity: 0` to stay in the DOM flow, while WebGL planes render the same content with shader effects on top.

---

## The Pattern

### Traditional Website
```html
<div class="gallery">
  <img src="image1.jpg" alt="Product 1" />
  <img src="image2.jpg" alt="Product 2" />
  <img src="image3.jpg" alt="Product 3" />
</div>
```

### With WebGL Enhancement
```html
<!-- HTML maintains layout + accessibility -->
<div class="gallery">
  <img src="image1.jpg" alt="Product 1" style="opacity: 0" />
  <img src="image2.jpg" alt="Product 2" style="opacity: 0" />
  <img src="image3.jpg" alt="Product 3" style="opacity: 0" />
</div>

<!-- WebGL canvas overlays with shader effects -->
<canvas class="webgl-overlay" style="position: fixed; top: 0; left: 0; pointer-events: none;">
  <!-- Renders same images with ripple/distortion shaders -->
</canvas>
```

**Result**: User sees WebGL-enhanced images, but HTML elements stay in DOM for:
- Layout flow
- Accessibility (screen readers)
- SEO (search engines)
- No JavaScript fallback

---

## Use Cases

### 1. **Image Galleries with Shader Transitions**
- Gallery images with displacement/ripple effects
- Smooth transitions between images using custom shaders
- Scroll-triggered distortions

### 2. **Product Showcases**
- Product images with magnetic cursor effects
- Hover effects with vertex displacement
- 3D transformations on scroll

### 3. **Hero Sections**
- Background videos with shader effects
- Parallax with custom distortions
- Text with displacement maps

### 4. **Creative Portfolios**
- Portfolio items with custom transitions
- Cursor-interactive shaders
- Scroll-driven animations with impossible CSS effects

---

## Existing Solutions Analysis

### Curtains.js (WebGL-focused)

**What it does well**:
- Automatic DOM → WebGL plane synchronization
- CSS-based positioning (planes match DOM elements)
- Built-in scroll/resize handling
- ShaderPass for post-processing

**Limitations**:
- WebGL only (no WebGPU support)
- Not state-driven (imperative API)
- Vanilla JS (no framework integration)

**Example**:
```javascript
import { Curtains, Plane } from 'curtainsjs';

const curtains = new Curtains({
  container: "canvas"
});

const plane = new Plane(curtains, document.querySelector(".plane"), {
  vertexShader: vs,
  fragmentShader: fs
});
```

---

## Composable Svelte Integration

### Architecture

```
┌─────────────────────────────────────┐
│   HTML Layer (opacity: 0)           │
│   - Maintains document flow          │
│   - Accessibility                    │
│   - SEO                              │
└─────────────────────────────────────┘
           ↓ Position tracking
┌─────────────────────────────────────┐
│   Composable State                   │
│   - Element bounds                   │
│   - Scroll position                  │
│   - Shader uniforms                  │
└─────────────────────────────────────┘
           ↓ State-driven rendering
┌─────────────────────────────────────┐
│   WebGL/WebGPU Layer (overlay)       │
│   - Planes match DOM positions       │
│   - Custom shader effects            │
│   - Smooth animations                │
└─────────────────────────────────────┘
```

### State Structure

```typescript
interface DOMSyncState {
  // Tracked DOM elements
  elements: {
    [elementId: string]: {
      bounds: DOMRect;        // Position/size from getBoundingClientRect()
      texture: string;        // Image/video URL
      visible: boolean;       // In viewport?
      shader: ShaderConfig;   // Which shader to apply
    };
  };

  // Viewport state
  viewport: {
    width: number;
    height: number;
    scrollY: number;
    scrollX: number;
  };

  // Global effects
  postProcessing: PostProcessConfig[];
  cursor: { x: number; y: number };

  // Animation state
  animations: AnimationConfig[];
}

interface ShaderConfig {
  type: 'ripple' | 'displacement' | 'distortion' | 'custom';
  uniforms: Record<string, ShaderUniform>;
  vertex?: string;   // Custom GLSL/WGSL vertex shader
  fragment?: string; // Custom GLSL/WGSL fragment shader
}
```

### Declarative API

```svelte
<script lang="ts">
  import { createStore } from '@composable-svelte/core';
  import {
    ShaderCanvas,
    ShaderImage,
    ShaderVideo,
    rippleShader,
    displacementShader
  } from '@composable-svelte/graphics';
  import { domSyncReducer, createInitialDOMSyncState } from '@composable-svelte/graphics';

  const store = createStore({
    initialState: createInitialDOMSyncState(),
    reducer: domSyncReducer,
    dependencies: {}
  });

  let cursorX = $state(0);
  let cursorY = $state(0);

  function handleMouseMove(e: MouseEvent) {
    store.dispatch({
      type: 'updateCursor',
      x: e.clientX,
      y: e.clientY
    });
  }
</script>

<svelte:window on:mousemove={handleMouseMove} />

<!-- WebGL overlay canvas (auto-positioned) -->
<ShaderCanvas {store} />

<!-- Image Gallery: HTML elements maintain flow -->
<div class="gallery">
  <!-- Each image has a WebGL plane synced to it -->
  <ShaderImage
    {store}
    src="/images/product1.jpg"
    alt="Product 1"
    shader={rippleShader({
      intensity: 0.3,
      frequency: 5,
      speed: 2
    })}
    interactive
  />

  <ShaderImage
    {store}
    src="/images/product2.jpg"
    alt="Product 2"
    shader={displacementShader({
      map: '/textures/displacement.jpg',
      strength: 0.5
    })}
    hoverEffect="magnetic"
  />

  <ShaderVideo
    {store}
    src="/videos/hero.mp4"
    alt="Hero video"
    shader={rippleShader({
      intensity: $store.cursor.x / window.innerWidth
    })}
    autoplay
    loop
  />
</div>

<style>
  .gallery {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 2rem;
    padding: 2rem;
  }
</style>
```

### How It Works

**1. ShaderImage Component**
```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { Store } from '@composable-svelte/core';
  import type { DOMSyncState, DOMSyncAction } from '../types';

  let {
    store,
    src,
    alt,
    shader,
    interactive = false,
    hoverEffect = 'none'
  }: {
    store: Store<DOMSyncState, DOMSyncAction>;
    src: string;
    alt?: string;
    shader: ShaderConfig;
    interactive?: boolean;
    hoverEffect?: 'none' | 'magnetic' | 'lift';
  } = $props();

  let imgElement: HTMLImageElement;
  const elementId = crypto.randomUUID();

  // Track element position
  onMount(() => {
    const observer = new ResizeObserver(updateBounds);
    observer.observe(imgElement);

    // Initial bounds
    updateBounds();

    // Scroll listener
    window.addEventListener('scroll', updateBounds, { passive: true });

    // Register element in store
    store.dispatch({
      type: 'registerElement',
      id: elementId,
      texture: src,
      shader,
      interactive
    });

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', updateBounds);
      store.dispatch({ type: 'unregisterElement', id: elementId });
    };
  });

  function updateBounds() {
    const bounds = imgElement.getBoundingClientRect();
    store.dispatch({
      type: 'updateElementBounds',
      id: elementId,
      bounds: {
        x: bounds.left,
        y: bounds.top,
        width: bounds.width,
        height: bounds.height
      }
    });
  }

  function handleHover() {
    if (hoverEffect === 'none') return;
    store.dispatch({
      type: 'elementHovered',
      id: elementId,
      hoverEffect
    });
  }

  function handleLeave() {
    store.dispatch({
      type: 'elementUnhovered',
      id: elementId
    });
  }
</script>

<!-- HTML image: maintains layout, invisible -->
<img
  bind:this={imgElement}
  {src}
  {alt}
  style="opacity: 0"
  on:mouseenter={handleHover}
  on:mouseleave={handleLeave}
/>
```

**2. ShaderCanvas Component**
```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import type { Store } from '@composable-svelte/core';
  import type { DOMSyncState, DOMSyncAction } from '../types';
  import { createBabylonAdapter } from '../adapters/babylon-dom-sync';

  let {
    store
  }: {
    store: Store<DOMSyncState, DOMSyncAction>;
  } = $props();

  let canvasElement: HTMLCanvasElement;
  let adapter: BabylonDOMSyncAdapter;

  onMount(() => {
    // Initialize Babylon.js for DOM-synced rendering
    adapter = createBabylonAdapter(canvasElement, {
      webgpu: true,
      fallback: true
    });

    // Subscribe to state changes
    const unsubscribe = store.subscribe((state) => {
      adapter.updateElements(state.elements);
      adapter.updateViewport(state.viewport);
      adapter.updateCursor(state.cursor);
    });

    // Start render loop
    adapter.startRenderLoop();

    return () => {
      unsubscribe();
      adapter.dispose();
    };
  });
</script>

<!-- Fixed overlay canvas -->
<canvas
  bind:this={canvasElement}
  style="
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    pointer-events: none;
    z-index: 1000;
  "
></canvas>
```

---

## Built-in Shader Presets

### 1. Ripple Shader
```typescript
import { rippleShader } from '@composable-svelte/graphics/shaders';

const shader = rippleShader({
  intensity: 0.3,   // How strong the ripple (0-1)
  frequency: 5,     // Number of ripples
  speed: 2,         // Animation speed
  center: 'mouse'   // 'mouse' | 'center' | [x, y]
});
```

**Effect**: Creates water-like ripples emanating from a point

---

### 2. Displacement Shader
```typescript
import { displacementShader } from '@composable-svelte/graphics/shaders';

const shader = displacementShader({
  map: '/textures/displacement.jpg',  // Grayscale displacement map
  strength: 0.5,                      // How much to displace (0-1)
  direction: 'horizontal'              // 'horizontal' | 'vertical' | 'both'
});
```

**Effect**: Distorts image based on displacement map (common for transitions)

---

### 3. Distortion Shader
```typescript
import { distortionShader } from '@composable-svelte/graphics/shaders';

const shader = distortionShader({
  type: 'noise',     // 'noise' | 'wave' | 'twist'
  strength: 0.2,
  speed: 1.0
});
```

**Effect**: Animated distortion (Perlin noise, sine waves, twist)

---

### 4. Magnetic Cursor Shader
```typescript
import { magneticCursorShader } from '@composable-svelte/graphics/shaders';

const shader = magneticCursorShader({
  radius: 100,        // Affected area around cursor
  strength: 0.3,      // How much to distort
  smoothness: 0.5     // Transition smoothness
});
```

**Effect**: Image vertices follow cursor with spring physics

---

### 5. Custom Shader
```typescript
import { customShader } from '@composable-svelte/graphics/shaders';

const shader = customShader({
  vertex: `
    #version 300 es
    in vec3 position;
    in vec2 uv;
    uniform mat4 worldViewProjection;
    out vec2 vUV;

    void main() {
      vUV = uv;
      gl_Position = worldViewProjection * vec4(position, 1.0);
    }
  `,
  fragment: `
    #version 300 es
    precision highp float;
    in vec2 vUV;
    uniform sampler2D textureSampler;
    uniform float time;
    out vec4 fragColor;

    void main() {
      vec2 uv = vUV;
      // Custom effect: color shift over time
      vec4 color = texture(textureSampler, uv);
      color.r += sin(time + uv.y * 10.0) * 0.1;
      fragColor = color;
    }
  `,
  uniforms: {
    time: { type: 'float', value: 0 }
  }
});

// Update uniform from state
store.dispatch({
  type: 'updateShaderUniform',
  elementId: 'my-image',
  uniform: 'time',
  value: performance.now() / 1000
});
```

---

## Scroll Integration

### Scroll-Triggered Shader Effects

```svelte
<script lang="ts">
  import { ScrollObserver } from '@composable-svelte/graphics';

  const store = createStore({
    initialState: createInitialDOMSyncState(),
    reducer: domSyncReducer,
    dependencies: {}
  });

  // Automatically dispatches scroll actions
  const scrollObserver = new ScrollObserver(store);
</script>

<ShaderCanvas {store} />

<div class="content">
  <ShaderImage
    {store}
    src="/hero.jpg"
    shader={rippleShader({
      intensity: $store.viewport.scrollY / 1000  // Increases with scroll
    })}
  />

  <!-- More content... -->
</div>
```

### Parallax with Shader Effects

```svelte
<ShaderImage
  {store}
  src="/background.jpg"
  shader={displacementShader({
    strength: $store.viewport.scrollY / 500
  })}
  parallax={0.5}  <!-- Scrolls at half speed -->
/>
```

---

## Performance Optimizations

### 1. Viewport Culling
Only render planes that are currently visible in the viewport:

```typescript
case 'updateElementBounds': {
  const element = state.elements[action.id];
  const isVisible = isInViewport(action.bounds, state.viewport);

  return [
    {
      ...state,
      elements: {
        ...state.elements,
        [action.id]: {
          ...element,
          bounds: action.bounds,
          visible: isVisible  // Babylon adapter skips invisible elements
        }
      }
    },
    Effect.none()
  ];
}

function isInViewport(bounds: Bounds, viewport: Viewport): boolean {
  return (
    bounds.y < viewport.height + viewport.scrollY &&
    bounds.y + bounds.height > viewport.scrollY
  );
}
```

### 2. Throttled Updates
Use requestAnimationFrame for smooth 60fps updates:

```typescript
// In BabylonDOMSyncAdapter
private syncElementPositions() {
  requestAnimationFrame(() => {
    for (const [id, element] of Object.entries(this.elements)) {
      if (!element.visible) continue;  // Skip invisible

      const plane = this.planes.get(id);
      if (!plane) continue;

      // Update plane position to match DOM element
      plane.position.x = element.bounds.x + element.bounds.width / 2;
      plane.position.y = -(element.bounds.y + element.bounds.height / 2);  // Flip Y
      plane.scaling.x = element.bounds.width;
      plane.scaling.y = element.bounds.height;
    }
  });
}
```

### 3. Texture Caching
Reuse textures for duplicate images:

```typescript
private textureCache = new Map<string, Texture>();

private loadTexture(url: string): Texture {
  if (this.textureCache.has(url)) {
    return this.textureCache.get(url)!;
  }

  const texture = new Texture(url, this.scene);
  this.textureCache.set(url, texture);
  return texture;
}
```

---

## Implementation Plan

### Phase 13E: DOM-Synchronized WebGL (New Phase)

**Week 5-6**:

- [ ] **Core DOM Sync System**
  - DOMSyncState and reducer
  - Position tracking (ResizeObserver, scroll events)
  - Viewport culling
  - Babylon.js adapter for DOM-synced planes

- [ ] **Components**
  - `<ShaderCanvas>` - Fixed overlay canvas
  - `<ShaderImage>` - Image with shader effects
  - `<ShaderVideo>` - Video with shader effects
  - `<ScrollObserver>` - Auto-scroll state updates

- [ ] **Shader Presets**
  - Ripple shader
  - Displacement shader
  - Distortion shader (noise, wave, twist)
  - Magnetic cursor shader
  - Custom shader support

- [ ] **Examples in Styleguide**
  - Image gallery with ripple transitions
  - Product showcase with magnetic cursor
  - Hero section with displacement
  - Scroll-triggered shader animations
  - Custom shader demo

---

## Success Criteria

1. ✅ HTML elements maintain document flow and accessibility
2. ✅ WebGL planes perfectly sync with DOM positions
3. ✅ 60fps performance with 20+ shader images
4. ✅ Smooth scroll integration
5. ✅ Automatic WebGL/WebGPU fallback
6. ✅ Zero visual difference between HTML and WebGL (when shader is at rest)
7. ✅ Mobile-friendly (handles scroll, resize, orientation)

---

## Open Questions

1. **Touch Gestures**: How to handle mobile touch/swipe for interactive shaders?
2. **Accessibility**: Should we provide motion-reduced mode that skips shaders?
3. **SEO**: Any additional considerations beyond keeping HTML in DOM?
4. **Bundle Size**: Should shader presets be tree-shakeable?
5. **Framework Integration**: Can we integrate with Lenis/Locomotive smooth scroll?
