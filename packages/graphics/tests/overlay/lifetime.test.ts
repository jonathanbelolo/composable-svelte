/**
 * The overlay must not outlive itself — on the failure path either.
 *
 * `ed5cb3c` fixed the listener leaks on the success path: `destroy()` releases
 * what a constructed overlay took. Nothing covered the case where construction
 * itself fails, and there the leak was total — `createOverlay` catches the
 * throw and returns an `OverlayError`, so the half-built instance, and the
 * `destroy()` that would have cleaned it up, are unreachable by anyone.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { createOverlay } from '../../src/lib/overlay/webgl-overlay.js';
import { OverlayError } from '../../src/lib/utils/overlay-error.js';
import type { OverlayContextAPI } from '../../src/lib/overlay/overlay-types.js';
import { createFakeGL, installFakeGL, installFakeObservers } from '../helpers/fake-gl.js';

let undo: Array<() => void> = [];
afterEach(() => {
	undo.forEach((fn) => fn());
	undo = [];
	vi.restoreAllMocks();
});

/** Count listeners on a target, by event name, across add/remove. */
function listenerCounter(target: EventTarget): { live: (event: string) => number } {
	const counts = new Map<string, number>();
	const add = target.addEventListener.bind(target);
	const remove = target.removeEventListener.bind(target);
	const bump = (event: string, by: number) => counts.set(event, (counts.get(event) ?? 0) + by);

	target.addEventListener = (
		event: string,
		listener: EventListenerOrEventListenerObject | null,
		options?: boolean | AddEventListenerOptions
	) => {
		bump(event, 1);
		add(event, listener, options);
	};
	target.removeEventListener = (
		event: string,
		listener: EventListenerOrEventListenerObject | null,
		options?: boolean | EventListenerOptions
	) => {
		bump(event, -1);
		remove(event, listener, options);
	};

	undo.push(() => {
		target.addEventListener = add;
		target.removeEventListener = remove;
	});
	return { live: (event) => counts.get(event) ?? 0 };
}

describe('a construction that fails leaves nothing behind', () => {
	it('releases its listeners when the position tracker cannot be built', () => {
		// `PositionTracker` constructs an `IntersectionObserver` and a
		// `ResizeObserver` unconditionally. Without the observer stubs they do
		// not exist under jsdom, which is exactly the throw this unwinds.
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const fake = createFakeGL();
		undo.push(installFakeGL(fake));

		const canvas = document.createElement('canvas');
		const onDocument = listenerCounter(document);
		const onCanvas = listenerCounter(canvas);

		const result = createOverlay({ canvas });

		expect(result, 'the overlay constructed despite a missing observer').toBeInstanceOf(
			OverlayError
		);
		expect(onDocument.live('visibilitychange'), 'the render loop kept its listener').toBe(0);
		expect(onCanvas.live('webglcontextlost'), 'the context manager kept its listeners').toBe(0);
		expect(onCanvas.live('webglcontextrestored')).toBe(0);
	});

	it('still registers them when construction succeeds', () => {
		// The paired half: unwinding on failure must not unwind on success.
		const fake = createFakeGL();
		undo.push(installFakeGL(fake), installFakeObservers());

		const canvas = document.createElement('canvas');
		const onDocument = listenerCounter(document);
		const onCanvas = listenerCounter(canvas);

		const api = createOverlay({ canvas }) as OverlayContextAPI;

		expect(onDocument.live('visibilitychange'), 'the render loop never listened').toBe(1);
		expect(onCanvas.live('webglcontextlost')).toBe(1);
		api.destroy();
	});
});

describe('destroy() releases the GPU context', () => {
	it('loses the context it was drawing with', async () => {
		// This asserted that `getExtension` had been *reached*, which is one
		// step short of the mechanism: making `destroy()` fetch the extension
		// and never call `loseContext()` passed. The fake now records the call
		// itself, so the assertion can be about the thing that matters.
		const fake = createFakeGL();
		undo.push(installFakeGL(fake), installFakeObservers());

		const canvas = document.createElement('canvas');
		const api = createOverlay({ canvas }) as OverlayContextAPI;
		fake.clearCalls();

		api.destroy();

		expect(
			fake.calls.filter((name) => name === 'loseContext'),
			'the overlay kept a context nobody could reach'
		).toHaveLength(1);
	});

	it('does not lose it before the handlers are gone', async () => {
		// The paired half, and the reason `ed5cb3c` exists: `loseContext()`
		// dispatches `webglcontextlost` synchronously, so releasing before
		// `contextManager.destroy()` re-enters the consumer's callback on an
		// overlay they have just torn down.
		const fake = createFakeGL();
		undo.push(installFakeGL(fake), installFakeObservers());

		const canvas = document.createElement('canvas');
		const onContextLost = vi.fn();
		const api = createOverlay({ canvas, onContextLost }) as OverlayContextAPI;

		api.destroy();

		expect(onContextLost, 'destroy() called back into a destroyed overlay').not.toHaveBeenCalled();
	});
});

describe('the support probe releases its own context', () => {
	it('loses the throwaway context it created', () => {
		// `checkWebGLSupport` runs once per `createOverlay` and never freed the
		// context it made. Browsers cap live contexts and force-lose the oldest,
		// so an app that mounts and unmounts the overlay enough times has its own
		// live context killed by its own support checks.
		const fake = createFakeGL();
		undo.push(installFakeGL(fake), installFakeObservers());

		const canvas = document.createElement('canvas');
		const api = createOverlay({ canvas }) as OverlayContextAPI;

		expect(
			fake.calls.filter((name) => name === 'loseContext'),
			'the probe context was never released'
		).not.toHaveLength(0);
		api.destroy();
	});
});

describe('a failed rebuild does not credit the budget', () => {
	it('keeps the accounting describing the textures that exist', async () => {
		// `recreateResources` installs a fresh `TextureFactory` whose accounting
		// starts at zero, and used to leave every registration's stale texture
		// handle and dimensions in place. If the rebuild's texture creation then
		// failed, `unregisterElement` deallocated bytes this factory never
		// allocated — so the budget silently gained room for textures it could
		// not afford.
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const fake = createFakeGL();
		undo.push(installFakeGL(fake), installFakeObservers());

		const canvas = document.createElement('canvas');
		const onError = vi.fn();
		// 6MB budget: two 1024² textures (4MB each) cannot both fit.
		const api = createOverlay({ canvas, memoryBudget: 6 * 1024 * 1024, onError }) as OverlayContextAPI;

		const image = (id: string) => {
			const img = document.createElement('img');
			Object.defineProperty(img, 'complete', { value: true });
			Object.defineProperty(img, 'naturalWidth', { value: 1024 });
			Object.defineProperty(img, 'naturalHeight', { value: 1024 });
			img.id = id;
			return img;
		};
		const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

		api.registerElement('a', image('a'), { type: 'image', shader: 'wave-gentle-horizontal' });
		await settle();

		// Lose and restore with texture creation broken, so a's rebuild fails
		// and leaves the registration with no texture.
		const createTexture = fake.context.createTexture.bind(fake.context);
		(fake.context as unknown as Record<string, unknown>).createTexture = () => null;
		canvas.dispatchEvent(new Event('webglcontextlost'));
		canvas.dispatchEvent(new Event('webglcontextrestored'));
		await settle();
		(fake.context as unknown as Record<string, unknown>).createTexture = createTexture;

		api.registerElement('b', image('b'), { type: 'image', shader: 'wave-gentle-horizontal' });
		await settle();
		expect(api.getElement('b')?.texture, 'b could not be created at all').toBeDefined();

		api.unregisterElement('a');
		onError.mockClear();

		// b's 4MB is still live, so c's 4MB must not fit in a 6MB budget.
		api.registerElement('c', image('c'), { type: 'image', shader: 'wave-gentle-horizontal' });
		await settle();

		expect(api.getElement('c')?.texture, 'the budget was credited for a texture that failed').toBeUndefined();
		api.destroy();
	});
});
