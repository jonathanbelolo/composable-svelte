/**
 * @composable-svelte/graphics
 * State-driven WebGL/WebGPU graphics package
 */

// Core types and state
export type * from './core/types';
export { graphicsReducer } from './core/reducer';
export { createInitialGraphicsState } from './core/initial-state';

// Components
export { default as Scene } from './components/Scene.svelte';
export { default as Camera } from './components/Camera.svelte';
export { default as Mesh } from './components/Mesh.svelte';
export { default as Light } from './components/Light.svelte';

// WebGL Overlay
export { default as WebGLOverlay } from './lib/overlay/WebGLOverlay.svelte';
export type * from './lib/overlay/overlay-types';

// Shader presets
export * from './lib/shaders/index';

// Adapters (for advanced usage)
export { BabylonAdapter } from './adapters/babylon-adapter';
