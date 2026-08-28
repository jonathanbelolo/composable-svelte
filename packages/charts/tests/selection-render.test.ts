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
import {
	buildScatterPlot,
	buildLineChart,
	buildBarChart,
	buildAreaChart,
	buildHistogram
} from '../src/lib/utils/plot-builder';
import { createInitialChartState } from '../src/lib/reducers/chart.reducer';
import { DATA_OPACITY, DIMMED_OPACITY, MARKER_INK } from '../src/lib/utils/palette';
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

/**
 * The circles of the *data* mark.
 *
 * The first group containing circles, which is the same rule `ChartPrimitive`'s
 * brush hit-testing uses: every builder appends the selection overlay and the
 * focus ring after the mark they annotate. Matching on `fill="#3b82f6"` was
 * enough while the data dots were the only blue circles, and stopped being
 * enough the moment the selection overlay drew in the same colour.
 */
const dataDots = (svg: Element) => {
	for (const group of [...svg.querySelectorAll('g')]) {
		const circles = group.querySelectorAll('circle');
		if (circles.length > 0) return circles.length;
	}
	return 0;
};

const dataDotOpacities = (svg: Element) => {
	for (const group of [...svg.querySelectorAll('g')]) {
		const circles = [...group.querySelectorAll('circle')];
		if (circles.length > 0) return circles.map((c) => c.getAttribute('fill-opacity'));
	}
	return [];
};

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
		const opacities = dataDotOpacities(svg);

		// One at full strength, nine faint — and nine is the number that used to
		// be zero.
		expect(opacities.filter((o) => o === String(DATA_OPACITY)).length).toBe(1);
		expect(opacities.filter((o) => o === String(DIMMED_OPACITY)).length).toBe(9);
	});
});

describe('every chart type shows its selection', () => {
	// The gap the README carried for three rounds: `state.selection` was read by
	// `buildScatterPlot` alone, so on the other four types a selection was real
	// in the store, reported through `onSelectionChange`, announced to a screen
	// reader — and invisible.
	const overlayDots = (svg: Element) =>
		svg.querySelectorAll(`g[stroke="${MARKER_INK}"][stroke-width="1.5"] circle`).length;

	const pointBuilders = [
		['scatter', buildScatterPlot],
		['line', buildLineChart],
		['bar', buildBarChart],
		['area', buildAreaChart]
	] as const;

	it.each(pointBuilders)('%s draws nothing extra with no selection', (_n, build) => {
		expect(overlayDots(build(unselected(), { x: 'x', y: 'y' }))).toBe(0);
	});

	it.each(pointBuilders)('%s marks one selected point', (_n, build) => {
		expect(overlayDots(build(withSelection([3]), { x: 'x', y: 'y' }))).toBe(1);
	});

	it.each(pointBuilders)('%s marks several selected points', (_n, build) => {
		expect(overlayDots(build(withSelection([0, 4, 8]), { x: 'x', y: 'y' }))).toBe(3);
	});

	it('the histogram marks its selection with a rule', () => {
		const without = buildHistogram(unselected(), { x: 'x' });
		const with_ = buildHistogram(withSelection([2, 5]), { x: 'x' });
		// Two selected rows, so two rules, counted against the same chart with
		// none rather than against a constant.
		expect(with_.querySelectorAll('line').length).toBe(
			without.querySelectorAll('line').length + 2
		);
	});

	it('drops a selected index the data no longer has', () => {
		expect(overlayDots(buildScatterPlot(withSelection([99]), { x: 'x', y: 'y' }))).toBe(0);
	});

	it('keeps selection and focus visually distinct', () => {
		// Selected is filled, focused is an unfilled ring, and a point that is
		// both shows one inside the other. Same radius for both would make the
		// two states indistinguishable at a glance.
		const both = { ...withSelection([3]), focusedIndex: 3 };
		const svg = buildScatterPlot(both, { x: 'x', y: 'y' });

		expect(overlayDots(svg)).toBe(1);
		const ring = svg.querySelector(`g[fill="none"][stroke="${MARKER_INK}"] circle`);
		expect(ring).not.toBeNull();

		const selected = svg.querySelector(`g[stroke="${MARKER_INK}"][stroke-width="1.5"] circle`);
		expect(Number(ring!.getAttribute('r'))).toBeGreaterThan(
			Number(selected!.getAttribute('r'))
		);
	});
});
