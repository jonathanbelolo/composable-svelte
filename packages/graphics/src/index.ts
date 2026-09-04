/**
 * @composable-svelte/graphics
 * State-driven WebGL graphics package
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
// Named rather than `export type *`, because that also exported four types no
// consumer could obtain: `OverlayContextAPI` and `OverlayInit` are produced only
// by `createOverlay`, which is not exported, and `TextureCreationOptions` /
// `TextureCreationResult` are the parameter and return of a method on
// `TextureFactory`, which left the barrel with `overlay/index.ts`. That is the
// same category as `ShaderProgramEntry`, deleted in `457c7e6` for exactly this.
export type {
	ElementType,
	UpdateStrategy,
	ShaderEffect,
	CustomShaderEffect,
	ElementBounds,
	ElementRegistration,
	OverlayOptions
} from './lib/overlay/overlay-types.js';
// The overlay's error type. Exported because it is reachable, not because it is
// used internally: `OverlayOptions.onError` is forwarded straight through the
// component, and `ElementRegistration.error`, `TextureCreationResult.error` and
// `registerElement`'s return all surface it. A consumer could receive one and
// had no way to import it to narrow on `code`. Both are values (a class and an
// enum), so this is a value export, not `export type`.
export { OverlayError, OverlayErrorCode } from './lib/utils/overlay-error.js';

// Shader presets
export * from './lib/shaders/index.js';

// Adapters (for advanced usage)
export { BabylonAdapter } from './adapters/babylon-adapter.js';
