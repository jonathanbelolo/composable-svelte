<script lang="ts">
/**
 * Scene - Root component for 3D rendering
 * Manages Babylon.js engine lifecycle and syncs with store state
 */

import { onMount } from 'svelte';
import type { Snippet } from 'svelte';
import type { GraphicsState, GraphicsStore } from '../core/types.js';
import { BabylonAdapter } from '../adapters/babylon-adapter.js';
import { initialBaseline, syncScene, type GraphicsAdapter } from '../core/scene-sync.js';
import { continueAnimations } from '../core/animation-sample.js';
import { registerRenderSurface, type SurfaceRegistration } from '../lib/representation/visual-provider.js';

// Props
let {
  store,
  createAdapter,
  width = '100%',
  height = '600px',
  children,
  label = 'Interactive 3D scene'
}: {
  store: GraphicsStore;
  createAdapter?: (() => GraphicsAdapter) | undefined;
  width?: string | number | undefined;
  height?: string | number | undefined;
  children?: Snippet | undefined;
  /**
   * Accessible name of the scene's canvas. The default adapter makes the canvas
   * a keyboard-focusable orbit control (drag, wheel and arrow keys), so a screen
   * reader otherwise meets an unnamed focus stop. Name what it shows, for
   * example `"Pavilion model — drag or use arrow keys to orbit"`.
   */
  label?: string | undefined;
} = $props();

// Canvas element
let canvas: HTMLCanvasElement | null = $state(null);

// Subscribe manually: the callback drives a renderer, and an effect that both
// reads the store and mutates the scene would follow its own output. Native
// initialization can outlive unmount, so release is also handled on settle.
//
// Once initialised, the canvas is registered with `graphicsVisualProvider`, and
// release goes through that registration: a fluid-motion run representing this
// canvas may take render authority when the feature retires, and then the run,
// not this component, releases the engine.
onMount(() => {
  if (!canvas) return;
  const surfaceCanvas = canvas;

  let unsubscribe: (() => void) | null = null;
  let cancelled = false;
  let isDisposed = false;
  let initializationSettled = false;
  let baseline = initialBaseline();
  let surface: SurfaceRegistration | null = null;
  // The last state synced: what a retained renderer continues from.
  let lastState: GraphicsState | null = null;

  if (!store.state) {
    // Owner is already retired at mount; do not initialize native engine
    cancelled = true;
    isDisposed = true;
    return;
  }

  const pending: GraphicsAdapter = createAdapter?.() ?? new BabylonAdapter();
  // Keep this local reference even after retirement. A late async initialize
  // may create an engine after the ordinary cleanup has already run.

  function releaseAdapter() {
    if (isDisposed) return;
    isDisposed = true;
    if (surface) surface.release();
    else pending.dispose();
  }

  // Every tie to the store: its subscription, and every later sync or dispatch.
  function cutBusiness() {
    cancelled = true;
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  }

  function disposeScene() {
    if (isDisposed) return;
    cutBusiness();
    // Initialization may still be creating native resources. Its own settle
    // path releases the adapter in that case, exactly once.
    if (initializationSettled) releaseAdapter();
  }

  function ownerRetired() {
    if (isDisposed) return;
    cutBusiness();
    if (!initializationSettled) return;
    // Released now, unless a representation still needs the renderer for the
    // retirement that follows in the same frame.
    if (surface) surface.ownerRetired();
    else releaseAdapter();
  }

  // Subscribe immediately to observe owner retirement synchronously
  unsubscribe = store.subscribe((state) => {
    if (!state) {
      // Owner retirement: cancel native work promptly
      ownerRetired();
      return;
    }
    if (isDisposed || cancelled || !initializationSettled) return;
    baseline = syncScene(state, baseline, pending);
    lastState = state;
  });

  (async () => {
    try {
      const result = await pending.initialize(surfaceCanvas);
      initializationSettled = true;

      if (cancelled || isDisposed || !store.state) {
        releaseAdapter();
        return;
      }

      const authority = pending.renderAuthority?.() ?? null;
      if (authority) {
        surface = registerRenderSurface(surfaceCanvas, authority, () => {
          cutBusiness();
          // A data snapshot, not the store: declared animations continue visually.
          const snapshot = lastState;
          lastState = null;
          return snapshot
            ? continueAnimations(snapshot.animations, pending, Date.now, snapshot.meshes)
            : undefined;
        });
      }

      store.dispatch({
        type: 'rendererInitialized',
        renderer: result.renderer,
        capabilities: result.capabilities
      });

      if (store.state && !isDisposed && !cancelled) {
        baseline = syncScene(store.state, baseline, pending);
        lastState = store.state;
      }
    } catch (error) {
      const reportError = !cancelled && !!store.state;
      initializationSettled = true;
      disposeScene();
      if (!reportError) return;
      const errorMessage = error instanceof Error ? error.message : 'Failed to initialize renderer';
      store.dispatch({
        type: 'rendererError',
        error: errorMessage
      });
      console.error('[Scene] Initialization error:', error);
    }
  })();

  return () => {
    disposeScene();
  };
});

// Format width/height
const widthStyle = $derived(typeof width === 'number' ? `${width}px` : width);
const heightStyle = $derived(typeof height === 'number' ? `${height}px` : height);
</script>

<div class="scene-container" style="width: {widthStyle}; height: {heightStyle};">
  <!-- `img` names the canvas, which has no role of its own, so an `aria-label` alone is not
       reliably exposed. A focusable `img` is the usual shape of an interactive 3D view
       (`<model-viewer>` does the same); Svelte's lint counts `<canvas>` itself as interactive,
       hence the ignore. Focusability (tabindex 0, document order) comes from the adapter once
       its camera inputs attach, so a canvas whose renderer never initialised is not an empty
       tab stop. -->
  <!-- svelte-ignore a11y_no_interactive_element_to_noninteractive_role -->
  <canvas bind:this={canvas} class="scene-canvas" role="img" aria-label={label}></canvas>

  <!-- Render children (Camera, Mesh, Light components) -->
  {@render children?.()}
</div>

<style>
  .scene-container {
    position: relative;
    overflow: hidden;
  }

  .scene-canvas {
    width: 100%;
    height: 100%;
    display: block;
    outline: none;
    touch-action: none;
  }
</style>
