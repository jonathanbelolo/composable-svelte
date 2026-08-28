/**
 * A brush selects the points inside it, and nothing else.
 *
 * The brush computed the indices it had actually hit and then threw that
 * information away, dispatching `selectRange: [min, max]`. `selectRange`
 * describes a *contiguous* span, so a gesture catching the first and last points
 * of a scattered cloud reported a range covering everything between them, and
 * the reducer selected all of it. Nothing failed; the user simply saw rows
 * highlighted that the brush never touched, and `onSelectionChange` was handed
 * them too.
 *
 * `selectRange` is unchanged and still means what it says — a genuine range. The
 * brush now uses `selectPoints`, which can express a set.
 */

import { describe, it, expect } from 'vitest';
import { chartReducer, createInitialChartState } from '../src/lib/reducers/chart.reducer';
import type { ChartState } from '../src/lib/types/chart.types';

const rows = [
	{ x: 1, y: 10 },
	{ x: 2, y: 20 },
	{ x: 3, y: 30 },
	{ x: 4, y: 40 },
	{ x: 5, y: 50 }
];

const base = () => createInitialChartState({ data: rows });
const run = (state: ChartState<any>, action: any) => chartReducer(state, action, {})[0];

describe('selectPoints takes the points it is given', () => {
	it('selects a scattered set without filling in the gaps', () => {
		// The defect, stated as a test. Under `selectRange: [0, 4]` this returned
		// all five rows.
		const next = run(base(), { type: 'selectPoints', indices: [0, 4] });

		expect(next.selection.selectedIndices).toEqual([0, 4]);
		expect(next.selection.selectedData).toEqual([rows[0], rows[4]]);
	});

	it('marks the selection as a brush', () => {
		expect(run(base(), { type: 'selectPoints', indices: [1, 3] }).selection.type).toBe('brush');
	});

	it('selects a contiguous run when that is genuinely what was caught', () => {
		const next = run(base(), { type: 'selectPoints', indices: [1, 2, 3] });
		expect(next.selection.selectedIndices).toEqual([1, 2, 3]);
	});

	it('keeps selectRange meaning a range', () => {
		// The old behaviour is still available where it is the right description,
		// so this commit removes nothing.
		const next = run(base(), { type: 'selectRange', range: [1, 3] });
		expect(next.selection.type).toBe('range');
		expect(next.selection.selectedIndices).toEqual([1, 2, 3]);
	});
});

describe('selectPoints refuses what it cannot honour', () => {
	it('drops indices past the end of the data', () => {
		const next = run(base(), { type: 'selectPoints', indices: [1, 99] });
		expect(next.selection.selectedIndices).toEqual([1]);
	});

	it('drops duplicates', () => {
		const next = run(base(), { type: 'selectPoints', indices: [2, 2, 3] });
		expect(next.selection.selectedIndices).toEqual([2, 3]);
		expect(next.selection.selectedData.length).toBe(2);
	});

	it('treats an empty brush as no selection rather than an empty brush', () => {
		// `type: 'brush'` with nothing in it would report an active brush holding
		// no rows, which no consumer can act on sensibly.
		const selected = run(base(), { type: 'selectPoints', indices: [0, 1] });
		const cleared = run(selected, { type: 'selectPoints', indices: [] });

		expect(cleared.selection.type).toBe('none');
		expect(cleared.selection.selectedIndices).toEqual([]);
		expect(cleared.selection.selectedData).toEqual([]);
	});
});

describe('selectPoints does not re-notify for an unchanged selection', () => {
	it('returns the identical state when the same points are re-brushed', () => {
		// A brush end fires on every gesture. Without this, dragging out the same
		// rectangle twice handed `onSelectionChange` an equal-but-new array —
		// the defect already fixed for selectPoint, selectRange and
		// clearSelection.
		const first = run(base(), { type: 'selectPoints', indices: [1, 3] });
		expect(run(first, { type: 'selectPoints', indices: [1, 3] })).toBe(first);
	});

	it('still reports a genuinely different set', () => {
		// Non-vacuity for the test above, which would pass if selectPoints did
		// nothing at all.
		const first = run(base(), { type: 'selectPoints', indices: [1, 3] });
		const second = run(first, { type: 'selectPoints', indices: [1, 4] });
		expect(second).not.toBe(first);
		expect(second.selection.selectedIndices).toEqual([1, 4]);
	});

	it('does not re-notify when an empty brush follows an empty selection', () => {
		const empty = run(base(), { type: 'selectPoints', indices: [] });
		expect(run(empty, { type: 'selectPoints', indices: [] })).toBe(empty);
	});
});
