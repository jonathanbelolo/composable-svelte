/**
 * The chart, driven from the keyboard.
 *
 * `focus.reducer.test.ts` proves the cursor moves correctly. This file proves a
 * user can reach it: that the container takes focus at all, that each documented
 * key is wired to the action it claims, and that the live region says where the
 * cursor landed. Those are three separate failures — a perfect reducer behind an
 * unfocusable container is still a Level A failure — so they are asserted
 * separately rather than inferred from one another.
 *
 * The contract under test is the one in the README and the charts skill file:
 *
 *   Tab             focus the chart
 *   Arrow keys      previous / next data point
 *   Shift+Arrows    pan
 *   Home / End      first / last point
 *   Enter / Space   select the focused point
 *   Escape          clear selection
 *   + / -           zoom in / out
 *   0               reset zoom
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
	{ x: 3, y: 30 }
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
	// The `role="application"` element, which is what takes focus and handles
	// keys. `.chart-container` is the wrapper that also holds the summary and the
	// data table, deliberately outside the application region.
	const container = target.querySelector('.chart-surface') as HTMLElement;
	const press = (key: string, init: KeyboardEventInit = {}) => {
		container.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }));
		flushSync();
	};
	return { store, target, container, press };
}

describe('the chart can be reached at all', () => {
	it('is focusable', async () => {
		const { container } = mountChart();
		await settle();

		// The precondition every other test in this file depends on. Asserted
		// rather than assumed: with no tabindex the key handler still fires when
		// an event is dispatched at the element directly, so every assertion
		// below would pass on a chart no user could ever focus.
		expect(container.getAttribute('tabindex')).toBe('0');

		container.focus();
		expect(document.activeElement).toBe(container);
	});

	it('does not claim to be a static image', async () => {
		// `role="img"` told assistive technology there was nothing to operate on
		// a surface that supports zoom and brush selection.
		const { container } = mountChart();
		await settle();

		expect(container.getAttribute('role')).not.toBe('img');
		expect(container.getAttribute('role')).toBe('application');
	});
});

describe('the documented keys do what they say', () => {
	it('moves the cursor with the arrow keys', async () => {
		const { store, press } = mountChart();
		await settle();
		expect(store.state.focusedIndex).toBeNull();

		press('ArrowRight');
		expect(store.state.focusedIndex).toBe(0);
		press('ArrowRight');
		expect(store.state.focusedIndex).toBe(1);
		press('ArrowLeft');
		expect(store.state.focusedIndex).toBe(0);
	});

	it('accepts ArrowDown and ArrowUp as the same movement', async () => {
		const { store, press } = mountChart();
		await settle();

		press('ArrowDown');
		press('ArrowDown');
		expect(store.state.focusedIndex).toBe(1);
		press('ArrowUp');
		expect(store.state.focusedIndex).toBe(0);
	});

	it('jumps to the ends with Home and End', async () => {
		const { store, press } = mountChart();
		await settle();

		press('End');
		expect(store.state.focusedIndex).toBe(2);
		press('Home');
		expect(store.state.focusedIndex).toBe(0);
	});

	it('selects with Enter and with Space', async () => {
		for (const key of ['Enter', ' ']) {
			const { store, press } = mountChart();
			await settle();

			press('ArrowRight');
			press('ArrowRight');
			expect(store.state.focusedIndex).toBe(1);
			expect(store.state.selection.type).toBe('none');

			press(key);
			expect(store.state.selection.type).toBe('point');
			expect(store.state.selection.selectedIndices).toEqual([1]);
		}
	});

	it('clears the selection with Escape', async () => {
		const { store, press } = mountChart();
		await settle();

		press('ArrowRight');
		press('Enter');
		expect(store.state.selection.selectedIndices).toEqual([0]);

		press('Escape');
		expect(store.state.selection.type).toBe('none');
		expect(store.state.selection.selectedIndices).toEqual([]);
	});

	it('zooms with + and -, and resets with 0', async () => {
		const { store, press } = mountChart();
		await settle();

		press('+');
		expect(store.state.targetTransform!.k).toBeCloseTo(1.5);

		// Apply it, so the next press starts from the new scale rather than from
		// the identity transform the reducer has not been told about yet.
		store.dispatch({ type: 'zoomProgress', transform: store.state.targetTransform! });
		store.dispatch({ type: 'zoomComplete' });

		press('-');
		expect(store.state.targetTransform!.k).toBeCloseTo(1);

		press('0');
		expect(store.state.targetTransform).toEqual({ x: 0, y: 0, k: 1 });
	});

	it('accepts = and _ as the unshifted faces of + and -', async () => {
		const { store, press } = mountChart();
		await settle();

		press('=');
		expect(store.state.targetTransform!.k).toBeCloseTo(1.5);

		const { store: second, press: pressSecond } = mountChart();
		await settle();
		pressSecond('_');
		expect(second.state.targetTransform!.k).toBeCloseTo(1 / 1.5);
	});

	it('pans with Shift+Arrows instead of moving the cursor', async () => {
		const { store, press } = mountChart();
		await settle();

		press('ArrowRight', { shiftKey: true });

		// The distinguishing assertion: a plain ArrowRight would have moved the
		// cursor, so checking only the transform would pass if the modifier were
		// ignored and both happened.
		expect(store.state.focusedIndex).toBeNull();
		expect(store.state.transform.x).toBe(-40);

		press('ArrowLeft', { shiftKey: true });
		expect(store.state.transform.x).toBe(0);
	});
});

describe('the cursor is announced', () => {
	function liveRegion(container: HTMLElement) {
		return container.querySelector('[role="status"]') as HTMLElement | null;
	}

	it('has a polite live region', async () => {
		const { container } = mountChart();
		await settle();

		const region = liveRegion(container);
		expect(region).not.toBeNull();
		expect(region!.getAttribute('aria-live')).toBe('polite');
	});

	it('says nothing before the cursor exists', async () => {
		const { container } = mountChart();
		await settle();

		expect(liveRegion(container)!.textContent!.trim()).toBe('');
	});

	it('names the point, its position and its values', async () => {
		const { container, press } = mountChart();
		await settle();

		press('ArrowRight');
		press('ArrowRight');
		await settle();

		const text = liveRegion(container)!.textContent!;
		// Non-vacuous before specific: an empty region would satisfy none of the
		// `toContain`s below, but reading it once here makes the failure legible.
		expect(text.trim().length).toBeGreaterThan(0);
		expect(text).toContain('Point 2 of 3');
		expect(text).toContain('x: 2');
		expect(text).toContain('y: 20');
	});

	it('reports that a point is selected', async () => {
		const { container, press } = mountChart();
		await settle();

		press('ArrowRight');
		press('Enter');
		await settle();

		expect(liveRegion(container)!.textContent).toContain('Selected');
	});
});
