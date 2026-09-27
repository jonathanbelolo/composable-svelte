import { fluidMotion } from '@composable-svelte/core/application/motion';
import { graphicsVisualProvider } from '@composable-svelte/graphics';

// <Scene> and <WebGLOverlay> register their own canvases; listing the provider is the only app code.
export const sceneVisual = fluidMotion({ providers: [graphicsVisualProvider()] });
