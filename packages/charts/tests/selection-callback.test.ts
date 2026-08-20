/**
 * `onSelectionChange` fired on unrelated actions and never reported a clear.
 *
 * Two independent defects in one four-line `$effect`:
 *
 *   $effect(() => {
 *     if (onSelectionChange && $store.selection.selectedData.length > 0) {
 *       onSelectionChange($store.selection.selectedData);
 *     }
 *   });
 *
 * 1. It tracks the whole `$store`, which `$state.raw` replaces on every
 *    dispatch. So a zoom animation dispatching `zoomProgress` per frame
 *    re-invoked the consumer's callback per frame with a selection that had
 *    not changed.
 * 2. The `length > 0` guard means a *cleared* selection is never delivered. A
 *    details panel wired to this callback shows the last selection forever,
 *    with no way to learn it was dismissed.
 *
 * The fix depends on a reducer property worth stating because it is what makes
 * the narrowed dependency both quiet and correct: `zoomProgress` and friends
 * spread `...state` and so preserve `selection` **by reference**
 * (`chart.reducer.ts:220-228`), while `clearSelection` allocates a fresh
 * object with a fresh `[]` (`chart.reducer.ts:179-191`). Narrowing to
 * `$derived($store.selection.selectedData)` therefore suppresses the storm on
 * identity, and still fires on the clear.
 *
 * jsdom, so no real brushing — selections are dispatched directly. That is
 * enough here: the subject is the effect's dependency and guard, not d3.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { createStore } from '@composable-svelte/core';
import { chartReducer, createInitialChartState } from '../src/lib/reducers/chart.reducer';
import Chart from '../src/lib/components/Chart.svelte';

const sampleData = [
	{ x: 1, y: 2 },
	{ x: 2, y: 4 },
	{ x: 3, y: 6 }
];

const settle = () => new Promise((resolve) => setTimeout(resolve, 250));

/** Same jsdom SVG gap as `brush-install.test.ts`; see the note there. */
function shimSvgGeometry() {
	const proto = (globalThis as any).SVGSVGElement?.prototype;
	if (!proto || 'width' in proto) return;
	const lengthFrom = (el: Element, attr: string, fallback: number) => ({
		baseVal: { value: Number(el.getAttribute(attr)) || fallback }
	});
	Object.defineProperty(proto, 'width', {
		configurable: true,
		get(this: Element) {
			return lengthFrom(this, 'width', 640);
		}
	});
	Object.defineProperty(proto, 'height', {
		configurable: true,
		get(this: Element) {
			return lengthFrom(this, 'height', 400);
		}
	});
	Object.defineProperty(proto, 'viewBox', {
		configurable: true,
		get(this: Element) {
			const [x = 0, y = 0, width = 640, height = 400] = (this.getAttribute('viewBox') ?? '')
				.split(/[\s,]+/)
				.filter(Boolean)
				.map(Number);
			return { baseVal: { x, y, width, height } };
		}
	});
}
shimSvgGeometry();

/**
 * jsdom has no `ResizeObserver`, and `Chart`'s `onMount` constructs one
 * unconditionally. Without this stub that throw suppresses the selection
 * `$effect` on its first run, so the component under test is in an error state
 * and mount-time behaviour cannot be observed at all — measured directly:
 * the same probe reports `MOUNT_CALLS=0` without the stub and `MOUNT_CALLS=1`
 * with it. Every assertion here would otherwise be about a broken mount.
 */
(globalThis as any).ResizeObserver ??= class {
	observe() {}
	unobserve() {}
	disconnect() {}
};

let cleanup: Array<() => void> = [];
afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

function mountChart() {
	const store = createStore({
		initialState: createInitialChartState({ data: sampleData }),
		reducer: chartReducer,
		dependencies: {}
	});
	const onSelectionChange = vi.fn();
	const target = document.createElement('div');
	document.body.appendChild(target);

	const component = mount(Chart, {
		target,
		props: { store, type: 'scatter' as const, x: 'x', y: 'y', onSelectionChange }
	});
	cleanup.push(() => {
		unmount(component);
		target.remove();
	});
	return { store, onSelectionChange };
}

describe('onSelectionChange', () => {
	it('does not fire at mount', async () => {
		// Asserted rather than assumed. The narrowed effect runs once on mount
		// with the initial `[]`, and forwarding that would hand every consumer an
		// unsolicited "selection cleared" at startup — a behaviour change beyond
		// the defect being fixed. The other tests `mockClear()` after mount, so
		// without this one that regression would be invisible here.
		const { onSelectionChange } = mountChart();
		await settle();

		expect(onSelectionChange).not.toHaveBeenCalled();
	});

	it('does not report a selection supplied in the initial state', async () => {
		// The same rule for a chart that mounts already-selected: the consumer
		// wrote that state, so echoing it back is noise.
		const store = createStore({
			initialState: {
				...createInitialChartState({ data: sampleData }),
				selection: { type: 'point' as const, selectedData: [sampleData[0]!], selectedIndices: [0] }
			},
			reducer: chartReducer,
			dependencies: {}
		});
		const onSelectionChange = vi.fn();
		const target = document.createElement('div');
		document.body.appendChild(target);
		const component = mount(Chart, {
			target,
			props: { store, type: 'scatter' as const, x: 'x', y: 'y', onSelectionChange }
		});
		cleanup.push(() => {
			unmount(component);
			target.remove();
		});
		await settle();

		expect(onSelectionChange).not.toHaveBeenCalled();
	});

	it('reports a selection', async () => {
		const { store, onSelectionChange } = mountChart();
		await settle();
		onSelectionChange.mockClear();

		store.dispatch({ type: 'selectPoint', data: sampleData[0]!, index: 0 });
		flushSync();
		await settle();

		expect(onSelectionChange).toHaveBeenCalledTimes(1);
		expect(onSelectionChange).toHaveBeenCalledWith([sampleData[0]]);
	});

	it('reports a cleared selection', async () => {
		// The half the `length > 0` guard silently swallowed. Without this, a
		// consumer's details panel keeps showing rows the user has dismissed.
		const { store, onSelectionChange } = mountChart();
		await settle();

		store.dispatch({ type: 'selectPoint', data: sampleData[0]!, index: 0 });
		flushSync();
		await settle();
		onSelectionChange.mockClear();

		store.dispatch({ type: 'clearSelection' });
		flushSync();
		await settle();

		expect(
			onSelectionChange,
			'a cleared selection was never delivered — the `length > 0` guard swallowed it'
		).toHaveBeenCalledTimes(1);
		expect(onSelectionChange).toHaveBeenCalledWith([]);
	});

	it('stays silent through unrelated dispatches', async () => {
		// `zoomProgress` is dispatched per animation frame. Under the old
		// whole-`$store` dependency this re-invoked the consumer callback on every
		// one of them, with an unchanged selection.
		const { store, onSelectionChange } = mountChart();
		await settle();

		store.dispatch({ type: 'selectPoint', data: sampleData[0]!, index: 0 });
		flushSync();
		await settle();
		onSelectionChange.mockClear();

		for (let i = 0; i < 20; i += 1) {
			store.dispatch({
				type: 'zoomProgress',
				transform: { k: 1 + i / 100, x: i, y: i }
			});
		}
		flushSync();
		await settle();

		expect(
			onSelectionChange,
			'the selection never changed, so the consumer should not have been told it did'
		).not.toHaveBeenCalled();
	});
});
