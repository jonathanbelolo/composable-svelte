/**
 * `onTextureLoaded` must mean the texture loaded.
 *
 * `WebGLOverlay.svelte` fired it from a fixed `setTimeout(…, 100)`, under its
 * own TODO saying so. Registration returns synchronously and the texture
 * resolves later, so the callback fired on CORS rejection, on an oversize
 * texture, on an unloaded image — and early for anything slower than 100ms.
 *
 * The defect was in the component, and for a while every test here drove
 * `createOverlay` instead. Re-inserting the exact `setTimeout` left the whole
 * suite green, as did deleting the line that forwards the callback at all. The
 * core tests are still worth having — they are where the success and failure
 * branches live — but the component has its own describe at the bottom now,
 * and that is the one the defect could not survive.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { mount, unmount } from 'svelte';
import WebGLOverlay from '../../src/lib/overlay/WebGLOverlay.svelte';
import { createOverlay } from '../../src/lib/overlay/webgl-overlay.js';
import type { OverlayContextAPI } from '../../src/lib/overlay/overlay-types.js';
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

function overlay(): { fake: FakeGL; api: OverlayContextAPI } {
	const fake = createFakeGL();
	undo.push(installFakeGL(fake), installFakeObservers());
	const api = createOverlay({});
	if (!('destroy' in api)) throw new Error(`overlay failed to initialise: ${String(api)}`);
	return { fake, api };
}

const loadedImage = (): HTMLImageElement => {
	const img = document.createElement('img');
	Object.defineProperty(img, 'complete', { value: true });
	Object.defineProperty(img, 'naturalWidth', { value: 64 });
	Object.defineProperty(img, 'naturalHeight', { value: 64 });
	return img;
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('onTextureLoaded', () => {
	it('fires when the texture is actually created', async () => {
		const onTextureLoaded = vi.fn();
		const { api } = overlay();

		api.registerElement('a', loadedImage(), {
			type: 'image',
			shader: 'wave-gentle-horizontal',
			onTextureLoaded
		});
		await settle();

		expect(onTextureLoaded, 'a successful load reported nothing').toHaveBeenCalledTimes(1);
		api.destroy();
	});

	it('does not fire when the texture fails', async () => {
		// The half the timer got wrong. An `<img>` that never loaded fails in
		// `createImageTexture`, and the consumer used to be told it had loaded
		// 100ms later regardless.
		const onTextureLoaded = vi.fn();
		const { api } = overlay();

		api.registerElement('a', document.createElement('img'), {
			type: 'image',
			shader: 'wave-gentle-horizontal',
			onTextureLoaded
		});
		await settle();

		expect(onTextureLoaded, 'a failed load was reported as success').not.toHaveBeenCalled();
		api.destroy();
	});

	it('does not fire for an element unregistered before the texture resolved', async () => {
		const onTextureLoaded = vi.fn();
		const { api } = overlay();

		api.registerElement('a', loadedImage(), {
			type: 'image',
			shader: 'wave-gentle-horizontal',
			onTextureLoaded
		});
		api.unregisterElement('a');
		await settle();

		expect(onTextureLoaded, 'a discarded element reported a load').not.toHaveBeenCalled();
		api.destroy();
	});
});

describe('the component forwards it rather than timing it', () => {
	type Component = {
		registerElement(registration: {
			id: string;
			domElement: HTMLElement;
			shader: unknown;
			onTextureLoaded?: () => void;
		}): void;
	};

	async function component(): Promise<{ fake: FakeGL; api: Component }> {
		const fake = createFakeGL();
		undo.push(installFakeGL(fake), installFakeObservers());
		const target = document.createElement('div');
		document.body.appendChild(target);
		const api = mount(WebGLOverlay, { target }) as unknown as Component;
		mounted.push(api as unknown as Record<string, unknown>);
		await settle();
		return { fake, api };
	}

	it('reports a load exactly once', async () => {
		// Once, not twice: a component that both forwards the callback and
		// keeps its own timer would fire it again 100ms later.
		const onTextureLoaded = vi.fn();
		const { api } = await component();

		api.registerElement({
			id: 'a',
			domElement: loadedImage(),
			shader: 'wave-gentle-horizontal',
			onTextureLoaded
		});
		await new Promise((resolve) => setTimeout(resolve, 200));

		expect(onTextureLoaded, 'the component did not forward the callback').toHaveBeenCalledTimes(1);
	});

	it('stays silent when the texture never loads, however long you wait', async () => {
		// The timer's actual behaviour, and the reason it was wrong: an <img>
		// that never loaded reported success 100ms later regardless. Waiting
		// past that is the whole test.
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const onTextureLoaded = vi.fn();
		const { api } = await component();

		api.registerElement({
			id: 'a',
			domElement: document.createElement('img'),
			shader: 'wave-gentle-horizontal',
			onTextureLoaded
		});
		await new Promise((resolve) => setTimeout(resolve, 200));

		expect(onTextureLoaded, 'a failed load was reported as a success').not.toHaveBeenCalled();
	});
});
