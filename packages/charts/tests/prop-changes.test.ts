import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { createStore } from '@composable-svelte/core';
import { chartReducer, createInitialChartState } from '../src/lib/reducers/chart.reducer';
import { buildScatterPlot } from '../src/lib/utils/plot-builder';
import PropChangeHarness from './test-components/PropChangeHarness.svelte';

const settle = () => new Promise((resolve) => setTimeout(resolve, 250));
let cleanup: Array<() => void> = [];
afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

describe('a prop change reaches the canvas', () => {
	it('changing the y accessor redraws', async () => {
		const target = document.createElement('div');
		document.body.appendChild(target);
		const component = mount(PropChangeHarness, { target, props: {} });
		cleanup.push(() => {
			unmount(component);
			target.remove();
		});
		await settle();

		const before = Array.from(target.querySelectorAll('svg circle')).map((c) =>
			c.getAttribute('cy')
		);
		expect(before.length).toBeGreaterThan(0);

		target.querySelector<HTMLButtonElement>('[data-testid="swap-y"]')!.click();
		flushSync();
		await settle();

		const after = Array.from(target.querySelectorAll('svg circle')).map((c) =>
			c.getAttribute('cy')
		);
		expect(after, 'a changed accessor never reached the canvas').not.toEqual(before);
	});
});
