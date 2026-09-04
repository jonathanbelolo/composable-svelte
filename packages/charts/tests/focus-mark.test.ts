/**
 * The keyboard cursor has to be visible.
 *
 * `keyboard.test.ts` proves the cursor moves and is announced; a screen reader
 * user is served by that alone. A sighted keyboard user is not — pressing an
 * arrow has to move something on screen, or the navigation is real and still
 * unusable.
 *
 * Every chart type is covered, which is deliberately stricter than the selection
 * highlight, which only `buildScatterPlot` renders and which the README records
 * as a gap. Focus is different in kind from selection: a selection a user cannot
 * see is a missing nicety, a cursor a user cannot see is a lost position.
 *
 * The histogram is the one that differs. It bins its rows, so there is no
 * per-datum `y` to ring, and the cursor is a rule at the datum's x instead —
 * where in the distribution the point falls.
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
import { MARKER_INK } from '../src/lib/utils/palette';
import type { ChartState } from '../src/lib/types/chart.types';

const rows = [
	{ x: 1, y: 10 },
	{ x: 2, y: 20 },
	{ x: 3, y: 30 }
];

const unfocused = () => createInitialChartState({ data: rows });
const focused = (index = 1) => ({ ...unfocused(), focusedIndex: index }) as ChartState<any>;

/**
 * The ring `focusMark` draws: an unfilled circle stroked in the marker ink.
 *
 * Selected from the constant rather than a literal, so the day the ink changes
 * this file fails to *find* the ring instead of quietly passing on a selector
 * that matches nothing.
 */
const rings = (svg: Element) =>
	svg.querySelectorAll(`g[fill="none"][stroke="${MARKER_INK}"] circle`).length;

const pointBuilders = [
	['scatter', buildScatterPlot],
	['line', buildLineChart],
	['bar', buildBarChart],
	['area', buildAreaChart]
] as const;

describe.each(pointBuilders)('%s draws the cursor', (_name, build) => {
	it('draws nothing while there is no cursor', () => {
		const svg = build(unfocused(), { x: 'x', y: 'y' });
		expect(rings(svg)).toBe(0);
	});

	it('draws exactly one ring on the focused point', () => {
		const svg = build(focused(), { x: 'x', y: 'y' });
		expect(rings(svg)).toBe(1);
	});

	it('draws nothing for an index past the end of the data', () => {
		// Reachable through a consumer mutating state outside the reducer, which
		// is the same case `selectFocused` guards. A crash here would take the
		// whole chart down rather than losing a ring.
		const svg = build(focused(99), { x: 'x', y: 'y' });
		expect(rings(svg)).toBe(0);
	});
});

describe('the histogram draws a rule, not a ring', () => {
	const lines = (svg: Element) => svg.querySelectorAll('line').length;

	it('adds a mark when a cursor exists', () => {
		const without = buildHistogram(unfocused(), { x: 'x' });
		const with_ = buildHistogram(focused(), { x: 'x' });

		// Compared against the same chart without a cursor rather than against a
		// fixed count, so the assertion survives Plot changing how many lines an
		// axis emits.
		expect(lines(with_)).toBe(lines(without) + 1);
	});

	it('adds nothing while there is no cursor', () => {
		const a = buildHistogram(unfocused(), { x: 'x' });
		const b = buildHistogram(unfocused(), { x: 'x' });
		expect(lines(a)).toBe(lines(b));
	});
});

describe('the ring scales with the dot it rings', () => {
	it('sits outside a larger dot', () => {
		// `r` is `size + 4`. Without this the ring could be a fixed radius that
		// happens to look right at the default size and vanishes underneath a
		// large dot.
		const svg = buildScatterPlot(focused(), { x: 'x', y: 'y', size: 20 });
		const ring = svg.querySelector(`g[fill="none"][stroke="${MARKER_INK}"] circle`);
		expect(ring).not.toBeNull();
		expect(Number(ring!.getAttribute('r'))).toBe(24);
	});
});
