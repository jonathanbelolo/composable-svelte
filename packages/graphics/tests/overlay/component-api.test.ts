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
	getElement(id: string):
		| { updateStrategy: string; shader: unknown; bounds: unknown; element: HTMLElement }
		| undefined;
	getElements(): ReadonlyArray<{ id: string }>;
	getCanvas(): HTMLCanvasElement | null;
	getContext(): WebGLRenderingContext | null;
	getCurrentFPS(): number;
	start(): void;
	stop(): void;
	isRunning(): boolean;
};

async function overlayComponent(): Promise<{
	fake: FakeGL;
	api: OverlayComponent;
	target: HTMLElement;
}> {
	const fake = createFakeGL();
	undo.push(installFakeGL(fake), installFakeObservers());

	const target = document.createElement('div');
	document.body.appendChild(target);
	const api = mount(WebGLOverlay, { target }) as unknown as OverlayComponent;
	mounted.push(api as unknown as Record<string, unknown>);
	// `onMount` is what builds the overlay, and it has not run when `mount`
	// returns. Every method below is a no-op until it has.
	await settle();
	return { fake, api, target };
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

	it('does not leak into another element sharing the same preset', async () => {
		// Registering by preset name resolves to the module-level constant, so
		// two elements naming the same preset hold the *same object*. Mutating
		// its `uniforms` in place retunes every element using it — and, since
		// the constant lives in the registry, every element registered
		// afterwards for the rest of the page's life.
		const { api } = await overlayComponent();

		api.registerElement({ id: 'a', domElement: loadedImage(), shader: 'ripple-gentle' });
		api.registerElement({ id: 'b', domElement: loadedImage(), shader: 'ripple-gentle' });
		await settle();

		api.updateUniforms('a', { uAmplitude: 99 });

		const b = api.getElement('b')?.shader as { uniforms: Record<string, number> };
		expect(b.uniforms.uAmplitude, "b was retuned by a's call").not.toBe(99);
	});

	it('does not leak into elements registered afterwards', async () => {
		// The half that shows the damage outlives the overlay: the mutated
		// object is the registry's, so a fresh registration picks it up.
		const { api } = await overlayComponent();

		api.registerElement({ id: 'a', domElement: loadedImage(), shader: 'ripple-strong' });
		await settle();
		api.updateUniforms('a', { uAmplitude: 99 });

		api.registerElement({ id: 'c', domElement: loadedImage(), shader: 'ripple-strong' });
		await settle();

		const c = api.getElement('c')?.shader as { uniforms: Record<string, number> };
		expect(c.uniforms.uAmplitude, 'the preset constant itself was retuned').not.toBe(99);
	});

	it('does not hand the registry\'s own preset object to the consumer', async () => {
		// `getElement()` is a read-back, and a consumer poking the object it
		// returns is the obvious thing to try. If that object is the registry's,
		// the poke lands on every element that ever names the preset.
		const { api } = await overlayComponent();

		api.registerElement({ id: 'a', domElement: loadedImage(), shader: 'blur-medium' });
		await settle();

		const shader = api.getElement('a')?.shader as { uniforms: Record<string, number> };
		shader.uniforms.uProbe = 999;

		api.registerElement({ id: 'b', domElement: loadedImage(), shader: 'blur-medium' });
		await settle();

		const b = api.getElement('b')?.shader as { uniforms: Record<string, number> };
		expect(b.uniforms.uProbe, 'the preset in the registry was written through').toBeUndefined();
	});

	it('does not leak between elements handed the same shader object', async () => {
		// The case the preset copy does not cover, and the reason
		// `updateUniforms` replaces rather than mutates. A custom effect is not
		// copied at registration — it is the consumer's object, and they may
		// well hand the same one to several elements. Writing through it
		// retunes all of them, and the consumer's own object with them.
		const { api } = await overlayComponent();
		const effect = { fragment: 'void main() {}', uniforms: { uIntensity: 1 } };

		api.registerElement({ id: 'a', domElement: loadedImage(), shader: effect });
		api.registerElement({ id: 'b', domElement: loadedImage(), shader: effect });
		await settle();

		api.updateUniforms('a', { uIntensity: 9 });

		const b = api.getElement('b')?.shader as { uniforms: Record<string, number> };
		expect(b.uniforms.uIntensity, "b was retuned through the object it shares").toBe(1);
		expect(effect.uniforms.uIntensity, "the caller's own object was written through").toBe(1);
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
		// Identity, not existence. `.not.toBeNull()` was the whole assertion,
		// so an overlay rendering to a detached canvas that is in no document —
		// i.e. invisible — passed it.
		const { fake, api, target } = await overlayComponent();

		const mountedCanvas = target.querySelector('canvas');
		expect(mountedCanvas, 'the component rendered no canvas').not.toBeNull();
		expect(api.getCanvas(), 'the overlay is drawing to some other canvas').toBe(mountedCanvas);
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

		// The measured rate, not merely a positive number: `return overlay ? 60
		// : 0` satisfied `toBeGreaterThan(0)`. Under one fake clock at a 16ms
		// step against a 60fps target the answer is exactly 60.
		expect(api.getCurrentFPS(), 'the reported rate is not the measured one').toBe(60);
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

describe('the guards on registration', () => {
	it('refuses an element that is not an image, video or canvas', async () => {
		// The inference falls back to `null` rather than `'image'`. It used to
		// route a `<div>` into `createImageTexture`, whose first guard is
		// `!img.complete || img.naturalWidth === 0` — trivially true for a div —
		// so the consumer got "Image not loaded" about an element that is not an
		// image and never could be.
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const { api } = await overlayComponent();

		api.registerElement({
			id: 'a',
			domElement: document.createElement('div'),
			shader: 'ripple-gentle'
		});
		await settle();

		expect(api.getElement('a'), 'a <div> was registered').toBeUndefined();
	});

	it('still accepts the three that are', async () => {
		// The paired half: refusing by tag name must not refuse the supported
		// tags. A canvas is the one whose inference is easiest to get wrong,
		// since it is neither the default nor the video case.
		const { api } = await overlayComponent();
		const canvas = document.createElement('canvas');
		canvas.width = 32;
		canvas.height = 32;
		document.body.appendChild(canvas);

		api.registerElement({ id: 'a', domElement: loadedImage(), shader: 'ripple-gentle' });
		api.registerElement({ id: 'b', domElement: canvas, shader: 'ripple-gentle' });
		await settle();

		expect(api.getElement('a')?.updateStrategy).toBe('static');
		expect(api.getElement('b')?.updateStrategy).toBe('manual');
	});

	it('refuses a second registration under an id already in use', async () => {
		// Ids are identity here: `getElement`, `setShader` and
		// `unregisterElement` all key by them, so a duplicate would make the
		// second element unaddressable and leak the first one's texture.
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const { api } = await overlayComponent();
		const first = loadedImage();

		api.registerElement({ id: 'a', domElement: first, shader: 'ripple-gentle' });
		api.registerElement({ id: 'a', domElement: loadedImage(), shader: 'wave-flowing' });
		await settle();

		expect(api.getElements(), 'the duplicate was registered too').toHaveLength(1);
		expect(api.getElement('a')?.element, 'the duplicate replaced the original').toBe(first);
	});
});

describe('targetFPS reaches the render loop', () => {
	/** Drive N ms of frames under one fake clock and count the draws. */
	async function drawsIn(ms: number, options: Record<string, unknown>): Promise<number> {
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
		const fake = createFakeGL();
		undo.push(installFakeGL(fake), installFakeObservers());

		const target = document.createElement('div');
		document.body.appendChild(target);
		const api = mount(WebGLOverlay, { target, props: { options } }) as unknown as OverlayComponent;
		mounted.push(api as unknown as Record<string, unknown>);
		await vi.advanceTimersByTimeAsync(0);

		const img = loadedImage();
		img.getBoundingClientRect = () =>
			({ left: 0, top: 0, width: 40, height: 40, right: 40, bottom: 40 }) as DOMRect;
		api.registerElement({ id: 'a', domElement: img, shader: 'ripple-gentle' });
		await vi.advanceTimersByTimeAsync(0);

		fake.clearCalls();
		await vi.advanceTimersByTimeAsync(ms);
		vi.useRealTimers();
		return fake.drawCalls();
	}

	it('draws fewer frames at a lower target', async () => {
		// The option is passed to `RenderLoop`'s constructor and gates the frame
		// callback on `deltaTime >= frameInterval`. Nothing exercised it: the
		// value could have been dropped on the floor and every test stayed green.
		const fast = await drawsIn(1000, { targetFPS: 60 });
		const slow = await drawsIn(1000, { targetFPS: 10 });

		expect(fast, 'the 60fps overlay barely drew').toBeGreaterThan(30);
		expect(slow, 'the 10fps overlay drew at 60fps').toBeLessThan(fast / 2);
		expect(slow, 'the 10fps overlay drew nothing at all').toBeGreaterThan(0);
	});
});
