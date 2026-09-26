import type { ComponentProps } from 'svelte';
import type { Store } from '@composable-svelte/core';
import type { GraphicsState, GraphicsAction } from '@composable-svelte/graphics';
import { Scene, Camera, Mesh, Light, WebGLOverlay } from '@composable-svelte/graphics';

declare const standalone: Store<GraphicsState, GraphicsAction>;
declare const wrongState: Store<{ invalid: true }, GraphicsAction>;
declare const wrongAction: Store<GraphicsState, { type: 'invalid' }>;

const scene: ComponentProps<typeof Scene>['store'] = standalone;
const camera: ComponentProps<typeof Camera>['store'] = standalone;
const mesh: ComponentProps<typeof Mesh>['store'] = standalone;
const light: ComponentProps<typeof Light>['store'] = standalone;
const overlay: ComponentProps<typeof WebGLOverlay>['owner'] = standalone;
// @ts-expect-error A managed graphics store must carry GraphicsState.
const invalidState: ComponentProps<typeof Scene>['store'] = wrongState;
// @ts-expect-error A managed graphics store must accept GraphicsAction.
const invalidAction: ComponentProps<typeof Scene>['store'] = wrongAction;

void [scene, camera, mesh, light, overlay, invalidState, invalidAction];
