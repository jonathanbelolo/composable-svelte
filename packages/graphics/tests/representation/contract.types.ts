/**
 * Type-level guard: the graphics provider is what core's visual configuration
 * accepts. The provider types are declared structurally in the package (the
 * supported peer range predates core's contract); this file fails the type
 * check if the two drift apart.
 */

import { fluidMotion } from '@composable-svelte/core/application/motion';
import type {
	ProvidedRepresentation,
	RepresentationContext,
	RepresentationProvider,
	RetainedRenderer
} from '@composable-svelte/core/application/motion';
import {
	graphicsVisualProvider,
	type GraphicsRepresentation,
	type GraphicsRepresentationContext,
	type GraphicsRetainedRenderer
} from '../../src/lib/representation/visual-provider.js';

export const provider: RepresentationProvider = graphicsVisualProvider();
export const configured = fluidMotion({ providers: [graphicsVisualProvider()] });

// Both directions, so neither side can narrow or widen alone.
export const representation = (value: GraphicsRepresentation): ProvidedRepresentation => value;
export const representationBack = (value: ProvidedRepresentation): GraphicsRepresentation => value;
export const retained = (value: GraphicsRetainedRenderer): RetainedRenderer => value;
export const retainedBack = (value: RetainedRenderer): GraphicsRetainedRenderer => value;
export const context = (value: RepresentationContext): GraphicsRepresentationContext => value;
export const contextBack = (value: GraphicsRepresentationContext): RepresentationContext => value;
