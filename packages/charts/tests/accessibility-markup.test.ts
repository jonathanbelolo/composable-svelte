/**
 * The chart's accessibility markup must describe *this* chart, always, and
 * truthfully.
 *
 * Three defects, all in `Chart.svelte`, all of which a screen reader user hits
 * and a sighted user never sees:
 *
 * - `id="chart-summary"` was a hardcoded literal. Two charts on one page emit
 *   duplicate DOM ids, and `getElementById` — which is how `aria-describedby`
 *   resolves — returns the **first**. Every chart after the first was described
 *   by another chart's data. The styleguide renders one demo at a time, which is
 *   why nothing caught it; a dashboard is the normal case for a charts library.
 * - The summary body sat inside `{#if x && y}`, but both props are optional and
 *   Observable Plot renders without them. Pass `x` alone and `aria-describedby`
 *   pointed at an empty element — a reference that resolves to nothing.
 * - `aria-label` counted `data.length` while the summary counted `filteredData`.
 *   After any `filterData` the label overstated the point count, so the two
 *   halves of the same description disagreed.
 *
 * Each test mounts the fixture that can distinguish the bug from the fix, which
 * is not the convenient one: a single chart passes the id test with the defect
 * fully present, and a filter that removes nothing passes the count test.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { createStore } from '@composable-svelte/core';
import { chartReducer, createInitialChartState } from '../src/lib/reducers/chart.reducer';
import Chart from '../src/lib/components/Chart.svelte';
import { installResizeObserverStub } from './helpers/jsdom-shims';

installResizeObserverStub();

const sampleData = [
	{ x: 1, y: 10 },
	{ x: 2, y: 20 },
	{ x: 3, y: 30 },
	{ x: 4, y: 40 }
];

const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

let cleanup: Array<() => void> = [];
afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

function mountChart(props: Record<string, unknown> = {}) {
	const store = createStore({
		initialState: createInitialChartState({ data: sampleData }),
		reducer: chartReducer,
		dependencies: {}
	});
	const target = document.createElement('div');
	document.body.appendChild(target);
	const component = mount(Chart, {
		target,
		props: { store, type: 'scatter' as const, x: 'x', y: 'y', ...props }
	});
	cleanup.push(() => {
		unmount(component);
		target.remove();
	});
	const container = target.querySelector('.chart-container');
	return { store, target, container };
}

describe('the summary a chart points at is its own', () => {
	it('gives two charts on one page different summary ids', async () => {
		const first = mountChart();
		const second = mountChart();
		await settle();

		// Non-vacuous first: if the containers or the references are missing, the
		// inequality below would pass on two `null`s and prove nothing.
		expect(first.container).not.toBeNull();
		expect(second.container).not.toBeNull();
		const a = first.container!.getAttribute('aria-describedby');
		const b = second.container!.getAttribute('aria-describedby');
		expect(a).toBeTruthy();
		expect(b).toBeTruthy();

		expect(a).not.toBe(b);
	});

	it('resolves each reference to a summary inside that same chart', async () => {
		// The stronger property, and the one a user actually experiences. Distinct
		// ids are not enough on their own — `document.getElementById` is what the
		// accessibility tree consults, so the test has to follow the same route
		// rather than reading the attribute and stopping.
		const first = mountChart();
		const second = mountChart();
		await settle();

		for (const chart of [first, second]) {
			const ref = chart.container!.getAttribute('aria-describedby')!;
			const summary = document.getElementById(ref);
			expect(summary).not.toBeNull();
			expect(chart.container!.contains(summary)).toBe(true);
		}
	});
});

describe('the summary always says something', () => {
	it('describes a chart given only an x accessor', async () => {
		const { container } = mountChart({ y: undefined });
		await settle();

		const ref = container!.getAttribute('aria-describedby')!;
		const summary = document.getElementById(ref);
		expect(summary).not.toBeNull();
		expect(summary!.textContent!.trim().length).toBeGreaterThan(0);
	});

	it('describes a chart given neither accessor', async () => {
		const { container } = mountChart({ x: undefined, y: undefined });
		await settle();

		const ref = container!.getAttribute('aria-describedby')!;
		const summary = document.getElementById(ref);
		expect(summary).not.toBeNull();
		expect(summary!.textContent!.trim().length).toBeGreaterThan(0);
	});
});

describe('the label and the summary agree', () => {
	it('reports the filtered count in the label once a filter is applied', async () => {
		const { store, container } = mountChart();
		await settle();

		// A filter that genuinely removes rows. With a predicate that keeps
		// everything, `data.length` and `filteredData.length` are equal and this
		// passes with the defect fully present.
		store.dispatch({ type: 'filterData', predicate: (d: any) => d.x > 2 });
		flushSync();
		await settle();

		expect(store.state.filteredData.length).toBe(2);
		expect(store.state.data.length).toBe(4);

		const label = container!.getAttribute('aria-label');
		expect(label).toBeTruthy();
		// Names the shown count, and the total as context. The negative arm is
		// written against "showing 4" rather than "4 data points" on purpose:
		// the correct output is "showing 2 of 4 data points", which contains the
		// looser phrase, so the loose form fails the fix it was written for.
		expect(label).toContain('showing 2 of 4 data points');
		expect(label).not.toMatch(/showing 4 data points/);
	});
});
