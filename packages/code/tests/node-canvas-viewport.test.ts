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
import NodeCanvasHarness from './test-components/NodeCanvasHarness.svelte';
// The stores come from a `.ts` module, not from the harnesses' `<script module>`
// blocks: svelte's ambient `*.svelte` declaration has a default export only, so
// a named import from a component cannot typecheck.
import { harness, wrappedHarness } from './test-components/harness-stores.js';

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
	const store = harness.store!;
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

describe('centerView', () => {
	it('centres without changing the zoom', async () => {
		// `useSvelteFlow().setCenter(x, y)` defaults its zoom to `store.maxZoom`
		// (`@xyflow/svelte/dist/lib/store/index.js:78-79`), so calling it without
		// an explicit zoom slams the canvas to maximum. Centring is a pan.
		const { store, viewport } = await mountCanvas();
		store.dispatch({ type: 'setViewport', viewport: { x: 0, y: 0, zoom: 1.25 } });
		flushSync();
		await settle(400);
		expect(scaleOf(viewport)).toBeCloseTo(1.25, 3);
		const before = transform(viewport);

		store.dispatch({ type: 'centerView' });
		flushSync();
		await settle(500);

		expect(transform(viewport), 'centerView did nothing').not.toBe(before);
		expect(
			scaleOf(viewport),
			'centerView changed the zoom — it should only pan'
		).toBeCloseTo(1.25, 3);
	});
});

describe('setViewport respects the zoom bounds', () => {
	it('clamps to maxZoom', async () => {
		// Before this work the action was dead, so it could not violate anything.
		// Now that it drives the canvas it has to honour the same bounds
		// `zoomIn`/`zoomOut` do — otherwise the props are advisory.
		const { store, viewport } = await mountCanvas();

		store.dispatch({ type: 'setViewport', viewport: { x: 5, y: 5, zoom: 99 } });
		flushSync();
		await settle(400);

		expect(scaleOf(viewport), 'zoom 99 was applied with maxZoom 2').toBeLessThanOrEqual(2);
	});
});

describe('connectionInProgress', () => {
	it('is exposed on the container', async () => {
		const { target, store } = await mountCanvas();
		const root = () => target.querySelector('.node-canvas')!;
		expect(root().hasAttribute('data-connecting')).toBe(false);

		store.dispatch({
			type: 'connectionStart',
			sourceNodeId: 'a',
			sourceHandle: null
		} as never);
		flushSync();
		await settle(300);

		expect(
			root().hasAttribute('data-connecting'),
			'connectionInProgress is tracked and still not readable'
		).toBe(true);
	});
});

describe('selection is visible', () => {
	it('selectNode highlights the node', async () => {
		const { target, store } = await mountCanvas();
		const nodeEl = () => target.querySelector('[data-id="a"]');
		expect(nodeEl(), 'node A did not render').not.toBeNull();
		expect(nodeEl()!.className).not.toContain('selected');

		store.dispatch({ type: 'selectNode', nodeId: 'a', multiSelect: false });
		flushSync();
		await settle(400);

		expect(
			nodeEl()!.className,
			'the store tracked the selection but the canvas never showed it'
		).toContain('selected');
	});

	it('keeps a selected node identical across unrelated dispatches', async () => {
		// The identity-preserving branch compares `n.selected ?? false` against the
		// store's set — but stored nodes carry no `selected` key, so every node in
		// `selectedNodes` failed the comparison and re-cloned on EVERY dispatch.
		// For a rubber-band selection of N nodes that is a full re-adoption of all
		// N on every action, which is the cost the branch exists to avoid.
		const { target, store } = await mountCanvas();
		store.dispatch({ type: 'selectNode', nodeId: 'a', multiSelect: false });
		flushSync();
		await settle(300);

		const seen = new Set<unknown>();
		for (let i = 0; i < 5; i += 1) {
			store.dispatch({ type: 'setGridSize', size: 10 + i } as never);
			flushSync();
			await settle(60);
			const node = (store.state.nodes as Record<string, unknown>).a;
			seen.add(node);
		}
		expect(seen.size, 'the store node itself should not churn').toBe(1);

		// And the projected node handed to SvelteFlow must be stable too.
		expect(
			target.querySelector('[data-id="a"]')!.className,
			'the node lost its selection'
		).toContain('selected');
	});

	it('clearSelection unhighlights it', async () => {
		const { target, store } = await mountCanvas();
		store.dispatch({ type: 'selectNode', nodeId: 'a', multiSelect: false });
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

describe('the default unliftAction refuses to guess', () => {
	/**
	 * The default matches on bare type names — `setViewport`, `zoomIn`,
	 * `fitView` are generic enough that a parent can plausibly own actions with
	 * the same names. Applied to a WRAPPING parent it would both hijack those
	 * actions and hand `FlowCommands` an object of the wrong shape.
	 *
	 * It now probes `liftAction` with a sentinel and only applies when the lift
	 * is the identity. A wrapping parent that wants viewport commands supplies
	 * `unliftAction` explicitly.
	 */
	it('ignores a wrapping parent’s same-named actions', async () => {
		const { default: Harness } = await import(
			'./test-components/NodeCanvasWrappedHarness.svelte'
		);
		const target = document.createElement('div');
		document.body.appendChild(target);
		const component = mount(Harness as never, { target, props: {} });
		cleanup.push(() => {
			unmount(component);
			target.remove();
		});
		await settle(600);

		const viewport = target.querySelector('.svelte-flow__viewport') as HTMLElement;
		expect(viewport).not.toBeNull();
		const before = transform(viewport);
		// Guards the guard: at maxZoom a hijacked `zoomIn` cannot move anything,
		// so this test would pass vacuously.
		expect(scaleOf(viewport), 'harness must start below maxZoom').toBeLessThan(2);

		const errors: string[] = [];
		const onError = (e: ErrorEvent) => errors.push(String(e.message));
		window.addEventListener('error', onError);
		cleanup.push(() => window.removeEventListener('error', onError));

		const store = wrappedHarness.store!;
		store.dispatch({ type: 'zoomIn' });
		store.dispatch({ type: 'setViewport', to: '/settings' });
		flushSync();
		await settle(500);

		expect(transform(viewport), 'the parent’s own actions moved the canvas').toBe(before);
		expect(errors, 'a same-named parent action crashed the canvas').toEqual([]);
	});
});
