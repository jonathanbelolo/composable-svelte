/**
 * B1 NodeCanvas managed feasibility, Option A (state queue). Real SvelteFlow in
 * Chromium, two keyed canvases, commands through the wrapped parent action.
 * Assertions are on the rendered viewport transform, never only on the store.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { createStore } from '@composable-svelte/core';
import ACanvasHost from './ACanvasHost.svelte';
import { aCanvasComposition, initialCanvasRoot, type ACanvasAction } from './canvas-model';

const settle = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let teardown: Array<() => void> = [];
afterEach(() => {
	for (const fn of teardown.splice(0).reverse()) fn();
});

async function setup() {
	const store = createStore({ initialState: initialCanvasRoot(), ...aCanvasComposition, dependencies: {} });
	const target = document.createElement('div');
	document.body.appendChild(target);
	const component = mount(ACanvasHost, { target, props: { store } });
	flushSync();
	teardown.push(() => {
		void unmount(component);
		store.destroy();
		target.remove();
	});
	await settle(600);
	return { store, target };
}

const viewport = (target: HTMLElement, label: string) => {
	const element = target.querySelector<HTMLElement>(`[data-canvas="${label}"] .svelte-flow__viewport`);
	if (!element) throw new Error(`no SvelteFlow viewport for ${label}`);
	return element;
};
const scale = (element: HTMLElement) => Number(/scale\(([\d.]+)\)/.exec(element.style.transform)?.[1] ?? 'NaN');
const to = (id: string, action: ACanvasAction) => ({ type: 'canvases', id, action }) as const;

describe('A: NodeCanvas viewport commands through a managed keyed slot', () => {
	it('zoomIn twice in one tick reaches only its own canvas, twice, without unliftAction', async () => {
		const { store, target } = await setup();
		const a = viewport(target, 'a');
		const b = viewport(target, 'b');
		const [a0, b0] = [scale(a), scale(b)];
		store.dispatch(to('a', { type: 'zoomIn' }));
		store.dispatch(to('b', { type: 'zoomOut' }));
		store.dispatch(to('a', { type: 'zoomIn' }));
		await settle(100);
		// SvelteFlow's zoom step is 1.2: two zoomIns are 1.44, a coalesced one would be 1.2.
		expect(scale(a) / a0).toBeCloseTo(1.44, 2);
		expect(scale(b) / b0).toBeCloseTo(1 / 1.2, 2);
		expect(store.state.canvases.every((row) => row.state.viewportCommands.entries.length === 0)).toBe(true);
	});

	it('fitView returns a moved canvas to the fitted transform', async () => {
		const { store, target } = await setup();
		const a = viewport(target, 'a');
		const fitted = a.style.transform;
		store.dispatch(to('a', { type: 'zoomIn' }));
		await settle(100);
		expect(a.style.transform).not.toBe(fitted);
		store.dispatch(to('a', { type: 'fitView' }));
		await settle(600);
		expect(a.style.transform).toBe(fitted);
	});
});
