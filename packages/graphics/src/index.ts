/**
 * @composable-svelte/graphics
 * State-driven WebGL/WebGPU graphics package
 */

// Core types and state
export type * from './core/types.js';
export { graphicsReducer } from './core/reducer.js';
export { createInitialGraphicsState } from './core/initial-state.js';
// The scene sync, and the renderer surface it drives. Exported because it is
// the seam a second backend would implement and the one a test can substitute.
export { syncScene, initialBaseline } from './core/scene-sync.js';
export type { SceneAdapter, SceneBaseline } from './core/scene-sync.js';

// Components
export { default as Scene } from './components/Scene.svelte';
export { default as Camera } from './components/Camera.svelte';
export { default as Mesh } from './components/Mesh.svelte';
export { default as Light } from './components/Light.svelte';

// WebGL Overlay
export { default as WebGLOverlay } from './lib/overlay/WebGLOverlay.svelte';
export type * from './lib/overlay/overlay-types.js';

// Shader presets
export * from './lib/shaders/index.js';

// Adapters (for advanced usage)
export { BabylonAdapter } from './adapters/babylon-adapter.js';
