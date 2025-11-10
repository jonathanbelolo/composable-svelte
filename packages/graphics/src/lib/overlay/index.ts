/**
 * WebGL Overlay - Main Exports
 *
 * Phase 1: Core Infrastructure
 *
 * Provides a generalized WebGL overlay system for applying shader effects
 * to any HTML element (image, video, canvas, text, html).
 */

// Main API
export { createOverlay } from './webgl-overlay.js';

// Core types
export type {
	ElementType,
	UpdateStrategy,
	ShaderEffect,
	CustomShaderEffect,
	ElementRegistration,
	OverlayOptions,
	OverlayContextAPI,
	TextureCreationOptions,
	TextureCreationResult,
	ShaderProgramEntry
} from './overlay-types.js';

// Advanced APIs (for custom integrations)
export { TextureFactory } from './texture-factory.js';
export { UpdateScheduler } from './update-scheduler.js';
export type { UpdateCallback } from './update-scheduler.js';
