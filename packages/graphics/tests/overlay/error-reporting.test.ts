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

	it('still reports TEXTURE_TOO_LARGE when the size limit is', async () => {
		// The paired half, and it has to be a canvas: the image path auto-scales
		// an oversize texture instead of refusing it, so the size error is only
		// reachable for video and canvas.
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const onError = vi.fn();
		const { api } = overlay({ maxTextureSize: 512, onError });

		api.registerElement('a', sizedCanvas(2048), { type: 'canvas', shader: 'wave-gentle-horizontal' });
		await settle();

		expect(codes(onError)).toEqual([OverlayErrorCode.TEXTURE_TOO_LARGE]);
		api.destroy();
	});
});

describe('CONTEXT_LOST', () => {
	it('refuses a registration made while the context is gone', async () => {
		const onError = vi.fn();
		const { fake, api } = overlay({ onError });

		fake.canvas?.dispatchEvent(new Event('webglcontextlost'));

		const result = api.registerElement('a', loadedImage(64), {
			type: 'image',
			shader: 'wave-gentle-horizontal'
		});

		expect(result).toBeInstanceOf(OverlayError);
		expect(codes(onError)).toEqual([OverlayErrorCode.CONTEXT_LOST]);
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
