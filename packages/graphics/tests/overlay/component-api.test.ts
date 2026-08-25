/**
 * `<WebGLOverlay>` must expose the overlay it owns.
 *
 * The component held an `OverlayContextAPI` with fourteen methods and forwarded
 * four of them. `createOverlay` is not exported, so the other ten were
 * unreachable — an interface a consumer could import and read but never call.
 *
 * One of them was not merely unreachable but load-bearing. `inferUpdateStrategy`
 * gives a `<canvas>` the `manual` strategy, and `updateElement` is the only
 * thing that services `manual`. A registered canvas therefore took its texture
 * once at registration and never changed again: the strategy was reachable
 * through the component and the only trigger for it was not.
 *
 * These tests drive the component rather than `createOverlay`, because the
 * forwarding is the thing under test.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { mount, unmount } from 'svelte';
import WebGLOverlay from '../../src/lib/overlay/WebGLOverlay.svelte';
import {
	createFakeGL,
	installFakeGL,
	installFakeObservers,
	type FakeGL
} from '../helpers/fake-gl.js';

let undo: Array<() => void> = [];
let mounted: Array<Record<string, unknown>> = [];

afterEach(() => {
	vi.useRealTimers();
	mounted.forEach((instance) => unmount(instance));
	mounted = [];
	undo.forEach((fn) => fn());
	undo = [];
	document.body.innerHTML = '';
	vi.restoreAllMocks();
});

type OverlayComponent = {
	registerElement(registration: {
		id: string;
		domElement: HTMLElement;
		shader: unknown;
		updateStrategy?: 'static' | 'frame' | 'manual';
		onTextureLoaded?: () => void;
	}): void;
	unregisterElement(id: string): void;
	updateElement(id: string): void;
	updateElementPosition(id: string): void;
	updateUniforms(id: string, uniforms: Record<string, number | number[]>): void;
	getElement(id: string): { updateStrategy: string; shader: unknown; bounds: unknown } | undefined;
	getElements(): ReadonlyArray<{ id: string }>;
	getCanvas(): HTMLCanvasElement | null;
	getContext(): WebGLRenderingContext | null;
	getCurrentFPS(): number;
	start(): void;
	stop(): void;
	isRunning(): boolean;
};

async function overlayComponent(): Promise<{ fake: FakeGL; api: OverlayComponent }> {
	const fake = createFakeGL();
	undo.push(installFakeGL(fake), installFakeObservers());

	const target = document.createElement('div');
	document.body.appendChild(target);
	const api = mount(WebGLOverlay, { target }) as unknown as OverlayComponent;
	mounted.push(api as unknown as Record<string, unknown>);
	// `onMount` is what builds the overlay, and it has not run when `mount`
	// returns. Every method below is a no-op until it has.
	await settle();
	return { fake, api };
}

/** An `<img>` that reports as loaded, so texture creation reaches the GL calls. */
function loadedImage(): HTMLImageElement {
	const img = document.createElement('img');
	Object.defineProperty(img, 'complete', { value: true });
	Object.defineProperty(img, 'naturalWidth', { value: 64 });
	Object.defineProperty(img, 'naturalHeight', { value: 64 });
	document.body.appendChild(img);
	return img;
}

function sizedCanvas(): HTMLCanvasElement {
	const canvas = document.createElement('canvas');
	canvas.width = 64;
	canvas.height = 64;
	document.body.appendChild(canvas);
	return canvas;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const uploads = (fake: FakeGL) => fake.calls.filter((name) => name === 'texImage2D').length;

describe('the component forwards registration options', () => {
	it('passes updateStrategy through instead of always inferring it', async () => {
		// An `<img>` infers `static`. Asking for `manual` has to survive the
		// trip, or the option is decoration.
		const { api } = await overlayComponent();

		api.registerElement({
			id: 'a',
			domElement: loadedImage(),
			shader: 'wave-gentle-horizontal',
			updateStrategy: 'manual'
		});
		await settle();

		expect(api.getElement('a')?.updateStrategy).toBe('manual');
	});

	it('still infers a strategy when none is given', async () => {
		const { api } = await overlayComponent();

		api.registerElement({ id: 'a', domElement: loadedImage(), shader: 'wave-gentle-horizontal' });
		await settle();

		expect(api.getElement('a')?.updateStrategy, 'an image is static by default').toBe('static');
	});
});

describe('updateElement services the manual strategy', () => {
	it('re-uploads a canvas texture on request', async () => {
		const { fake, api } = await overlayComponent();

		api.registerElement({ id: 'a', domElement: sizedCanvas(), shader: 'wave-gentle-horizontal' });
		await settle();
		expect(api.getElement('a')?.updateStrategy, 'a canvas is manual by default').toBe('manual');

		const before = uploads(fake);
		api.updateElement('a');

		expect(uploads(fake), 'the canvas was never re-read').toBeGreaterThan(before);
	});

	it('does not re-upload on its own', async () => {
		// The paired half, and the reason `updateElement` matters: nothing else
		// updates a `manual` element, so a count that rises without asking
		// would mean this test proves nothing.
		const { fake, api } = await overlayComponent();

		api.registerElement({ id: 'a', domElement: sizedCanvas(), shader: 'wave-gentle-horizontal' });
		await settle();

		const before = uploads(fake);
		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(uploads(fake), 'a manual element updated without being told to').toBe(before);
	});
});

describe('updateUniforms reaches the shader', () => {
	it('changes the values the element carries', async () => {
		const { api } = await overlayComponent();

		api.registerElement({
			id: 'a',
			domElement: loadedImage(),
			shader: { fragment: 'void main() {}', uniforms: { uIntensity: 1 } }
		});
		await settle();

		api.updateUniforms('a', { uIntensity: 5 });

		const shader = api.getElement('a')?.shader as { uniforms: Record<string, number> };
		expect(shader.uniforms.uIntensity).toBe(5);
	});

	it('leaves the uniforms it was not given alone', async () => {
		const { api } = await overlayComponent();

		api.registerElement({
			id: 'a',
			domElement: loadedImage(),
			shader: { fragment: 'void main() {}', uniforms: { uIntensity: 1, uSpeed: 2 } }
		});
		await settle();

		api.updateUniforms('a', { uIntensity: 5 });

		const shader = api.getElement('a')?.shader as { uniforms: Record<string, number> };
		expect(shader.uniforms.uSpeed, 'a partial update wiped the rest').toBe(2);
	});
});

describe('the read-back accessors', () => {
	it('lists what is registered and forgets what is not', async () => {
		const { api } = await overlayComponent();

		api.registerElement({ id: 'a', domElement: loadedImage(), shader: 'wave-gentle-horizontal' });
		api.registerElement({ id: 'b', domElement: loadedImage(), shader: 'wave-gentle-horizontal' });
		await settle();

		expect(api.getElements().map((e) => e.id).sort()).toEqual(['a', 'b']);

		api.unregisterElement('a');
		expect(api.getElements().map((e) => e.id)).toEqual(['b']);
		expect(api.getElement('a')).toBeUndefined();
	});

	it('hands back the live canvas and context', async () => {
		const { fake, api } = await overlayComponent();

		expect(api.getCanvas(), 'the component rendered no canvas').not.toBeNull();
		expect(api.getContext(), 'the context the overlay is drawing with').toBe(fake.context);
	});

	it('reports a frame rate once the loop has run', async () => {
		// `getCurrentFPS` falls back to 0 when there is no overlay, so asserting
		// "it is a number" would pass on a delegate that delegates to nothing.
		// The rate has to be real, which means letting `RenderLoop` close a
		// one-second window.
		//
		// That needs fake timers rather than patience. `RenderLoop` opens the
		// window with `performance.now()` and closes it with the timestamp rAF
		// hands the frame callback — the same timeline in a browser, where both
		// are `DOMHighResTimeStamp` against the document's time origin, but not
		// in jsdom, whose rAF clock has its own origin and advances a fixed 16ms
		// per frame regardless of elapsed time. Waiting a real second measures
		// about 800ms of rAF and the window never closes. Faking both from one
		// clock restores the relationship the code is entitled to assume.
		vi.useFakeTimers({
			toFake: [
				'requestAnimationFrame',
				'cancelAnimationFrame',
				'performance',
				'setTimeout',
				'clearTimeout',
				'Date'
			]
		});
		vi.spyOn(console, 'warn').mockImplementation(() => {});

		const fake = createFakeGL();
		undo.push(installFakeGL(fake), installFakeObservers());
		const target = document.createElement('div');
		document.body.appendChild(target);
		const api = mount(WebGLOverlay, { target }) as unknown as OverlayComponent;
		mounted.push(api as unknown as Record<string, unknown>);

		await vi.advanceTimersByTimeAsync(0); // let onMount build the overlay
		await vi.advanceTimersByTimeAsync(1100); // a second of frames

		expect(api.getCurrentFPS(), 'no frames were measured in a full second').toBeGreaterThan(0);
		vi.useRealTimers();
	});
});

describe('start and stop', () => {
	it('runs on mount, and stops and restarts on request', async () => {
		const { api } = await overlayComponent();

		expect(api.isRunning(), 'mounting did not start the render loop').toBe(true);

		api.stop();
		expect(api.isRunning(), 'stop() left the loop running').toBe(false);

		api.start();
		expect(api.isRunning(), 'start() did not restart the loop').toBe(true);
	});
});

describe('updateElementPosition', () => {
	it('re-reads bounds a transform moved', async () => {
		const { api } = await overlayComponent();
		const img = loadedImage();
		let rect = { left: 0, top: 0, width: 10, height: 10 };
		img.getBoundingClientRect = () =>
			({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height }) as DOMRect;

		api.registerElement({ id: 'a', domElement: img, shader: 'wave-gentle-horizontal' });
		await settle();
		expect(api.getElement('a')?.bounds).toMatchObject({ x: 0, y: 0 });

		rect = { left: 40, top: 80, width: 10, height: 10 };
		api.updateElementPosition('a');

		expect(api.getElement('a')?.bounds, 'the moved element kept its old bounds').toMatchObject({
			x: 40,
			y: 80
		});
	});
});
