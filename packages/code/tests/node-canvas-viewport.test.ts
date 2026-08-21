/**
 * NodeCanvas's viewport, selection and readonly state drove nothing.
 *
 * The root cause is a single line: the store's viewport reached SvelteFlow only
 * as `initialViewport`, which is read once at construction. So `setViewport`,
 * `zoomIn` and `zoomOut` wrote state the canvas never re-read, and `fitView` /
 * `centerView` returned `[state, Effect.none()]` outright. In the other
 * direction `handleMoveEnd` never dispatched, so panning left `$store.viewport`
 * frozen at its mount value forever.
 *
 * Selection was the same shape: `selectedNodes` / `selectedEdges` were fully
 * maintained by the reducer and read by nobody — what you saw highlighted was
 * SvelteFlow's own internal selection, agreeing by coincidence.
 *
 * ARCHITECTURE. The viewport commands carry no state, so they are handled the
 * way the editor's command actions are: the reducer stays pure and the *view*
 * subscribes to the action stream and calls `useSvelteFlow()`. The flow reports
 * back through `onmoveend` as `setViewport`, so the store holds the projection
 * and the canvas stays the thing that owns pixels.
 *
 * Every assertion is against the rendered SvelteFlow DOM — the viewport
 * transform, the `selected` class — never the store. A store-only assertion
 * passes with every one of these defects fully present.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import NodeCanvasHarness, { harnessStore } from './test-components/NodeCanvasHarness.svelte';

const settle = (ms = 300) => new Promise((r) => setTimeout(r, ms));

let cleanup: Array<() => void> = [];
afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

async function mountCanvas() {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const component = mount(NodeCanvasHarness, { target, props: {} });
	cleanup.push(() => {
		unmount(component);
		target.remove();
	});
	await settle(600);
	const store = harnessStore!;
	expect(store, 'harness did not expose its store').not.toBeNull();
	const viewport = target.querySelector('.svelte-flow__viewport') as HTMLElement;
	expect(viewport, 'SvelteFlow did not initialise').not.toBeNull();
	return { target, store, viewport };
}

const transform = (el: HTMLElement) => el.style.transform;
const scaleOf = (el: HTMLElement) => Number(/scale\(([\d.]+)\)/.exec(el.style.transform)?.[1] ?? '1');

describe('viewport commands reach the canvas', () => {
	it('setViewport moves it', async () => {
		const { store, viewport } = await mountCanvas();
		// Not asserted as identity: `fitView` defaults to true, so the canvas
		// auto-fits on mount and starts somewhere non-obvious.
		const before = transform(viewport);

		store.dispatch({ type: 'setViewport', viewport: { x: 100, y: 50, zoom: 1.5 } });
		flushSync();
		await settle(400);

		expect(transform(viewport), 'the canvas did not move at all').not.toBe(before);
		expect(
			transform(viewport),
			'the store viewport changed but the canvas never re-read it'
		).toBe('translate(100px, 50px) scale(1.5)');
	});

	it('zoomIn and zoomOut move it', async () => {
		const { store, viewport } = await mountCanvas();
		const before = scaleOf(viewport);

		store.dispatch({ type: 'zoomIn' });
		flushSync();
		await settle(500);
		const zoomed = scaleOf(viewport);
		expect(zoomed, 'zoomIn did not reach the canvas').toBeGreaterThan(before);

		store.dispatch({ type: 'zoomOut' });
		flushSync();
		await settle(500);
		expect(scaleOf(viewport)).toBeLessThan(zoomed);
	});

	it('fitView brings the canvas back to the fitted position', async () => {
		// The canvas auto-fits at mount (`fitView` prop defaults to true), so
		// dispatching `fitView` straight away is *correctly* a no-op. Move it
		// away first, or the test asserts nothing.
		const { store, viewport } = await mountCanvas();
		const fitted = transform(viewport);

		store.dispatch({ type: 'setViewport', viewport: { x: 999, y: 999, zoom: 3 } });
		flushSync();
		await settle(400);
		expect(transform(viewport), 'precondition: moved away from the fit').not.toBe(fitted);

		store.dispatch({ type: 'fitView' });
		flushSync();
		await settle(600);

		expect(transform(viewport), 'fitView was a no-op').toBe(fitted);
	});

	it('the store learns about canvas-driven viewport changes', async () => {
		// The other direction. This is the one place a store assertion is right:
		// the store IS the thing that was frozen, and the stimulus is the canvas.
		const { target, store } = await mountCanvas();
		const zoomIn = target.querySelector<HTMLButtonElement>('.svelte-flow__controls-zoomin');
		expect(zoomIn, 'no zoom control rendered').not.toBeNull();

		zoomIn!.click();
		await settle(600);

		expect(
			store.state.viewport.zoom,
			'the canvas zoomed but the store never heard about it'
		).not.toBe(1);
	});

	it('a programmatic viewport change does not echo forever', async () => {
		// `setViewport` on the flow fires `onmoveend`, which dispatches
		// `setViewport` again. A value guard is what makes that terminate.
		const { store } = await mountCanvas();
		let setViewportCount = 0;
		store.subscribeToActions?.((action) => {
			if (action.type === 'setViewport') setViewportCount += 1;
		});

		store.dispatch({ type: 'setViewport', viewport: { x: 10, y: 20, zoom: 1.2 } });
		flushSync();
		await settle(700);

		expect(setViewportCount, 'the viewport echoed back and forth').toBe(1);
	});
});

describe('selection is visible', () => {
	it('selectNode highlights the node', async () => {
		const { target, store } = await mountCanvas();
		const nodeEl = () => target.querySelector('[data-id="a"]');
		expect(nodeEl(), 'node A did not render').not.toBeNull();
		expect(nodeEl()!.className).not.toContain('selected');

		store.dispatch({ type: 'selectNode', nodeId: 'a', multi: false });
		flushSync();
		await settle(400);

		expect(
			nodeEl()!.className,
			'the store tracked the selection but the canvas never showed it'
		).toContain('selected');
	});

	it('clearSelection unhighlights it', async () => {
		const { target, store } = await mountCanvas();
		store.dispatch({ type: 'selectNode', nodeId: 'a', multi: false });
		flushSync();
		await settle(400);
		expect(target.querySelector('[data-id="a"]')!.className).toContain('selected');

		store.dispatch({ type: 'clearSelection' });
		flushSync();
		await settle(400);

		expect(target.querySelector('[data-id="a"]')!.className).not.toContain('selected');
	});
});

describe('readonly', () => {
	it('stops nodes being draggable', async () => {
		const { target, store } = await mountCanvas();
		const nodeEl = () => target.querySelector('[data-id="a"]')!;
		expect(nodeEl().className, 'precondition: draggable to begin with').toContain('draggable');

		store.dispatch({ type: 'setReadonly', readonly: true });
		flushSync();
		await settle(400);

		expect(
			nodeEl().className,
			'readonly was set in the store and the canvas ignored it'
		).not.toContain('draggable');
	});
});
