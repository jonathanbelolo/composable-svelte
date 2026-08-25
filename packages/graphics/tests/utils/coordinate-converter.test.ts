/**
 * DOM pixels to normalised device coordinates.
 *
 * Not exported from the package root, but every element the overlay draws is
 * positioned through here — so a defect is silent mispositioning rather than an
 * error, which is the hardest kind to notice and the easiest kind to test.
 */

import { describe, it, expect } from 'vitest';
import {
	domToNDC,
	ndcToDOM,
	createQuadVertices,
	isInViewport
} from '../../src/lib/utils/coordinate-converter.js';

const CANVAS = { width: 800, height: 600 };
const bounds = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

describe('domToNDC', () => {
	it('maps the whole canvas onto the full NDC cube', () => {
		const ndc = domToNDC(bounds(0, 0, CANVAS.width, CANVAS.height), CANVAS.width, CANVAS.height);

		expect(ndc.left).toBeCloseTo(-1);
		expect(ndc.right).toBeCloseTo(1);
		expect(ndc.top).toBeCloseTo(1);
		expect(ndc.bottom).toBeCloseTo(-1);
	});

	it('puts a centred element at the origin', () => {
		const ndc = domToNDC(bounds(300, 200, 200, 200), CANVAS.width, CANVAS.height);

		expect((ndc.left + ndc.right) / 2, 'not horizontally centred').toBeCloseTo(0);
		expect((ndc.top + ndc.bottom) / 2, 'not vertically centred').toBeCloseTo(0);
	});

	it('flips the Y axis', () => {
		// DOM Y grows downward, WebGL Y grows upward. An element near the top of
		// the page must land near +1, not −1 — getting this backwards renders
		// everything mirrored and nothing errors.
		const nearTop = domToNDC(bounds(0, 0, 100, 100), CANVAS.width, CANVAS.height);
		const nearBottom = domToNDC(bounds(0, 500, 100, 100), CANVAS.width, CANVAS.height);

		expect(nearTop.top).toBeGreaterThan(nearBottom.top);
		expect(nearTop.top).toBeGreaterThan(0);
		expect(nearBottom.bottom).toBeLessThan(0);
	});

	it('reports positive width and height', () => {
		// `height` is `top - bottom`, which is only positive because of the flip.
		const ndc = domToNDC(bounds(100, 100, 200, 150), CANVAS.width, CANVAS.height);

		expect(ndc.width).toBeGreaterThan(0);
		expect(ndc.height, 'height came out negative — the Y flip is inconsistent').toBeGreaterThan(0);
	});
});

describe('ndcToDOM', () => {
	it('round-trips domToNDC', () => {
		const original = bounds(120, 340, 250, 90);

		const back = ndcToDOM(domToNDC(original, CANVAS.width, CANVAS.height), CANVAS.width, CANVAS.height);

		expect(back.x).toBeCloseTo(original.x);
		expect(back.y).toBeCloseTo(original.y);
		expect(back.width).toBeCloseTo(original.width);
		expect(back.height).toBeCloseTo(original.height);
	});
});

describe('createQuadVertices', () => {
	it('emits two triangles as six xy pairs', () => {
		const ndc = domToNDC(bounds(0, 0, 800, 600), CANVAS.width, CANVAS.height);

		const vertices = createQuadVertices(ndc);

		expect(vertices).toBeInstanceOf(Float32Array);
		expect(vertices.length, 'a quad is 6 vertices of 2 components').toBe(12);
	});

	it('covers all four corners of the bounds', () => {
		const ndc = domToNDC(bounds(100, 100, 200, 200), CANVAS.width, CANVAS.height);

		const v = Array.from(createQuadVertices(ndc));
		const xs = v.filter((_, i) => i % 2 === 0);
		const ys = v.filter((_, i) => i % 2 === 1);

		expect(Math.min(...xs)).toBeCloseTo(ndc.left);
		expect(Math.max(...xs)).toBeCloseTo(ndc.right);
		expect(Math.min(...ys)).toBeCloseTo(ndc.bottom);
		expect(Math.max(...ys)).toBeCloseTo(ndc.top);
	});
});

describe('isInViewport', () => {
	it('accepts an element on screen and rejects one past the bottom', () => {
		expect(isInViewport(bounds(10, 10, 100, 100), CANVAS.width, CANVAS.height)).toBe(true);
		expect(isInViewport(bounds(10, 9000, 100, 100), CANVAS.width, CANVAS.height)).toBe(false);
	});

	it('accepts one that only partly overlaps', () => {
		// Culling a partly-visible element would clip it at the viewport edge.
		expect(isInViewport(bounds(-50, -50, 100, 100), CANVAS.width, CANVAS.height)).toBe(true);
	});
});
