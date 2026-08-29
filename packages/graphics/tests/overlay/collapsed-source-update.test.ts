/**
 * A source that loses its pixels must be refused on update, not uploaded.
 *
 * `updateTexture` guards everything behind `if (size && previous)`, and
 * `elementSize` returns `null` for a zero-dimension element. So when a live
 * `<canvas>` collapses — a chart re-measuring, a panel closing, a resize to
 * height 0 — every one of those guards is skipped and execution falls straight
 * through to `texImage2D` with the empty element. It then returns
 * `{ success: true }` with no dimensions, and `settle()` never runs, so the
 * tracked byte count keeps describing the texture that used to be there.
 *
 * Three consequences, all silent:
 *
 * - the GPU is handed a zero-area upload and told it worked
 * - the memory accounting keeps the old figure for a texture that no longer
 *   has those pixels
 * - the `empty` refusal in `validateSize` is structurally unreachable from this
 *   path, because reaching it requires `size` to be non-null — which is exactly
 *   the case it exists to catch. Its handling at this call site is dead code.
 *
 * The creation path refuses this case. The update path did not, and the two
 * fixes that produced that state landed in one commit: `elementSize` gained the
 * `null`, and the `empty` guard was added to a validator the null now bypasses.
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

function sizedCanvas(width: number, height = width): HTMLCanvasElement {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	return canvas;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Register a healthy canvas, then collapse it and update. */
async function collapseAfterRegistering(
	collapse: (canvas: HTMLCanvasElement) => void,
	options: OverlayOptions = {}
) {
	const onError = vi.fn();
	const { api, fake } = overlay({ onError, ...options });
	const canvas = sizedCanvas(256);

	api.registerElement('a', canvas, {
		type: 'canvas',
		shader: 'wave-gentle-horizontal',
		updateStrategy: 'manual'
	});
	await settle();

	// Non-vacuity: the element has to be healthy before it can collapse.
	expect(api.getElement('a')?.texture, 'the element never uploaded in the first place').toBeDefined();
	expect(api.getElement('a')?.width).toBe(256);
	onError.mockClear();

	collapse(canvas);
	api.updateElement('a');
	await settle();

	return { api, fake, onError };
}

describe('a canvas that collapses to no pixels', () => {
	it('is refused rather than uploaded', async () => {
		const { onError } = await collapseAfterRegistering((canvas) => {
			canvas.height = 0;
		});

		expect(onError, 'a zero-area source was uploaded and reported as success').toHaveBeenCalled();
	});

	it('says the source has no pixels', async () => {
		// The same refusal the creation path gives, rather than a new phrasing
		// invented for this call site.
		const { onError } = await collapseAfterRegistering((canvas) => {
			canvas.height = 0;
		});

		expect(onError.mock.calls[0]?.[0]?.message).toMatch(/no pixels/i);
	});

	it('is refused when only the width collapses', async () => {
		// Both dimensions, not just the first — the asymmetry `elementSize` was
		// fixed for once already.
		const { onError } = await collapseAfterRegistering((canvas) => {
			canvas.width = 0;
		});

		expect(onError).toHaveBeenCalled();
	});

	it('keeps the dimensions it last had rather than reporting none', async () => {
		// Returning `{ success: true }` with no width or height let the tracked
		// size go undefined while the texture still held 256×256 of pixels.
		const { api } = await collapseAfterRegistering((canvas) => {
			canvas.height = 0;
		});

		expect(api.getElement('a')?.width).toBe(256);
		expect(api.getElement('a')?.height).toBe(256);
	});

	it('recovers when the source gets its pixels back', async () => {
		// A collapse is a wait, not a death. This is the same property the
		// creation path now has.
		const { api } = await collapseAfterRegistering((canvas) => {
			canvas.height = 0;
		});

		const element = api.getElement('a');
		expect(element).toBeDefined();
		const canvas = element!.element as HTMLCanvasElement;
		canvas.height = 128;
		api.updateElement('a');
		await settle();

		expect(api.getElement('a')?.height).toBe(128);
	});
});

describe('a healthy update still works', () => {
	it('re-uploads and re-measures a canvas that changed size', async () => {
		// The control for every arm above: refusing the empty case must not have
		// refused the ordinary one.
		const { api } = overlay();
		const canvas = sizedCanvas(256);

		api.registerElement('a', canvas, {
			type: 'canvas',
			shader: 'wave-gentle-horizontal',
			updateStrategy: 'manual'
		});
		await settle();

		canvas.width = 512;
		canvas.height = 512;
		api.updateElement('a');
		await settle();

		expect(api.getElement('a')?.width).toBe(512);
		expect(api.getElement('a')?.error).toBeUndefined();
	});
});
