/**
 * The data, for anyone who cannot read a picture of it.
 *
 * The README listed "a data table fallback" among the things this package did
 * not have. It is the cheapest large win in charting accessibility: keyboard
 * navigation makes the points reachable one at a time, but reading a series,
 * comparing two rows or scanning for an outlier all want a table.
 *
 * The structural property is the one worth defending hardest: the table must sit
 * **outside** the `role="application"` element. `application` tells a screen
 * reader to stop browsing and pass keystrokes through, which is right for the
 * plot and exactly wrong for a table someone needs to read row by row. A table
 * nested inside it would be present in the DOM, pass every content assertion,
 * and still be unreachable in practice.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { createStore } from '@composable-svelte/core';
import { chartReducer, createInitialChartState } from '../src/lib/reducers/chart.reducer';
import Chart from '../src/lib/components/Chart.svelte';
import { installResizeObserverStub } from './helpers/jsdom-shims';

installResizeObserverStub();

const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

let cleanup: Array<() => void> = [];
afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

function mountChart(data: any[], props: Record<string, unknown> = {}) {
	const store = createStore({
		initialState: createInitialChartState({ data }),
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
	return {
		store,
		container: target.querySelector('.chart-container') as HTMLElement,
		surface: target.querySelector('.chart-surface') as HTMLElement,
		table: target.querySelector('table') as HTMLTableElement | null
	};
}

const rows = [
	{ x: 1, y: 10 },
	{ x: 2, y: 20 },
	{ x: 3, y: 30 }
];

describe('the table is reachable', () => {
	it('exists', async () => {
		const { table } = mountChart(rows);
		await settle();
		expect(table).not.toBeNull();
	});

	it('sits outside the application region', async () => {
		// The whole reason Chart renders two nested divs rather than one. If this
		// fails, every other assertion in this file still passes and the table is
		// still useless.
		const { container, surface, table } = mountChart(rows);
		await settle();

		expect(table).not.toBeNull();
		expect(surface.getAttribute('role')).toBe('application');
		expect(surface.contains(table)).toBe(false);
		expect(container.contains(table)).toBe(true);
	});
});

describe('the table carries the data', () => {
	it('has one row per datum', async () => {
		const { table } = mountChart(rows);
		await settle();
		expect(table!.querySelectorAll('tbody tr').length).toBe(3);
	});

	it('names its columns after the accessors', async () => {
		const { table } = mountChart(rows);
		await settle();

		const headers = [...table!.querySelectorAll('thead th')].map((th) => th.textContent);
		expect(headers).toEqual(['#', 'x', 'y']);
	});

	it('carries the values', async () => {
		const { table } = mountChart(rows);
		await settle();

		const second = table!.querySelectorAll('tbody tr')[1]!;
		const cells = [...second.querySelectorAll('td')].map((td) => td.textContent);
		expect(cells).toEqual(['2', '20']);
	});

	it('follows a filter rather than the whole dataset', async () => {
		const { store, table } = mountChart(rows);
		await settle();

		store.dispatch({ type: 'filterData', predicate: (d: any) => d.x > 1 });
		flushSync();
		await settle();

		expect(table!.querySelectorAll('tbody tr').length).toBe(2);
	});
});

describe('the table describes itself honestly', () => {
	it('states the row count', async () => {
		const { table } = mountChart(rows);
		await settle();
		expect(table!.querySelector('caption')!.textContent).toContain('3 rows');
	});

	it('caps the rows and says so', async () => {
		// 150 rows against a cap of 100. Written above the cap on purpose: a
		// fixture of 3 rows exercises none of this and would pass with the cap
		// removed entirely.
		const many = Array.from({ length: 150 }, (_, i) => ({ x: i, y: i * 2 }));
		const { table } = mountChart(many);
		await settle();

		expect(table!.querySelectorAll('tbody tr').length).toBe(100);
		const caption = table!.querySelector('caption')!.textContent!;
		expect(caption).toContain('first 100');
		expect(caption).toContain('150');
	});
});

describe('the table copes with data it was not told about', () => {
	it('falls back to the row keys when no accessor is given', async () => {
		const { table } = mountChart([{ name: 'a', score: 1 }], { x: undefined, y: undefined });
		await settle();

		const headers = [...table!.querySelectorAll('thead th')].map((th) => th.textContent);
		expect(headers).toEqual(['#', 'name', 'score']);
	});

	it('labels a function accessor by its axis', async () => {
		const { table } = mountChart(rows, { x: (d: any) => d.x * 100, y: undefined });
		await settle();

		const headers = [...table!.querySelectorAll('thead th')].map((th) => th.textContent);
		expect(headers).toEqual(['#', 'x']);
		// The accessor is called, not bypassed in favour of a same-named property.
		expect(table!.querySelector('tbody td')!.textContent).toBe('100');
	});

	it('gives primitive rows a single column', async () => {
		const { table } = mountChart([5, 6, 7], { x: undefined, y: undefined });
		await settle();

		const headers = [...table!.querySelectorAll('thead th')].map((th) => th.textContent);
		expect(headers).toEqual(['#', 'Value']);
		expect(table!.querySelector('tbody td')!.textContent).toBe('5');
	});

	it('renders a header row and no body rows for empty data', async () => {
		const { table } = mountChart([]);
		await settle();

		expect(table).not.toBeNull();
		expect(table!.querySelectorAll('tbody tr').length).toBe(0);
		expect(table!.querySelector('caption')!.textContent).toContain('0 rows');
	});
});
