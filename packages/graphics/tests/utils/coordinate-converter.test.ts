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
	createQuadVertices,
	type NDCBounds
} from '../../src/lib/utils/coordinate-converter.js';

const CANVAS = { width: 800, height: 600 };
const bounds = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

/**
 * The inverse of `domToNDC`, written here rather than imported.
 *
 * `coordinate-converter.ts` shipped an `ndcToDOM` with no caller anywhere; it
 * went with the rest of the unreachable surface. Deriving the inverse
 * independently makes the round-trip below a stronger oracle than importing the
 * shipped one would have been — two implementations agreeing, rather than one
 * checked against its own author.
 */
function ndcToDOM(ndc: NDCBounds, canvasWidth: number, canvasHeight: number) {
	return {
		x: ((ndc.left + 1) / 2) * canvasWidth,
		y: ((1 - ndc.top) / 2) * canvasHeight,
		width: (ndc.width / 2) * canvasWidth,
		height: (ndc.height / 2) * canvasHeight
	};
}

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

describe('domToNDC is invertible', () => {
	it('round-trips through an independently derived inverse', () => {
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

	it('emits two non-degenerate triangles that between them cover the quad', () => {
		// The two assertions above cannot see half the quad disappear:
		// collapsing triangle 1's second and third vertices onto the top-left
		// corner leaves a zero-area triangle, and the survivor still supplies
		// every extreme of `xs` and `ys`. A missing triangle is a quad rendered
		// as a triangle — no error, just half the element.
		const ndc = domToNDC(bounds(100, 100, 200, 200), CANVAS.width, CANVAS.height);

		const v = Array.from(createQuadVertices(ndc));
		const points = Array.from({ length: 6 }, (_, i) => [v[i * 2]!, v[i * 2 + 1]!] as const);
		const area = ([ax, ay]: readonly [number, number], [bx, by]: readonly [number, number], [cx, cy]: readonly [number, number]) =>
			((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / 2;

		const first = area(points[0]!, points[1]!, points[2]!);
		const second = area(points[3]!, points[4]!, points[5]!);
		const quad = (ndc.right - ndc.left) * (ndc.top - ndc.bottom);

		expect(Math.abs(first), 'triangle 1 is degenerate').toBeGreaterThan(0);
		expect(Math.abs(second), 'triangle 2 is degenerate').toBeGreaterThan(0);
		expect(
			Math.abs(first) + Math.abs(second),
			'the two triangles do not add up to the quad'
		).toBeCloseTo(quad);
	});

	it('winds both triangles the same way', () => {
		// Opposite winding makes one of the two faces cull under
		// `gl.cullFace`, which shows up as a triangular hole rather than an
		// error. Sign, not magnitude, is the whole assertion.
		const ndc = domToNDC(bounds(100, 100, 200, 200), CANVAS.width, CANVAS.height);

		const v = Array.from(createQuadVertices(ndc));
		const points = Array.from({ length: 6 }, (_, i) => [v[i * 2]!, v[i * 2 + 1]!] as const);
		const cross = ([ax, ay]: readonly [number, number], [bx, by]: readonly [number, number], [cx, cy]: readonly [number, number]) =>
			(bx - ax) * (cy - ay) - (cx - ax) * (by - ay);

		expect(
			Math.sign(cross(points[0]!, points[1]!, points[2]!)),
			'the two triangles wind in opposite directions'
		).toBe(Math.sign(cross(points[3]!, points[4]!, points[5]!)));
	});
});
