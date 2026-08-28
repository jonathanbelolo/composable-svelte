/**
 * Selecting a point must not delete the others.
 *
 * `buildScatterPlot` dimmed unselected points with `fillOpacity` and, in the
 * same mark, set `stroke` to a function returning `null` for them. Observable
 * Plot **drops** a datum whose channel value is null rather than drawing it
 * without that property — so selecting one point removed every other point from
 * the chart, and the `fillOpacity` beside it spent its effort on rows that were
 * no longer rendered.
 *
 * Found by driving the styleguide in a real browser rather than by any test
 * here: every assertion in this package was about state, callbacks or a single
 * chart with nothing selected, and this defect only appears on screen, only
 * once something is selected. jsdom would have shown it too — nobody had looked.
 *
 * It reached a user the moment `Enter` became a way to select, which is why it
 * is fixed here rather than left in the backlog it was found from.
 */

import { describe, it, expect } from 'vitest';
import { buildScatterPlot } from '../src/lib/utils/plot-builder';
import { createInitialChartState } from '../src/lib/reducers/chart.reducer';
import type { ChartState } from '../src/lib/types/chart.types';

const rows = Array.from({ length: 10 }, (_, i) => ({ x: i, y: i * 2 }));

const unselected = () => createInitialChartState({ data: rows });
const withSelection = (indices: number[]): ChartState<any> => ({
	...unselected(),
	selection: {
		type: 'point',
		selectedData: indices.map((i) => rows[i]),
		selectedIndices: indices
	}
});

/** Data dots only — the focus ring, when there is one, lives in its own group. */
const dataDots = (svg: Element) =>
	svg.querySelectorAll('g[fill="#3b82f6"] circle').length;

describe('a selection changes how points look, not whether they exist', () => {
	it('draws every point when nothing is selected', () => {
		// The control. Without it, a builder that drew nothing at all would
		// satisfy the "same count" assertion below.
		expect(dataDots(buildScatterPlot(unselected(), { x: 'x', y: 'y' }))).toBe(10);
	});

	it('still draws every point when one is selected', () => {
		expect(dataDots(buildScatterPlot(withSelection([2]), { x: 'x', y: 'y' }))).toBe(10);
	});

	it('still draws every point when several are selected', () => {
		expect(dataDots(buildScatterPlot(withSelection([0, 5, 9]), { x: 'x', y: 'y' }))).toBe(10);
	});

	it('dims the unselected rather than removing them', () => {
		const svg = buildScatterPlot(withSelection([2]), { x: 'x', y: 'y' });
		const opacities = [...svg.querySelectorAll('g[fill="#3b82f6"] circle')].map((c) =>
			c.getAttribute('fill-opacity')
		);

		// One at full strength, nine faint — and nine is the number that used to
		// be zero.
		expect(opacities.filter((o) => o === '1').length).toBe(1);
		expect(opacities.filter((o) => o === '0.2').length).toBe(9);
	});
});
