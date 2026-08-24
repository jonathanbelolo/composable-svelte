/**
 * A pan must move the visible domain.
 *
 * `applyZoomToDomain` used `transform.x` and `transform.y` only inside its
 * early-return guard. Past that guard it computed `center ± range/2` from the
 * domain's own midpoint — so at `k === 1` a pan fell through the guard and
 * returned the original domain bit-for-bit, and at any `k` the window was
 * always centred on the middle of the data regardless of where the user had
 * dragged to.
 *
 * The visible consequences: dragging did nothing while d3-zoom dispatched a
 * `zoom` action every frame (so the whole Plot was torn down and rebuilt per
 * frame to produce an identical image), and wheel-zooming at the edge of a
 * chart zoomed the middle. The `axis` parameter — required at every call site —
 * was never referenced by the body at all.
 *
 * SKILL.md documents "Click + drag: Pan".
 */

import { describe, it, expect } from 'vitest';
import { applyZoomToDomain } from '../src/lib/utils/plot-builder';

const domain: [number, number] = [0, 100];
const extent = 500;

describe('applyZoomToDomain', () => {
	it('returns the domain untouched for the identity transform', () => {
		expect(applyZoomToDomain(domain, { k: 1, x: 0, y: 0 }, 'x', extent)).toEqual(domain);
	});

	it('a pure pan at k=1 shifts the window without changing its width', () => {
		// Dragging content to the right (+x) reveals data to the *left*.
		const panned = applyZoomToDomain(domain, { k: 1, x: 100, y: 0 }, 'x', extent);

		expect(panned, 'a pan at k=1 returned the original domain').not.toEqual(domain);
		expect(panned[1] - panned[0], 'a pan changed the zoom level').toBeCloseTo(100, 6);
		expect(panned[0], 'panned the wrong way').toBeLessThan(0);
	});

	it('panning in opposite directions moves the window opposite ways', () => {
		const left = applyZoomToDomain(domain, { k: 1, x: -100, y: 0 }, 'x', extent);
		const right = applyZoomToDomain(domain, { k: 1, x: 100, y: 0 }, 'x', extent);

		expect(left[0]).toBeGreaterThan(right[0]);
	});

	it('a zoom narrows the window', () => {
		const zoomed = applyZoomToDomain(domain, { k: 2, x: 0, y: 0 }, 'x', extent);
		expect(zoomed[1] - zoomed[0]).toBeCloseTo(50, 6);
	});

	it('the axis argument selects which translate applies', () => {
		// It was a required parameter the body never referenced, so both axes
		// produced identical output for different transforms.
		const byX = applyZoomToDomain(domain, { k: 1, x: 100, y: 0 }, 'x', extent);
		const byY = applyZoomToDomain(domain, { k: 1, x: 100, y: 0 }, 'y', extent);

		expect(byY, 'the y axis used the x translate').toEqual(domain);
		expect(byX).not.toEqual(domain);
	});

	it('the y axis pans the opposite way, because screen y grows downward', () => {
		const down = applyZoomToDomain(domain, { k: 1, x: 0, y: 100 }, 'y', extent);
		expect(down[0], 'dragging content down should reveal higher values').toBeGreaterThan(0);
	});
});
