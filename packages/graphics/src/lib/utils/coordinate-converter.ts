/**
 * Coordinate Converter
 *
 * Converts between DOM pixel coordinates and WebGL NDC (Normalized Device Coordinates).
 * NDC range from -1 to +1, with (0,0) at the center.
 */

import type { ElementBounds } from '../overlay/overlay-types';

/**
 * NDC (Normalized Device Coordinates) bounds
 */
export interface NDCBounds {
	left: number; // -1 to +1
	right: number; // -1 to +1
	top: number; // -1 to +1
	bottom: number; // -1 to +1
	width: number; // 0 to 2
	height: number; // 0 to 2
}

/**
 * Convert DOM pixel coordinates to WebGL NDC
 *
 * @param bounds - Element bounds in DOM pixels
 * @param canvasWidth - Canvas width in pixels
 * @param canvasHeight - Canvas height in pixels
 * @returns NDC bounds for WebGL rendering
 */
export function domToNDC(bounds: ElementBounds, canvasWidth: number, canvasHeight: number): NDCBounds {
	// Convert pixel coordinates to NDC
	// NDC: (-1, +1) is top-left to bottom-right
	// DOM: (0, 0) is top-left, Y increases downward
	// WebGL: (0, 0) is center, Y increases upward

	const left = (bounds.x / canvasWidth) * 2 - 1;
	const right = ((bounds.x + bounds.width) / canvasWidth) * 2 - 1;

	// Flip Y axis: DOM Y goes down, WebGL Y goes up
	const top = 1 - (bounds.y / canvasHeight) * 2;
	const bottom = 1 - ((bounds.y + bounds.height) / canvasHeight) * 2;

	return {
		left,
		right,
		top,
		bottom,
		width: right - left,
		height: top - bottom
	};
}

/**
 * Convert NDC coordinates back to DOM pixels
 *
 * Useful for debugging or UI positioning.
 *
 * @param ndc - NDC bounds
 * @param canvasWidth - Canvas width in pixels
 * @param canvasHeight - Canvas height in pixels
 * @returns DOM pixel bounds
 */
export function ndcToDOM(ndc: NDCBounds, canvasWidth: number, canvasHeight: number): ElementBounds {
	// Convert NDC back to pixel coordinates
	const x = ((ndc.left + 1) / 2) * canvasWidth;
	const width = (ndc.width / 2) * canvasWidth;

	// Flip Y axis back
	const y = ((1 - ndc.top) / 2) * canvasHeight;
	const height = (ndc.height / 2) * canvasHeight;

	return { x, y, width, height };
}

/**
 * Create quad vertices for an element at NDC position
 *
 * Returns 6 vertices (2 triangles) for a quad at the specified NDC bounds.
 *
 * @param ndc - NDC bounds for the element
 * @returns Float32Array of vertex positions (x, y) for 6 vertices
 */
export function createQuadVertices(ndc: NDCBounds): Float32Array {
	// Two triangles forming a quad
	// Triangle 1: top-left, top-right, bottom-left
	// Triangle 2: top-right, bottom-right, bottom-left

	return new Float32Array([
		// Triangle 1
		ndc.left,
		ndc.top, // Top-left
		ndc.right,
		ndc.top, // Top-right
		ndc.left,
		ndc.bottom, // Bottom-left

		// Triangle 2
		ndc.right,
		ndc.top, // Top-right
		ndc.right,
		ndc.bottom, // Bottom-right
		ndc.left,
		ndc.bottom // Bottom-left
	]);
}

/**
 * Check if element bounds intersect with viewport
 *
 * @param bounds - Element bounds in DOM pixels
 * @param viewportWidth - Viewport width
 * @param viewportHeight - Viewport height
 * @returns true if element is visible in viewport
 */
export function isInViewport(bounds: ElementBounds, viewportWidth: number, viewportHeight: number): boolean {
	return (
		bounds.x + bounds.width > 0 &&
		bounds.x < viewportWidth &&
		bounds.y + bounds.height > 0 &&
		bounds.y < viewportHeight
	);
}
