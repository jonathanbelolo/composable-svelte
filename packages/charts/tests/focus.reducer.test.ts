/**
 * The keyboard cursor, at the reducer level.
 *
 * `focusedIndex` is what makes a chart reachable without a pointer: the arrow
 * keys move it, the live region announces where it landed, and `selectFocused`
 * is the one action that turns it into a selection. Keeping the whole of that in
 * the reducer is what makes it testable here, with no DOM and no key events —
 * `Chart.svelte` only maps keys onto these actions.
 *
 * Two properties are load-bearing and easy to lose later:
 *
 * - **A no-op returns the identical state object.** Holding an arrow key at the
 *   end of the data repeats the action; allocating an equal state on each repeat
 *   would churn `$store` for every keystroke. `toBe`, not `toEqual`, is the
 *   assertion that can tell those apart.
 * - **A data change clears the cursor.** An index into `filteredData` that
 *   outlives its rows does not fail loudly, it points at a different datum than
 *   the one that was announced.
 */

import { describe, it, expect } from 'vitest';
import { chartReducer, createInitialChartState } from '../src/lib/reducers/chart.reducer';
import type { ChartState } from '../src/lib/types/chart.types';

const rows = [
	{ x: 1, y: 10 },
	{ x: 2, y: 20 },
	{ x: 3, y: 30 }
];

const base = () => createInitialChartState({ data: rows });
const at = (index: number | null): ChartState<(typeof rows)[number]> => ({
	...base(),
	focusedIndex: index
});

/** The reducer's state half, which is all these tests care about. */
const run = (state: ChartState<any>, action: any) => chartReducer(state, action, {})[0];

describe('the cursor starts absent', () => {
	it('is null in a fresh state', () => {
		expect(base().focusedIndex).toBeNull();
	});
});

describe('entering the chart', () => {
	it('puts focusNext on the first point', () => {
		expect(run(at(null), { type: 'focusNext' }).focusedIndex).toBe(0);
	});

	it('puts focusPrevious on the first point too', () => {
		// Arriving, not continuing. Wrapping to the last point on a first Left
		// press reads as a bug to the user who just tabbed in.
		expect(run(at(null), { type: 'focusPrevious' }).focusedIndex).toBe(0);
	});

	it('puts focusLast on the last point', () => {
		expect(run(at(null), { type: 'focusLast' }).focusedIndex).toBe(2);
	});
});

describe('moving the cursor', () => {
	it('advances', () => {
		expect(run(at(0), { type: 'focusNext' }).focusedIndex).toBe(1);
	});

	it('retreats', () => {
		expect(run(at(2), { type: 'focusPrevious' }).focusedIndex).toBe(1);
	});

	it('jumps to the first and last', () => {
		expect(run(at(1), { type: 'focusFirst' }).focusedIndex).toBe(0);
		expect(run(at(1), { type: 'focusLast' }).focusedIndex).toBe(2);
	});
});

describe('the ends are stops, not wraps', () => {
	it('stays on the last point', () => {
		const state = at(2);
		const next = run(state, { type: 'focusNext' });
		expect(next.focusedIndex).toBe(2);
		// Identity, not equality: this is the held-key case.
		expect(next).toBe(state);
	});

	it('stays on the first point', () => {
		const state = at(0);
		const next = run(state, { type: 'focusPrevious' });
		expect(next.focusedIndex).toBe(0);
		expect(next).toBe(state);
	});
});

describe('an empty chart has nowhere to go', () => {
	it('leaves the cursor null and the state untouched', () => {
		const empty = createInitialChartState({ data: [] });
		for (const type of ['focusNext', 'focusPrevious', 'focusFirst', 'focusLast']) {
			const next = run(empty, { type });
			expect(next.focusedIndex).toBeNull();
			expect(next).toBe(empty);
		}
	});
});

describe('focusPoint refuses an index it cannot honour', () => {
	it('takes a valid index', () => {
		expect(run(at(null), { type: 'focusPoint', index: 2 }).focusedIndex).toBe(2);
	});

	it.each([-1, 3, 99, 1.5, NaN])('ignores %s', (index) => {
		// Ignored rather than clamped. A caller holding a stale index should get
		// nothing, not a silently different point.
		const state = at(1);
		const next = run(state, { type: 'focusPoint', index });
		expect(next).toBe(state);
		expect(next.focusedIndex).toBe(1);
	});

	it('is idempotent on the index already focused', () => {
		const state = at(1);
		expect(run(state, { type: 'focusPoint', index: 1 })).toBe(state);
	});
});

describe('clearFocus', () => {
	it('clears', () => {
		expect(run(at(1), { type: 'clearFocus' }).focusedIndex).toBeNull();
	});

	it('is idempotent when there is nothing to clear', () => {
		const state = at(null);
		expect(run(state, { type: 'clearFocus' })).toBe(state);
	});
});

describe('a data change clears the cursor', () => {
	it('on setData', () => {
		expect(run(at(2), { type: 'setData', data: [{ x: 9, y: 9 }] }).focusedIndex).toBeNull();
	});

	it('on filterData', () => {
		// The dangerous case, and the reason this rule exists: index 2 survives
		// the filter as a valid index into two rows only by accident, and would
		// name a different datum than the one that was announced.
		const filtered = run(at(2), { type: 'filterData', predicate: (d: any) => d.x > 1 });
		expect(filtered.filteredData.length).toBe(2);
		expect(filtered.focusedIndex).toBeNull();
	});

	it('on clearFilters', () => {
		expect(run(at(1), { type: 'clearFilters' }).focusedIndex).toBeNull();
	});
});

describe('selectFocused is the only crossing from cursor to selection', () => {
	it('selects the focused point', () => {
		const next = run(at(1), { type: 'selectFocused' });
		expect(next.selection.type).toBe('point');
		expect(next.selection.selectedIndices).toEqual([1]);
		expect(next.selection.selectedData).toEqual([rows[1]]);
	});

	it('leaves the cursor where it is', () => {
		expect(run(at(1), { type: 'selectFocused' }).focusedIndex).toBe(1);
	});

	it('does nothing with no cursor', () => {
		const state = at(null);
		const next = run(state, { type: 'selectFocused' });
		expect(next).toBe(state);
		expect(next.selection.type).toBe('none');
	});

	it('is idempotent on an already-selected point', () => {
		// Enter on a selected point is ordinary use, and re-allocating the
		// selection would re-fire `onSelectionChange` with equal contents — the
		// defect `selectPoint` was already fixed for.
		const selected = run(at(1), { type: 'selectFocused' });
		expect(run(selected, { type: 'selectFocused' })).toBe(selected);
	});

	it('does not select merely by moving', () => {
		// The property that keeps a details panel from changing on every
		// keystroke. Moving the cursor must leave `selection` untouched, by
		// identity.
		const start = at(0);
		const moved = run(start, { type: 'focusNext' });
		expect(moved.focusedIndex).toBe(1);
		expect(moved.selection).toBe(start.selection);
	});
});

describe('zoomIn / zoomOut step the scale', () => {
	it('records a larger target', () => {
		const next = run(base(), { type: 'zoomIn' });
		expect(next.isAnimating).toBe(true);
		expect(next.targetTransform!.k).toBeCloseTo(1.5);
	});

	it('records a smaller target', () => {
		const next = run(base(), { type: 'zoomOut' });
		expect(next.targetTransform!.k).toBeCloseTo(1 / 1.5);
	});

	it('keeps the pan while changing the scale', () => {
		const panned = { ...base(), transform: { x: 20, y: -5, k: 1 } };
		const next = run(panned, { type: 'zoomIn' });
		expect(next.targetTransform!.x).toBe(20);
		expect(next.targetTransform!.y).toBe(-5);
	});

	it('clamps at the top of the extent, and stops allocating there', () => {
		const maxed = { ...base(), transform: { x: 0, y: 0, k: 10 } };
		const next = run(maxed, { type: 'zoomIn' });
		expect(next).toBe(maxed);
	});

	it('clamps at the bottom of the extent', () => {
		const minned = { ...base(), transform: { x: 0, y: 0, k: 0.5 } };
		const next = run(minned, { type: 'zoomOut' });
		expect(next).toBe(minned);
	});

	it('reaches the stop from just inside it rather than overshooting', () => {
		// Non-vacuity for the two clamp tests above: they would also pass if
		// `zoomIn` were a no-op everywhere. This one proves the clamp is a clamp.
		const near = { ...base(), transform: { x: 0, y: 0, k: 9 } };
		const next = run(near, { type: 'zoomIn' });
		expect(next).not.toBe(near);
		expect(next.targetTransform!.k).toBe(10);
	});
});
