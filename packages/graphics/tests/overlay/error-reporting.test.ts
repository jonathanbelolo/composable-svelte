/**
 * Every `OverlayErrorCode` a consumer can switch on must be producible.
 *
 * `efe8787` exported `OverlayError` and `OverlayErrorCode` as values precisely
 * so a consumer could narrow on `error.code`. Four of the nine members could
 * not arrive: three had factories with no callers anywhere, and the fourth —
 * `WEBGL_NOT_SUPPORTED` — belonged to an overlay that failed to construct, so
 * the `onError` that would have carried it was never reached.
 *
 * The worst of them was not missing but wrong. Every failed size validation
 * became `textureTooLarge`, including the ones caused by `memoryBudget`, so a
 * consumer who set a budget and hit it was told the texture exceeded the device
 * maximum and advised to reduce the image size.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { mount, unmount } from 'svelte';
import WebGLOverlay from '../../src/lib/overlay/WebGLOverlay.svelte';
import { createOverlay } from '../../src/lib/overlay/webgl-overlay.js';
import { OverlayError, OverlayErrorCode } from '../../src/lib/utils/overlay-error.js';
import type { OverlayContextAPI, OverlayOptions } from '../../src/lib/overlay/overlay-types.js';
import {
	createFakeGL,
	installFakeGL,
	installFakeObservers,
	type FakeGL
} from '../helpers/fake-gl.js';

let undo: Array<() => void> = [];
let mounted: Array<Record<string, unknown>> = [];

afterEach(() => {
	mounted.forEach((instance) => unmount(instance));
	mounted = [];
	undo.forEach((fn) => fn());
	undo = [];
	document.body.innerHTML = '';
	vi.restoreAllMocks();
});

function overlay(options: OverlayOptions = {}): { fake: FakeGL; api: OverlayContextAPI } {
	const fake = createFakeGL();
	undo.push(installFakeGL(fake), installFakeObservers());
	const api = createOverlay(options);
	if (!('destroy' in api)) throw new Error(`overlay failed to initialise: ${String(api)}`);
	return { fake, api };
}

function sizedCanvas(size: number): HTMLCanvasElement {
	const canvas = document.createElement('canvas');
	canvas.width = size;
	canvas.height = size;
	return canvas;
}

function loadedImage(size: number): HTMLImageElement {
	const img = document.createElement('img');
	Object.defineProperty(img, 'complete', { value: true });
	Object.defineProperty(img, 'naturalWidth', { value: size });
	Object.defineProperty(img, 'naturalHeight', { value: size });
	return img;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const MB = 1024 * 1024;
const codes = (onError: ReturnType<typeof vi.fn>) =>
	onError.mock.calls.map((call) => (call[0] as OverlayError).code);

describe('the budget and the size limit report themselves', () => {
	it('reports MEMORY_BUDGET_EXCEEDED when the budget is what refused it', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const onError = vi.fn();
		const { api } = overlay({ memoryBudget: 1 * MB, onError });

		// 1024² × 4 = 4MB, over a 1MB budget. Well inside the 4096px driver max.
		api.registerElement('a', loadedImage(1024), { type: 'image', shader: 'wave-gentle-horizontal' });
		await settle();

		expect(codes(onError)).toEqual([OverlayErrorCode.MEMORY_BUDGET_EXCEEDED]);
		api.destroy();
	});

	it('scales rather than refusing when only the size limit is exceeded', async () => {
		// This used to assert `TEXTURE_TOO_LARGE`, which was only reachable
		// because the canvas path refused outright while the image path scaled.
		// All four paths scale now, so a size failure always carries the
		// dimensions to scale to and no error reaches the consumer at all —
		// which is why that code no longer exists.
		const onError = vi.fn();
		const { api } = overlay({ maxTextureSize: 512, onError });

		api.registerElement('a', sizedCanvas(2048), { type: 'canvas', shader: 'wave-gentle-horizontal' });
		await settle();

		expect(onError, 'an oversize canvas was refused rather than scaled').not.toHaveBeenCalled();
		expect(api.getElement('a')?.width, 'the canvas was not scaled to the cap').toBe(512);
		expect(api.getElement('a')?.texture, 'no texture was created').toBeDefined();
		api.destroy();
	});

	it('scales an oversize video the same way', async () => {
		// The third path, and the one that was refusing alongside canvas.
		const onError = vi.fn();
		const { api } = overlay({ maxTextureSize: 512, onError });
		const video = document.createElement('video');
		Object.defineProperty(video, 'videoWidth', { value: 2048 });
		Object.defineProperty(video, 'videoHeight', { value: 2048 });
		Object.defineProperty(video, 'readyState', { value: 4 });

		api.registerElement('a', video, { type: 'video', shader: 'wave-gentle-horizontal' });
		await settle();

		expect(onError, 'an oversize video was refused rather than scaled').not.toHaveBeenCalled();
		expect(api.getElement('a')?.width).toBe(512);
		api.destroy();
	});
});

describe('CONTEXT_LOST', () => {
	it('reports a registration made while the context is gone', async () => {
		// It used to *refuse* it, which produced the code but dropped the
		// element: `recreateResources` rebuilds everything in `this.elements`,
		// and a refused registration never entered that map, so it was lost for
		// good. The README's own pattern registers from `img.onload`, which can
		// land inside a loss at any time.
		const onError = vi.fn();
		const { fake, api } = overlay({ onError });

		fake.canvas?.dispatchEvent(new Event('webglcontextlost'));

		const result = api.registerElement('a', loadedImage(64), {
			type: 'image',
			shader: 'wave-gentle-horizontal'
		});

		expect(result, 'the registration was refused rather than deferred').not.toBeInstanceOf(
			OverlayError
		);
		expect(codes(onError)).toEqual([OverlayErrorCode.CONTEXT_LOST]);
		expect(api.getElement('a'), 'the element was dropped instead of queued').toBeDefined();
		expect(api.getElement('a')?.texture, 'a texture was built on a dead context').toBeUndefined();
		api.destroy();
	});

	it('builds it when the context comes back', async () => {
		// The other half of the same defect, and the reason deferring beats
		// refusing.
		const onError = vi.fn();
		const { fake, api } = overlay({ onError });

		fake.canvas?.dispatchEvent(new Event('webglcontextlost'));
		api.registerElement('a', loadedImage(64), {
			type: 'image',
			shader: 'wave-gentle-horizontal'
		});
		fake.canvas?.dispatchEvent(new Event('webglcontextrestored'));
		await settle();

		expect(
			api.getElement('a')?.texture,
			'the restore never built the element registered during the loss'
		).toBeDefined();
		api.destroy();
	});

	it('accepts the same registration when the context is live', async () => {
		const onError = vi.fn();
		const { api } = overlay({ onError });

		const result = api.registerElement('a', loadedImage(64), {
			type: 'image',
			shader: 'wave-gentle-horizontal'
		});
		await settle();

		expect(result, 'a live context refused a registration').not.toBeInstanceOf(OverlayError);
		expect(onError).not.toHaveBeenCalled();
		api.destroy();
	});
});

describe('ELEMENT_NOT_FOUND', () => {
	it('reports every method called with an id that is not registered', () => {
		const onError = vi.fn();
		const { api } = overlay({ onError });

		api.unregisterElement('nope');
		api.updateElement('nope');
		api.updateUniforms('nope', { uTime: 1 });
		api.setShader('nope', 'ripple-gentle');

		expect(codes(onError)).toEqual([
			OverlayErrorCode.ELEMENT_NOT_FOUND,
			OverlayErrorCode.ELEMENT_NOT_FOUND,
			OverlayErrorCode.ELEMENT_NOT_FOUND,
			OverlayErrorCode.ELEMENT_NOT_FOUND
		]);
		api.destroy();
	});

	it('stays quiet for an id that is registered', async () => {
		const onError = vi.fn();
		const { api } = overlay({ onError });

		api.registerElement('a', sizedCanvas(64), { type: 'canvas', shader: 'wave-gentle-horizontal' });
		await settle();

		api.updateElement('a');
		api.updateUniforms('a', { uTime: 1 });

		expect(onError, 'a registered element was reported missing').not.toHaveBeenCalled();
		api.destroy();
	});
});

describe('every refusal reports, not just some', () => {
	it('reports a duplicate id', async () => {
		// Two of `registerElement`'s three refusals returned the error and
		// nothing else — no warning, no `onError` — against the method's own
		// docstring. A consumer saw silence unless they checked the return.
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const onError = vi.fn();
		const { api } = overlay({ onError });

		api.registerElement('a', loadedImage(64), { type: 'image', shader: 'wave-gentle-horizontal' });
		await settle();
		onError.mockClear();

		api.registerElement('a', loadedImage(64), { type: 'image', shader: 'wave-gentle-horizontal' });

		expect(codes(onError)).toEqual([OverlayErrorCode.INVALID_ELEMENT_TYPE]);
		api.destroy();
	});

	it('reports a registration on a destroyed overlay', () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const onError = vi.fn();
		const { api } = overlay({ onError });
		api.destroy();
		onError.mockClear();

		api.registerElement('a', loadedImage(64), { type: 'image', shader: 'wave-gentle-horizontal' });

		expect(codes(onError)).toEqual([OverlayErrorCode.INVALID_ELEMENT_TYPE]);
	});

	it('reports updateElement on an element that is not manual', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const onError = vi.fn();
		const { api } = overlay({ onError });

		// An image infers `static`, so `updateElement` does not service it.
		api.registerElement('a', loadedImage(64), { type: 'image', shader: 'wave-gentle-horizontal' });
		await settle();
		onError.mockClear();

		api.updateElement('a');

		expect(codes(onError)).toEqual([OverlayErrorCode.INVALID_ELEMENT_TYPE]);
		api.destroy();
	});

	it('stays quiet when the same calls are legitimate', async () => {
		// The paired half: reporting every refusal must not become reporting
		// every call.
		const onError = vi.fn();
		const { api } = overlay({ onError });

		api.registerElement('a', sizedCanvas(64), { type: 'canvas', shader: 'wave-gentle-horizontal' });
		await settle();
		api.updateElement('a');
		api.registerElement('b', loadedImage(64), { type: 'image', shader: 'wave-gentle-horizontal' });
		await settle();

		expect(onError, 'a legitimate registration or update was reported').not.toHaveBeenCalled();
		api.destroy();
	});
});

describe('an unknown preset name', () => {
	it('leaves a shader that updateUniforms can still reach', async () => {
		// The fallback left `registration.shader` as the unrecognised *string*,
		// and `updateUniforms` guards on `typeof … === 'object'` — so that
		// element's uniforms were a silent no-op for the rest of its life.
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const { api } = overlay();

		api.registerElement('a', loadedImage(64), { type: 'image', shader: 'no-such-preset' });
		await settle();

		api.updateUniforms('a', { uProbe: 7 });

		const shader = api.getElement('a')?.shader as { uniforms?: Record<string, number> };
		expect(typeof shader, 'the shader stayed an unrecognised string').toBe('object');
		expect(shader.uniforms?.uProbe, 'uniforms could not be set on the fallback').toBe(7);
		api.destroy();
	});
});

describe('the component reports what it used to swallow', () => {
	type Component = {
		registerElement(registration: {
			id: string;
			domElement: HTMLElement;
			shader: unknown;
		}): unknown;
	};

	function mountOverlay(options: OverlayOptions): Component {
		const target = document.createElement('div');
		document.body.appendChild(target);
		const api = mount(WebGLOverlay, { target, props: { options } }) as unknown as Component;
		mounted.push(api as unknown as Record<string, unknown>);
		return api;
	}

	it('calls onError when WebGL is unavailable', async () => {
		// The overlay is never constructed, so nothing inside it can report —
		// the component has to. Without this, `WEBGL_NOT_SUPPORTED` had no
		// programmatic signal at all.
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const original = HTMLCanvasElement.prototype.getContext;
		HTMLCanvasElement.prototype.getContext = (() => null) as typeof original;
		undo.push(() => {
			HTMLCanvasElement.prototype.getContext = original;
		});
		undo.push(installFakeObservers());

		const onError = vi.fn();
		mountOverlay({ onError });
		await settle();

		expect(codes(onError)).toEqual([OverlayErrorCode.WEBGL_NOT_SUPPORTED]);
	});

	it('reports an element it cannot render, and hands the error back', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const fake = createFakeGL();
		undo.push(installFakeGL(fake), installFakeObservers());

		const onError = vi.fn();
		const api = mountOverlay({ onError });
		await settle();

		const result = api.registerElement({
			id: 'a',
			domElement: document.createElement('div'),
			shader: 'ripple-gentle'
		});

		expect(result).toBeInstanceOf(OverlayError);
		expect(codes(onError)).toEqual([OverlayErrorCode.INVALID_ELEMENT_TYPE]);
	});
});

describe('a deferred registration delivers everything an immediate one does', () => {
	// The rule this whole describe exists for: a path that *defers* work owes
	// the same outcomes as the path that does it immediately — not just the
	// primary artefact. `a5edee8` delivered the texture and nothing else, and
	// its test asserted the texture and stopped, which is one assertion short of
	// the mechanism.

	it('fires onTextureLoaded, once, after the restore', async () => {
		// It never fired at all: `onTextureLoaded` was a parameter of
		// `createElementTexture`, and `recreateResources` calls that with no
		// callback. In `examples/shader-gallery` this callback fades the DOM
		// image out, so an image registered inside a loss window kept its opaque
		// copy over the WebGL result for the life of the page.
		const onTextureLoaded = vi.fn();
		const { fake, api } = overlay();

		fake.canvas?.dispatchEvent(new Event('webglcontextlost'));
		api.registerElement('a', loadedImage(64), {
			type: 'image',
			shader: 'wave-gentle-horizontal',
			onTextureLoaded
		});
		await settle();
		expect(onTextureLoaded, 'it fired while the context was gone').not.toHaveBeenCalled();

		fake.canvas?.dispatchEvent(new Event('webglcontextrestored'));
		await settle();

		expect(onTextureLoaded, 'the rebuild never told the consumer').toHaveBeenCalledTimes(1);
		api.destroy();
	});

	it('does not fire it again on a second restore', async () => {
		// "Called once the texture actually exists" must not become once per
		// restore — the paired half of carrying the callback forward.
		const onTextureLoaded = vi.fn();
		const { fake, api } = overlay();

		fake.canvas?.dispatchEvent(new Event('webglcontextlost'));
		api.registerElement('a', loadedImage(64), {
			type: 'image',
			shader: 'wave-gentle-horizontal',
			onTextureLoaded
		});
		fake.canvas?.dispatchEvent(new Event('webglcontextrestored'));
		await settle();

		fake.canvas?.dispatchEvent(new Event('webglcontextlost'));
		fake.canvas?.dispatchEvent(new Event('webglcontextrestored'));
		await settle();

		expect(onTextureLoaded, 'the callback fired once per restore').toHaveBeenCalledTimes(1);
		api.destroy();
	});

	it('keeps uniforms set during the loss', async () => {
		// `compileElementShader` is the only thing that resolves a preset *name*
		// into an object, and `updateUniforms` guards on
		// `typeof shader === 'object'` — so during the loss it did nothing, and
		// the restore then resolved the preset afresh and discarded the value.
		const { fake, api } = overlay();

		fake.canvas?.dispatchEvent(new Event('webglcontextlost'));
		api.registerElement('a', loadedImage(64), {
			type: 'image',
			shader: 'ripple-gentle'
		});
		api.updateUniforms('a', { uAmplitude: 0.9 });

		const during = api.getElement('a')?.shader as { uniforms?: Record<string, number> };
		expect(typeof during, 'the shader stayed an unresolved preset name').toBe('object');
		expect(during.uniforms?.uAmplitude, 'the uniform never landed').toBe(0.9);

		fake.canvas?.dispatchEvent(new Event('webglcontextrestored'));
		await settle();

		const after = api.getElement('a')?.shader as { uniforms: Record<string, number> };
		expect(after.uniforms.uAmplitude, 'the restore discarded the value').toBe(0.9);
		api.destroy();
	});

	it('leaves no orphaned texture when two restores arrive together', async () => {
		// `createElementTexture` is async and unawaited and guarded only on
		// registration identity, which `recreateResources` reuses — so both
		// creations assigned and the first handle was never deleted.
		//
		// The element is registered *during* the loss deliberately. Registering
		// first and then losing the context leaves a pre-loss handle that the
		// restore abandons without deleting — correct, since every GL object
		// from a dead context is already invalid — but the fake counts it as
		// live, so `live('texture')` is not a valid oracle across that sequence.
		const { fake, api } = overlay();

		fake.canvas?.dispatchEvent(new Event('webglcontextlost'));
		api.registerElement('a', loadedImage(64), { type: 'image', shader: 'ripple-gentle' });

		fake.canvas?.dispatchEvent(new Event('webglcontextrestored'));
		fake.canvas?.dispatchEvent(new Event('webglcontextrestored'));
		await settle();

		expect(fake.created('texture'), 'only one rebuild ran').toBeGreaterThan(1);

		api.destroy();
		expect(fake.live('texture'), 'a rebuild orphaned a texture').toBe(0);
	});

	it('still owes the callback when a rebuild is superseded before it delivers', async () => {
		// The generation guard and the deferred callback were added in one
		// commit and interfered. `recreateResources` read `pendingTextureLoaded`
		// and *deleted* it before starting the async creation, so when a second
		// restore superseded the first, rebuild #1 returned at the generation
		// check without firing and rebuild #2 had been handed `undefined`. The
		// texture appeared; the consumer was never told, for the life of the
		// page. That is the shader-gallery symptom the deferral exists to close.
		//
		// The two restores must land in the *same task* — an `await settle()`
		// between them lets rebuild #1 finish and the defect cannot occur.
		const onTextureLoaded = vi.fn();
		const { fake, api } = overlay();

		fake.canvas?.dispatchEvent(new Event('webglcontextlost'));
		api.registerElement('a', loadedImage(64), {
			type: 'image',
			shader: 'ripple-gentle',
			onTextureLoaded
		});

		fake.canvas?.dispatchEvent(new Event('webglcontextrestored'));
		fake.canvas?.dispatchEvent(new Event('webglcontextrestored'));
		await settle();

		// Non-vacuity first: the texture really did arrive, so a silent
		// callback is a dropped debt and not simply a rebuild that never ran.
		expect(api.getElement('a')?.texture, 'no texture was built at all').toBeDefined();
		expect(onTextureLoaded, 'a superseded rebuild swallowed the callback').toHaveBeenCalledTimes(
			1
		);
		api.destroy();
	});

	it('still owes the callback when a rebuild fails to deliver', async () => {
		// The other half: consuming the debt up front also lost it whenever the
		// creation simply failed. The consumer is still owed — a later restore
		// must honour it.
		const onTextureLoaded = vi.fn();
		const { fake, api } = overlay();

		fake.canvas?.dispatchEvent(new Event('webglcontextlost'));
		api.registerElement('a', loadedImage(64), {
			type: 'image',
			shader: 'ripple-gentle',
			onTextureLoaded
		});

		// Fail the first rebuild's upload, and only that one.
		const realCreateTexture = fake.context.createTexture.bind(fake.context);
		let failNext = true;
		// `null` is what real GL returns when it cannot allocate, and what
		// `TextureFactory` branches on — but `WebGLRenderingContext` types the
		// return as non-nullable, so the cast is the lie and the runtime is
		// right.
		fake.context.createTexture = (() => {
			if (failNext) {
				failNext = false;
				return null;
			}
			return realCreateTexture();
		}) as typeof fake.context.createTexture;

		fake.canvas?.dispatchEvent(new Event('webglcontextrestored'));
		await settle();
		expect(onTextureLoaded, 'a failed rebuild reported success').not.toHaveBeenCalled();
		expect(api.getElement('a')?.texture, 'the failure did not actually fail').toBeUndefined();

		fake.canvas?.dispatchEvent(new Event('webglcontextrestored'));
		await settle();

		expect(api.getElement('a')?.texture, 'the retry built no texture').toBeDefined();
		expect(onTextureLoaded, 'the debt was dropped by the failed rebuild').toHaveBeenCalledTimes(1);
		api.destroy();
	});

	it('does not credit the memory budget when a rebuild is superseded', async () => {
		// The generation guard deallocated against `this.textureFactory` — which
		// `recreateResources` had already replaced with one whose accounting
		// starts at zero. So the superseded texture's bytes were subtracted from
		// a factory that never allocated them, and the budget gained room for
		// textures it could not afford. Handing a GPU-handle leak back as a
		// budget hole is not a fix.
		const onError = vi.fn();
		const { fake, api } = overlay({ memoryBudget: 5 * MB, onError });

		fake.canvas?.dispatchEvent(new Event('webglcontextlost'));
		// 1000x1000x4 = 4MB, so a second one cannot fit under a 5MB ceiling.
		api.registerElement('a', sizedCanvas(1000), { type: 'canvas', shader: 'ripple-gentle' });

		fake.canvas?.dispatchEvent(new Event('webglcontextrestored'));
		fake.canvas?.dispatchEvent(new Event('webglcontextrestored'));
		await settle();

		// Non-vacuity: the first element must actually hold its 4MB, or the
		// refusal below would be trivially satisfied by an empty budget.
		expect(api.getElement('a')?.texture, 'the first element never got a texture').toBeDefined();
		expect(api.getElement('a')?.width, 'no bytes are being tracked for it').toBe(1000);

		api.registerElement('b', sizedCanvas(1000), { type: 'canvas', shader: 'ripple-gentle' });
		await settle();

		expect(codes(onError), '8MB was accepted against a 5MB ceiling').toContain(
			OverlayErrorCode.MEMORY_BUDGET_EXCEEDED
		);
		api.destroy();
	});

	it('refuses instead of deferring when automatic recovery is off', async () => {
		// `recreateResources` runs only under `handleContextLoss`, so deferring
		// on that branch left the element dead forever *and* its id taken — the
		// natural retry was refused as a duplicate.
		const onError = vi.fn();
		const { fake, api } = overlay({ handleContextLoss: false, onError });

		fake.canvas?.dispatchEvent(new Event('webglcontextlost'));
		const refused = api.registerElement('a', loadedImage(64), {
			type: 'image',
			shader: 'wave-gentle-horizontal'
		});

		expect(refused).toBeInstanceOf(OverlayError);
		expect(codes(onError)).toEqual([OverlayErrorCode.CONTEXT_LOST]);
		expect(api.getElement('a'), 'a dead element was left holding the id').toBeUndefined();

		// And the id is free, so a retry after the restore works.
		fake.canvas?.dispatchEvent(new Event('webglcontextrestored'));
		onError.mockClear();
		api.registerElement('a', loadedImage(64), { type: 'image', shader: 'wave-gentle-horizontal' });
		await settle();

		expect(onError, 'the retry was refused as a duplicate').not.toHaveBeenCalled();
		expect(api.getElement('a')?.texture).toBeDefined();
		api.destroy();
	});

	it('reports updateElementPosition for an id that is not registered', () => {
		const onError = vi.fn();
		const { api } = overlay({ onError });

		api.updateElementPosition('nope');

		expect(codes(onError)).toEqual([OverlayErrorCode.ELEMENT_NOT_FOUND]);
		api.destroy();
	});
});
