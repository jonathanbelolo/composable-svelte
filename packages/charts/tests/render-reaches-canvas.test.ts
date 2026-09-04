/**
 * A state change must reach the canvas.
 *
 * Every other test in this package asserts that the *reducer* is right, and
 * every render bug below survived in the gap between "state is correct" and
 * "pixels are correct". `ChartPrimitive` decided whether to re-render by
 * comparing `data.length`, `filteredData.length`,
 * `selection.selectedIndices.length` and the three transform scalars — so:
 *
 * - `dimensions` was not in the set at all, and is the only thing the plot
 *   builders read for width/height. Every resize was inert.
 * - `setData` with an equal row count never redrew: a re-sort, a re-map, a
 *   sliding window. The shipped `DataTransformsDemo`'s Sort button dispatches
 *   exactly that, 12 rows to 12 rows, and does nothing.
 * - Moving a selection from one point to another never redrew, because only the
 *   *count* was compared.
 *
 * The store is `$state.raw` and every reducer arm returns a new object — this
 * package's reducer is immutable, its only `push` calls being on fresh local
 * arrays — so identity is exactly the signal that was being thrown away.
 *
 * jsdom has no layout, so these assert on the produced SVG rather than on
 * pixels. That is enough for all three: each is a structural difference.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount } from 'svelte';
import { createStore } from '@composable-svelte/core';
import { chartReducer, createInitialChartState } from '../src/lib/reducers/chart.reducer';
import { buildScatterPlot } from '../src/lib/utils/plot-builder';
import ChartPrimitive from '../src/lib/components/ChartPrimitive.svelte';

const rows = [
	{ x: 1, y: 10, label: 'a' },
	{ x: 2, y: 20, label: 'b' },
	{ x: 3, y: 30, label: 'c' }
];

const settle = () => new Promise((resolve) => setTimeout(resolve, 250));

let cleanup: Array<() => void> = [];
afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

function mountChart(extraProps: Record<string, unknown> = {}) {
	const store = createStore({
		initialState: createInitialChartState({ data: rows }),
		reducer: chartReducer,
		dependencies: {}
	});
	const target = document.createElement('div');
	document.body.appendChild(target);
	const component = mount(ChartPrimitive, {
		target,
		props: {
			store,
			config: { type: 'scatter' as const, x: 'x', y: 'y' },
			plotBuilder: buildScatterPlot,
			...extraProps
		}
	});
	cleanup.push(() => {
		unmount(component);
		target.remove();
	});
	return { target, store };
}

/** The x-position of every dot, in document order — the plot's shape. */
function dotPositions(target: HTMLElement): string[] {
	return Array.from(target.querySelectorAll('svg circle')).map(
		(c) => c.getAttribute('cx') ?? '?'
	);
}

describe('a state change reaches the canvas', () => {
	it('a resize changes the rendered SVG size', async () => {
		const { target, store } = mountChart();
		await settle();

		const before = target.querySelector('svg')?.getAttribute('width');
		expect(before, 'nothing rendered').not.toBeNull();

		store.dispatch({ type: 'resize', dimensions: { width: 900, height: 550 } });
		await settle();

		expect(
			target.querySelector('svg')?.getAttribute('width'),
			'the resize never reached the SVG — `dimensions` was not in the re-render trigger set'
		).not.toBe(before);
	});

	it('re-sorting the same rows redraws', async () => {
		const { target, store } = mountChart();
		await settle();

		const before = dotPositions(target);
		expect(before.length, 'no dots rendered').toBe(3);

		// Same row count, different order — what `DataTransforms.sortBy` produces.
		store.dispatch({ type: 'setData', data: [...rows].reverse() });
		await settle();

		expect(
			dotPositions(target),
			'a re-sort of equal length never redrew — the Sort button in the styleguide does nothing'
		).not.toEqual(before);
	});

	it('moving the selection redraws', async () => {
		const { target, store } = mountChart();
		await settle();

		store.dispatch({ type: 'selectPoint', data: rows[0], index: 0 });
		await settle();
		const withFirst = target.querySelector('svg')?.innerHTML ?? '';

		// One selected before, one selected after — the count is unchanged.
		store.dispatch({ type: 'selectPoint', data: rows[2], index: 2 });
		await settle();

		expect(
			target.querySelector('svg')?.innerHTML ?? '',
			'the highlight never moved — only the selection *count* was compared'
		).not.toBe(withFirst);
	});
});
