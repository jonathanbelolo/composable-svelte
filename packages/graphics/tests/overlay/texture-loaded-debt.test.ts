/**
 * The lifecycle of an owed `onTextureLoaded`, which nothing tested.
 *
 * `owedTextureLoaded` is written when an element registers with a callback,
 * deleted when the element unregisters, deleted again when a creation finally
 * succeeds, and read by both the retry path and the post-context-loss rebuild.
 * The name appeared in no test in this package.
 *
 * That was survivable while the debt was recorded only on the context-lost
 * branch — a rare path, and the map stayed nearly empty. It stopped being
 * survivable when the retry fix started recording it for *every* element that
 * registers with a callback: a deletion that failed would strand one callback
 * per element for the overlay's life, and an id that came back could inherit
 * its predecessor's.
 *
 * **The strand is narrower than it sounds, and these tests are shaped by that.**
 * Two other writes hide it. Registering with a callback *overwrites* the entry,
 * so a replacement that brings its own callback never sees the stale one; and a
 * successful creation *deletes* the entry, so a replacement that loads cleanly
 * clears it on the way past. What is left is the case where an id comes back
 * without a callback and is refused at creation — an image registered before it
 * decodes, a canvas measured before layout. Then the stale callback is still
 * there when the element recovers, and it fires for a consumer that is gone.
 *
 * So the two arms that can actually see a leak both go through that case, once
 * by the retry path and once by the rebuild path. The obvious-looking test — two
 * registrations, two callbacks, assert the first stays quiet — cannot fail, and
 * is written below as the overwrite property it really is rather than passed off
 * as a guard.
 *
 * The other half of the lifecycle — a debt surviving a failed creation and being
 * consumed by the later success — is covered in `failed-creation-recovery.test.ts`
 * rather than repeated here.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { createOverlay } from '../../src/lib/overlay/webgl-overlay.js';
import type { OverlayContextAPI, OverlayOptions } from '../../src/lib/overlay/overlay-types.js';
import {
	createFakeGL,
	installFakeGL,
	installFakeObservers,
	type FakeGL
} from '../helpers/fake-gl.js';

let undo: Array<() => void> = [];
afterEach(() => {
	undo.forEach((fn) => fn());
	undo = [];
	vi.restoreAllMocks();
});

function overlay(options: OverlayOptions = {}): { fake: FakeGL; api: OverlayContextAPI } {
	const fake = createFakeGL();
	undo.push(installFakeGL(fake), installFakeObservers());
	const api = createOverlay(options);
	if (!('destroy' in api)) throw new Error(`overlay failed to initialise: ${String(api)}`);
	return { fake, api };
}

/** A canvas with no area — refused, so the callback stays owed. */
function unlaidOutCanvas(): HTMLCanvasElement {
	const canvas = document.createElement('canvas');
	canvas.width = 0;
	canvas.height = 0;
	return canvas;
}

function sizedCanvas(width: number, height = width): HTMLCanvasElement {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	return canvas;
}

const CANVAS = { type: 'canvas', shader: 'wave-gentle-horizontal' } as const;
const MANUAL = { ...CANVAS, updateStrategy: 'manual' } as const;

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Leave a debt behind, then bring the id back without a callback and refused.
 *
 * This is the only state from which a stranded callback is reachable, so every
 * leak arm starts here. Returns the departed element's callback and the canvas
 * the replacement is holding, still empty.
 */
async function strandedDebt(api: OverlayContextAPI) {
	const departed = vi.fn();
	api.registerElement('a', unlaidOutCanvas(), { ...MANUAL, onTextureLoaded: departed });
	await settle();
	// Non-vacuity: if the refusal owed nothing, there would be no debt to strand
	// and every arm below would pass against a system that never recorded one.
	expect(departed, 'the refused registration reported success').not.toHaveBeenCalled();

	api.unregisterElement('a');
	await settle();

	// Back under the same id, with no callback of its own and nothing to
	// overwrite the entry with, and refused so nothing deletes it either.
	const canvas = unlaidOutCanvas();
	api.registerElement('a', canvas, MANUAL);
	await settle();
	expect(api.getElement('a')?.texture, 'the replacement was not refused').toBeUndefined();

	return { departed, canvas };
}

describe('a debt does not outlive its element', () => {
	it('is not paid to a departed consumer when the id recovers', async () => {
		// The retry route. `handleElementUpdate` reads the map by id, so a debt
		// left behind by `unregisterElement` is handed to whatever holds that id
		// next.
		const { api } = overlay();
		const { departed, canvas } = await strandedDebt(api);

		canvas.width = 64;
		canvas.height = 64;
		api.updateElement('a');
		await settle();

		// The precondition for the assertion below: the retry has to have got
		// somewhere, or "nothing fired" is true of a texture that never arrived.
		expect(api.getElement('a')?.texture, 'the element never recovered').toBeDefined();
		expect(
			departed,
			"the previous element's callback fired for its replacement"
		).not.toHaveBeenCalled();
	});

	it('is not paid to a departed consumer after a context restore', async () => {
		// The rebuild route, which reads the same map. Independent of the retry:
		// `recreateResources` walks the live elements and creates each texture
		// afresh, so an id that came back inherits the strand here too.
		const { api, fake } = overlay();
		const { departed, canvas } = await strandedDebt(api);

		canvas.width = 64;
		canvas.height = 64;

		const glCanvas = fake.canvas!;
		glCanvas.dispatchEvent(new Event('webglcontextlost'));
		glCanvas.dispatchEvent(new Event('webglcontextrestored'));
		await settle();

		expect(api.getElement('a')?.texture, 'the rebuild created nothing').toBeDefined();
		expect(departed, "the previous element's callback fired after a restore").not.toHaveBeenCalled();
	});
});

describe('the writes that hide the strand', () => {
	// Recorded as the properties they are. Neither guards the deletion — both
	// pass whether or not unregister drops the debt — and saying so here is what
	// keeps a later reader from mistaking them for coverage.
	it('a replacement with its own callback overwrites the entry', async () => {
		const { api } = overlay();
		const first = vi.fn();
		const second = vi.fn();

		api.registerElement('a', unlaidOutCanvas(), { ...MANUAL, onTextureLoaded: first });
		await settle();
		api.unregisterElement('a');
		await settle();

		api.registerElement('a', sizedCanvas(64), { ...CANVAS, onTextureLoaded: second });
		await settle();

		expect(second, 'the replacement was never told').toHaveBeenCalledTimes(1);
		expect(first).not.toHaveBeenCalled();
	});

	it('a creation that succeeds clears what it was owed', async () => {
		const { api } = overlay();
		const onTextureLoaded = vi.fn();

		api.registerElement('a', sizedCanvas(64), { ...MANUAL, onTextureLoaded });
		await settle();
		expect(onTextureLoaded, 'the debt was never paid').toHaveBeenCalledTimes(1);

		for (let i = 0; i < 3; i += 1) {
			api.updateElement('a');
			await settle();
		}

		expect(onTextureLoaded, 'a paid debt was collected twice').toHaveBeenCalledTimes(1);
	});
});

describe('destroy', () => {
	it('does not pay a pending debt on the way out', async () => {
		// A behaviour check, not a guard on the deletion: the map dies with the
		// overlay, so an entry stranded at `destroy()` is unobservable and inert.
		// What this pins is that tearing down does not *fire* what it never
		// delivered — a consumer whose element was refused must not be told its
		// texture arrived because the overlay closed.
		const { api } = overlay();
		const onTextureLoaded = vi.fn();

		api.registerElement('a', unlaidOutCanvas(), { ...MANUAL, onTextureLoaded });
		await settle();

		api.destroy();
		await settle();

		expect(onTextureLoaded).not.toHaveBeenCalled();
	});

	it('frees the textures of an element that did load', async () => {
		// The leak oracle the overlay's lifetime suites use, applied to the same
		// lifecycle: a debt is bookkeeping, a texture is a handle, and an element
		// that unregisters should leave neither.
		const { api, fake } = overlay();

		api.registerElement('a', sizedCanvas(64), { ...CANVAS, onTextureLoaded: vi.fn() });
		await settle();
		expect(fake.live('texture'), 'nothing was created to free').toBe(1);

		api.destroy();
		await settle();

		expect(fake.live('texture')).toBe(0);
	});
});
