/**
 * The SHIPPED `NodeCanvas` as a managed feature view, against the real
 * SvelteFlow instance.
 *
 * The parent wraps canvas actions and owns same-named actions of its own. The
 * canvas gets no `unliftAction` and no `liftAction`: its managed view observes
 * only its own owner's actions, already `NodeCanvasAction`s. Assertions are on
 * the rendered viewport transform, as in `node-canvas-viewport.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { flushSync } from 'svelte';
import NodeCanvas from '../../src/lib/node-canvas/NodeCanvas.svelte';
import CanvasHost from './CanvasHost.svelte';
import type { NodeCanvasAction } from '../../src/lib/node-canvas/types';
import { canvasComposition, canvasesSlot, createCanvasRoot, toCanvas } from './canvas-model';
import { mountInto, onTeardown, runTeardown, settle, waitFor } from './support';

let warn: MockInstance<typeof console.warn>;
let error: MockInstance<typeof console.error>;
beforeEach(() => {
	warn = vi.spyOn(console, 'warn');
	error = vi.spyOn(console, 'error');
});
afterEach(() => {
	runTeardown();
	vi.restoreAllMocks();
});

const scaleOf = (el: HTMLElement) => Number(/scale\(([\d.]+)\)/.exec(el.style.transform)?.[1] ?? '1');
const viewports = (target: HTMLElement) => [...target.querySelectorAll<HTMLElement>('.svelte-flow__viewport')];

async function setup() {
	const store = createCanvasRoot();
	onTeardown(() => store.destroy());
	const target = mountInto(CanvasHost, { store });
	await waitFor(() => viewports(target).length === 2, 'both canvases');
	// Let the mount-time auto-fit settle and report back.
	await settle(600);
	const [one, two] = viewports(target);
	return { store, target, one: one!, two: two! };
}

const row = (store: ReturnType<typeof createCanvasRoot>, id: string) =>
	store.state.canvases.find((canvas) => canvas.id === id)?.state;

describe('viewport commands through a managed view', () => {
	it('two same-tick zoomIns both land, on the addressed canvas only', async () => {
		const { store, one, two } = await setup();
		const before = scaleOf(one);
		const sibling = two.style.transform;
		store.dispatch(toCanvas('one', { type: 'zoomIn' }));
		store.dispatch(toCanvas('one', { type: 'zoomIn' }));
		// The parent's own same-named action is not the canvas's.
		store.dispatch({ type: 'zoomIn' });
		await settle(600);
		expect(scaleOf(one) / before).toBeCloseTo(1.44, 2);
		expect(two.style.transform).toBe(sibling);
		expect(warn).not.toHaveBeenCalled();
		expect(error).not.toHaveBeenCalled();
	});

	it('setViewport moves the canvas, clamped to its zoom bounds, and state learns the clamped value', async () => {
		const { store, one } = await setup();
		store.dispatch(toCanvas('one', { type: 'setViewport', viewport: { x: 100, y: 50, zoom: 5 } }));
		// The parent's same-named action carries another shape and is ignored.
		store.dispatch({ type: 'setViewport', to: 'somewhere' });
		await settle(400);
		expect(one.style.transform).toBe('translate(100px, 50px) scale(2)');
		await waitFor(() => row(store, 'one')?.viewport.zoom === 2, 'the clamped zoom to be reported back');
		expect(row(store, 'one')?.viewport).toEqual({ x: 100, y: 50, zoom: 2 });
	});

	it('fitView restores the fitted viewport and centerView pans without zooming', async () => {
		const { store, one } = await setup();
		const fitted = one.style.transform;
		store.dispatch(toCanvas('one', { type: 'setViewport', viewport: { x: 999, y: 999, zoom: 1.5 } }));
		await settle(400);
		expect(one.style.transform).not.toBe(fitted);

		store.dispatch(toCanvas('one', { type: 'centerView' }));
		await settle(600);
		expect(scaleOf(one)).toBeCloseTo(1.5, 5);
		expect(one.style.transform).not.toContain('translate(999px, 999px)');

		store.dispatch(toCanvas('one', { type: 'fitView' }));
		await settle(600);
		expect(one.style.transform).toBe(fitted);
	});

	it('a burst in one drain runs in order: setViewport, then zoomIn', async () => {
		const { store, one } = await setup();
		store.dispatch({
			type: 'sequence',
			actions: [
				toCanvas('one', { type: 'setViewport', viewport: { x: 0, y: 0, zoom: 1 } }),
				toCanvas('one', { type: 'zoomIn' })
			]
		});
		await settle(600);
		expect(scaleOf(one)).toBeCloseTo(1.2, 5);
	});

	it('removing a canvas logs nothing and leaves the sibling working', async () => {
		const { store, target } = await setup();
		store.dispatch(toCanvas('one', { type: 'zoomIn' }));
		store.dispatch({ type: 'remove', id: 'one' });
		flushSync();
		await settle(300);
		const remaining = viewports(target);
		expect(remaining).toHaveLength(1);
		const before = scaleOf(remaining[0]!);
		store.dispatch(toCanvas('two', { type: 'zoomOut' }));
		await settle(600);
		expect(scaleOf(remaining[0]!)).toBeLessThan(before);
		expect(error).not.toHaveBeenCalled();
	});
});

describe('graph edits through a managed view', () => {
	it('selection dispatched by the canvas reaches its own owner', async () => {
		const { store, target } = await setup();
		const node = target.querySelector<HTMLElement>('.svelte-flow__node[data-id="a"]')!;
		node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await settle(300);
		expect(row(store, 'one')?.selectedNodes.has('a')).toBe(true);
		expect(row(store, 'two')?.selectedNodes.size).toBe(0);
	});
});

describe('a hand-bound canvas view', () => {
	it('works with neither liftAction nor unliftAction, and survives its owner retiring', async () => {
		const store = createCanvasRoot();
		onTeardown(() => store.destroy());
		const view = canvasComposition.bind(store, canvasesSlot.at('one'))!;
		const target = document.createElement('div');
		target.style.cssText = 'width: 600px; height: 400px;';
		document.body.appendChild(target);
		onTeardown(() => target.remove());
		const host = mountInto(NodeCanvas, { store: view });
		target.appendChild(host);
		const viewport = await waitFor(() => host.querySelector<HTMLElement>('.svelte-flow__viewport'), 'the canvas');
		await settle(600);
		store.dispatch(toCanvas('one', { type: 'setViewport', viewport: { x: 10, y: 20, zoom: 1 } }));
		await settle(300);
		expect(viewport.style.transform).toBe('translate(10px, 20px) scale(1)');

		store.dispatch({ type: 'remove', id: 'one' });
		flushSync();
		await settle(200);
		expect(view.state).toBeUndefined();
		// Rendered from the last committed state; the retired owner is inert.
		expect(host.querySelector('.svelte-flow__node[data-id="a"]')).not.toBeNull();
		expect(error).not.toHaveBeenCalled();
	});
});

describe('a managed view ignores the unlift path (F4)', () => {
	it('a caller-supplied non-identity liftAction cannot kill setViewport or zoomIn', async () => {
		// `{ ...action }` is not the identity, so the default unlift's probe
		// fails and would recognise nothing. A managed view's observed actions
		// are already the canvas's own, so they must not pass through it.
		const store = createCanvasRoot();
		onTeardown(() => store.destroy());
		const view = canvasComposition.bind(store, canvasesSlot.at('one'))!;
		const target = document.createElement('div');
		target.style.cssText = 'width: 600px; height: 400px;';
		document.body.appendChild(target);
		onTeardown(() => target.remove());
		const host = mountInto(NodeCanvas, { store: view, liftAction: (action: NodeCanvasAction) => ({ ...action }) });
		target.appendChild(host);
		const viewport = await waitFor(() => host.querySelector<HTMLElement>('.svelte-flow__viewport'), 'the canvas');
		await settle(600);

		view.dispatch({ type: 'setViewport', viewport: { x: 10, y: 20, zoom: 1 } });
		await settle(300);
		expect(viewport.style.transform).toBe('translate(10px, 20px) scale(1)');

		store.dispatch(toCanvas('one', { type: 'zoomIn' }));
		await settle(600);
		expect(scaleOf(viewport)).toBeCloseTo(1.2, 5);
		expect(error).not.toHaveBeenCalled();
	});
});
