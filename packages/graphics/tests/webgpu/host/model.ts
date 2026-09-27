/** Minimal real-Host fixture: two staged routes and one root-owned WebGPU pavilion scene (public APIs only). */
import { Effect, createDestination, type PresentationAction, type Reducer } from '@composable-svelte/core';
import { defineApplication, destinationSlot, optionalSlot, ManagedIntegrationBuilder, type ApplicationRouting } from '@composable-svelte/core/application';
import { defineChoreography, fluidMotion } from '@composable-svelte/core/application/motion';
import { graphicsReducer } from '../../../src/core/reducer.js';
import { createInitialGraphicsState } from '../../../src/core/initial-state.js';
import { graphicsVisualProvider } from '../../../src/lib/representation/visual-provider.js';
import type { AnimationConfig, GraphicsAction, GraphicsState } from '../../../src/core/types.js';

export type Empty = Record<string, never>;
const none: Reducer<Empty, { type: 'noop' }> = state => [state, Effect.none()];
export const pages = createDestination({ gallery: none, detail: none });
export type Url = '/' | '/detail';
export interface HostState { readonly url: Url; readonly page: typeof pages._types.State | null; readonly scene: GraphicsState | null }
export type HostAction = { type: 'navigate'; url: Url } | { type: 'page'; action: PresentationAction<typeof pages._types.Action> } | { type: 'scene'; action: PresentationAction<GraphicsAction> };
export interface HostDeps { readonly trace?: string[] }

const scene: GraphicsState = {
  ...createInitialGraphicsState({ sceneId: 'webgpu-host', backgroundColor: '#101010' }),
  camera: { type: 'perspective', position: [0, 3, 7], lookAt: [0, 0, 0], fov: 45, near: 0.1, far: 100 },
  lights: [{ id: 'key', type: 'ambient', intensity: 1, color: '#ffffff' }],
  meshes: [{ id: 'cube', geometry: { type: 'box', size: 2.4 }, material: { color: '#ff0000', emissive: '#ff0000' }, position: [0, 0, 0] }]
};
export const turntable: AnimationConfig = { id: 'turntable', targetId: 'cube', property: 'rotation', from: [0, 0, 0], to: [0, Math.PI * 2, 0], duration: 3000, easing: 'linear', loop: true };

const pageFor = (url: Url) => (url === '/detail' ? pages.initial('detail', {}) : pages.initial('gallery', {}));
const root: Reducer<HostState, HostAction, HostDeps> = (state, action, deps) => {
  if (action.type === 'navigate') { deps.trace?.push('navigate'); return [{ ...state, url: action.url, page: pageFor(action.url) }, Effect.none()]; }
  return [state, Effect.none()];
};
export const pageSlot = destinationSlot<HostState, HostAction>()('page', pages);
export const sceneSlot = optionalSlot<HostState, HostAction>()('scene');
export const composition = new ManagedIntegrationBuilder(root).with(pageSlot, { replaceOn: action => action.type === 'navigate' }).with(sceneSlot, graphicsReducer).build();
const routing: ApplicationRouting<HostState, HostAction, { to: Url }> = {
  fragment: 'native',
  serialize: state => state.url,
  request: url => { const next: Url = url.split(/[?#]/)[0] === '/detail' ? '/detail' : '/'; return { action: { type: 'navigate', url: next }, expectedURL: next }; },
  staging: { policy: () => true, commit: intent => ({ action: { type: 'navigate', url: intent.to }, expectedURL: intent.to }), routeSlot: pageSlot }
};
export const definition = defineApplication(composition, {
  initialState: (input: string): HostState => { const url: Url = input === '/detail' ? '/detail' : '/'; return { url, page: pageFor(url), scene }; },
  routing,
  visual: fluidMotion({ providers: [graphicsVisualProvider()] })
});
/** The model leaves the gallery but lingers in place after the 200 ms commit (declared hold until 700 ms). */
export const leave = defineChoreography({ cueMs: 200, durationMs: 900, tracks: [{ participant: 'model', side: 'outgoing', startMs: 700, durationMs: 200, easing: 'linear', opacity: { from: 1, to: 0 } }] });
